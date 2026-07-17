import os
from groq import Groq

class CoverLetterAgent:
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")

    def generate_cover_letter(self, profile: dict, job_analysis: dict) -> str:
        """
        Generates a tailored professional cover letter.
        """
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable is missing.")

        client = Groq(api_key=self.api_key)

        prompt = f"""
        Generate a professional, compelling cover letter (max 250 words) for the target role:
        
        Candidate Profile:
        {profile}
        
        Job Analysis:
        {job_analysis}
        
        Ensure a confident tone, highlighting the candidate's alignment with target requirements.
        Format the cover letter as text/markdown.
        """

        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a professional hiring consultant. Output a concise cover letter."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            print(f"[CoverLetterAgent] Error generating cover letter: {e}")
            return f"Dear Hiring Manager,\n\nI am highly interested in the role matching my background."
