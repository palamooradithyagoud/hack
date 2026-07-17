import os
import google.generativeai as genai

class TechnicalAgent:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)

    def formulate_technical_question(self, role: str, last_answer: str) -> str:
        """
        Formulates a system design or core technical question matching the candidate's engineering role.
        """
        if not self.api_key:
            return "How would you design a scalable notification service?"

        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = f"""
        Formulate a technical or system design question for a candidate interviewing for the role of {role}.
        
        Last user response:
        \"{last_answer}\"
        
        Focus on scalability, database tradeoffs, API security, or backend bottlenecks.
        Keep it conversational and return ONLY the technical follow-up question.
        """
        try:
            res = model.generate_content(prompt)
            return res.text.strip()
        except Exception:
            return f"For a {role} role, how do you handle concurrency, caching, and rate limiting in a backend API?"
