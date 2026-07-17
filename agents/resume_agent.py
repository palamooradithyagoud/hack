import os
from groq import Groq

class ResumeAgent:
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")

    def generate_tailored_resume(self, profile: dict, job_analysis: dict) -> str:
        """
        Generates a tailored markdown formatted resume based on user profile and job analysis parameters.
        """
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable is missing.")

        client = Groq(api_key=self.api_key)

        prompt = f"""
        Generate a tailored resume matching the candidate's profile to the target job attributes:
        
        Candidate Profile:
        {profile}
        
        Job Analysis:
        {job_analysis}
        
        Tailor the profile summary, project responsibilities, and listed skills. Emphasize target technologies.
        Format the resume as clean, professional Markdown.
        """

        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a professional resume writer. Output clean Markdown layout."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            print(f"[ResumeAgent] Error generating resume: {e}")
            return f"# Resume: {profile.get('full_name', 'Applicant')}\n\nTailored for the target role."
