import logging
from automation.detect_fields import FieldDetector
from automation.fill_fields import FieldFiller
from automation.upload_files import FileUploader

logger = logging.getLogger("JobApplicationAgent.Adapter.Generic")

class BaseWebsiteAdapter:
    async def fill_form(self, page, profile_data: dict, essay_answers: dict) -> dict:
        """
        Base signature. Overridden by specific website adapters.
        """
        raise NotImplementedError("Website adapter must implement fill_form.")


class GenericWebsiteAdapter(BaseWebsiteAdapter):
    async def fill_form(self, page, profile_data: dict, essay_answers: dict) -> dict:
        """
        Generic HTML Form automation algorithm.
        """
        logger.info("Running Generic HTML Form adapter logic...")
        
        # Scan page fields
        fields = await FieldDetector.detect_fields(page)
        
        filled_fields = []
        unfilled_fields = []
        
        for field in fields:
            label = field["label"]
            tag_name = field["type"]
            classification = await FieldFiller.classify_field(label, tag_name)
            
            value = ""
            if classification == "first_name":
                value = profile_data.get("full_name", "").split()[0]
            elif classification == "last_name":
                parts = profile_data.get("full_name", "").split()
                value = parts[1] if len(parts) > 1 else ""
            elif classification == "full_name":
                value = profile_data.get("full_name", "")
            elif classification == "email":
                value = profile_data.get("email", "")
            elif classification == "phone":
                value = profile_data.get("phone", "")
            elif classification == "linkedin":
                value = profile_data.get("linkedin_profile", "")
            elif classification == "github":
                value = profile_data.get("github_profile", "")
            elif classification == "portfolio":
                value = profile_data.get("portfolio_url", "")
            elif classification == "essay":
                matched_key = None
                for key in essay_answers.keys():
                    if key.lower() in label.lower() or label.lower() in key.lower():
                        matched_key = key
                        break
                if matched_key:
                    value = essay_answers[matched_key]
                else:
                    value = list(essay_answers.values())[0] if essay_answers else ""

            if value:
                if classification in ["resume", "cover_letter"]:
                    # Placeholder files uploaded by application pipeline
                    continue
                else:
                    success = await FieldFiller.fill(page, field["id"], value)
                    if success:
                        filled_fields.append(field["label"] or field["id"])
                    else:
                        unfilled_fields.append(field["label"] or field["id"])
            else:
                unfilled_fields.append(field["label"] or field["id"])
                
        return {
            "filled_fields": filled_fields,
            "unfilled_fields": unfilled_fields
        }
