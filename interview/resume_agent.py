import os
import google.generativeai as genai

class ResumeAgent:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)

    def formulate_introduction_question(self, profile: dict) -> str:
        """
        Formulates an introductory request targeting the candidate's resume/profile details.
        """
        if not self.api_key:
            return "Could you introduce yourself and tell me about your background?"

        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""
        Formulate a natural, conversational greeting and introductory self-introduction question
        based on the candidate's profile:
        {profile}
        
        Keep it professional, human-like, and friendly. Output ONLY the greeting/question text.
        """
        try:
            res = model.generate_content(prompt)
            return res.text.strip()
        except Exception:
            return f"Hello {profile.get('full_name', 'candidate')}. Welcome to your mock interview. Could you introduce yourself?"
