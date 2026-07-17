import os
import json
from groq import Groq

class FieldMappingAgent:
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")

    def map_fields(self, form_fields: list, profile: dict) -> dict:
        """
        Maps a list of dynamically discovered form fields to keys in the master user profile.
        Uses a classification logic with a Groq assistant fallback for unrecognized complex field keys.
        """
        mapping_result = {}
        unrecognized_fields = []

        profile_keys = list(profile.keys())

        # Standard heuristics first
        for field in form_fields:
            label = field.get("label", "").lower()
            name = field.get("name", "").lower()
            el_id = field.get("id", "").lower()
            
            key_identifier = label or name or el_id
            classification = self._heuristics_classify(key_identifier)
            
            if classification:
                mapping_result[field["id"]] = classification
            else:
                unrecognized_fields.append(field)

        # If there are unrecognized fields, run the LLM mapping assistant
        if unrecognized_fields and self.api_key:
            client = Groq(api_key=self.api_key)
            prompt = f"""
            Identify which user profile attribute matches each form field in the list:
            
            Available Profile Keys:
            {profile_keys}
            
            Unrecognized Form Fields:
            {unrecognized_fields}
            
            Return a JSON mapping of each field's "id" to one of the Profile Keys or "unknown".
            Output ONLY raw JSON format. No markdown blocks.
            """
            
            try:
                completion = client.chat.completions.create(
                    model="llama-3.3-70b-versatile",
                    messages=[
                        {"role": "system", "content": "You are a database integration assistant. Match inputs to database columns."},
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.1,
                    response_format={"type": "json_object"}
                )
                llm_map = json.loads(completion.choices[0].message.content.strip())
                for field_id, matched_key in llm_map.items():
                    if matched_key != "unknown" and matched_key in profile_keys:
                        mapping_result[field_id] = matched_key
            except Exception as e:
                print(f"[FieldMappingAgent] LLM fallback matching error: {e}")

        return mapping_result

    def _heuristics_classify(self, text: str) -> str:
        t = text.lower()
        if "first name" in t:
            return "first_name"
        elif "last name" in t:
            return "last_name"
        elif "full name" in t or "candidate name" in t or "name" in t:
            return "full_name"
        elif "email" in t or "mail" in t:
            return "email"
        elif "phone" in t or "mobile" in t or "contact" in t:
            return "phone"
        elif "linkedin" in t:
            return "linkedin_profile"
        elif "github" in t:
            return "github_profile"
        elif "portfolio" in t or "website" in t:
            return "portfolio_url"
        return None
