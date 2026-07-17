import os
import json
from groq import Groq

class InterviewAgent:
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")

    def generate_interview_prep(self, company: str, role: str) -> dict:
        """
        Generates structured interview preparation content including questions, DSA guidelines, and roadmaps.
        """
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable is missing.")

        client = Groq(api_key=self.api_key)

        prompt = f"""
        Generate a complete, structured interview preparation package for:
        Company: {company}
        Role: {role}
        
        The package MUST contain:
        - company_overview (string summary)
        - interview_roadmap (list of milestone steps)
        - most_asked_questions (list of question strings)
        - company_dsa_sheet (list of DSA topic areas or typical problems)
        - behavioral_questions (list of questions)
        - technical_questions (list of questions)
        - learning_resources (list of reference links/books)
        - interview_readiness_score (integer from 1 to 100 based on standard preparedness criteria)
        
        Return ONLY valid raw JSON matching the structure. Do not include markdown wraps.
        """

        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are an expert technical interviewer. Output valid JSON matching the format."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3,
                response_format={"type": "json_object"}
            )
            result = json.loads(completion.choices[0].message.content.strip())
            return result
        except Exception as e:
            print(f"[InterviewAgent] Error generating interview preparation info: {e}")
            return {
                "company_overview": f"A leading firm in its industry matching {company}.",
                "interview_roadmap": ["Resume Screening", "Technical Assessment", "Onsite Interviews"],
                "most_asked_questions": ["Explain OOP concepts", "Describe your favorite coding project"],
                "company_dsa_sheet": ["Arrays & Hashing", "Two Pointers", "Trees & Graphs"],
                "behavioral_questions": ["Tell me about a time you handled a difficult conflict"],
                "technical_questions": ["Design a rate limiter system"],
                "learning_resources": ["LeetCode Interview Prep Checklist", "System Design Primer"],
                "interview_readiness_score": 75
            }
