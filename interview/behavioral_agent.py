import os
import google.generativeai as genai

class BehavioralAgent:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)

    def formulate_behavioral_question(self, company: str, last_answer: str) -> str:
        """
        Formulates a behavioral question tailored to the target company's cultural principles.
        """
        if not self.api_key:
            return "Tell me about a time you resolved a conflict with a team member."

        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""
        Formulate a behavioral question tailored for candidate interviewing at {company}.
        
        Tailoring guide:
        - Amazon: Leadership Principles (Ownership, Customer Obsession)
        - Google: Problem Solving (Googliness)
        - Microsoft: Collaboration, growth mindset
        - Meta: Speed, scale, impact
        
        Last user response:
        \"{last_answer}\"
        
        Keep it conversational and natural. Return ONLY the question.
        """
        try:
            res = model.generate_content(prompt)
            return res.text.strip()
        except Exception:
            return f"Tell me about a challenging situation you solved while working in a team. How did you align on the path forward?"
