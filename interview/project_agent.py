import os
import google.generativeai as genai

class ProjectAgent:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)

    def formulate_project_question(self, profile: dict, last_answer: str) -> str:
        """
        Formulates follow-up questions targeting the projects listed in the candidate profile (e.g. HireMate).
        """
        if not self.api_key:
            return "Tell me about the architecture of your primary project."

        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""
        Formulate an intelligent follow-up question based on candidate profile projects and their latest statement.
        
        Candidate Profile:
        {profile}
        
        Candidate's Latest Answer:
        \"{last_answer}\"
        
        Drill down into their engineering decisions: Why did they choose a specific framework (e.g., Flask, Supabase)?
        What challenges did they encounter? Keep it friendly but technically probing.
        """
        try:
            res = model.generate_content(prompt)
            return res.text.strip()
        except Exception:
            return "Why did you choose your specific tech stack for your primary project? What were the tradeoffs?"
