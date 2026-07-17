import os
import json
from groq import Groq

class JobAnalysisAgent:
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")

    def analyze_job(self, description: str) -> dict:
        """
        Analyzes the job description and extracts key components: skills, responsibilities, etc.
        """
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable is missing.")

        client = Groq(api_key=self.api_key)

        prompt = f"""
        Analyze the following job description and extract key attributes in JSON format:
        - required_skills (list of strings)
        - preferred_skills (list of strings)
        - responsibilities (list of strings)
        - ats_keywords (list of strings)
        - experience_level (string)
        - technologies (list of strings)
        - qualifications (list of strings)

        Job Description:
        \"\"\"{description}\"\"\"

        Return ONLY a raw JSON block matching the structure above. Do not include markdown code block formatting.
        """

        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a professional technical recruiter. Output raw JSON format matching request."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                response_format={"type": "json_object"}
            )
            
            result = json.loads(completion.choices[0].message.content.strip())
            return result
        except Exception as e:
            print(f"[JobAnalysisAgent] Error analyzing job description: {e}")
            return {
                "required_skills": ["Software Engineering"],
                "preferred_skills": [],
                "responsibilities": ["Develop software components"],
                "ats_keywords": ["Developer", "Engineer"],
                "experience_level": "Mid",
                "technologies": ["Python", "JavaScript"],
                "qualifications": ["Bachelor's in Computer Science or equivalent"]
            }
