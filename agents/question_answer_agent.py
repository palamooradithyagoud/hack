import os
from groq import Groq

class QuestionAnswerAgent:
    def __init__(self):
        self.api_key = os.environ.get("GROQ_API_KEY")

    def answer_question(self, question: str, profile: dict, job_description: str) -> str:
        """
        Generates a truthful, highly tailored essay answer to standard/custom application questions.
        """
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable is missing.")

        client = Groq(api_key=self.api_key)

        prompt = f"""
        Answer the following application question truthfully using ONLY details from the candidate profile:
        
        Candidate Profile:
        {profile}
        
        Target Job Description:
        {job_description}
        
        Question:
        \"{question}\"
        
        Guidelines:
        1. Never fabricate experience, credentials, or certifications.
        2. Keep the response concise, punchy, and under 120 words.
        3. Maintain a confident, professional first-person voice.
        """

        try:
            completion = client.chat.completions.create(
                model="llama-3.3-70b-versatile",
                messages=[
                    {"role": "system", "content": "You are a professional hiring advisor. Generate truthful, tailored application essay answers."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.3
            )
            return completion.choices[0].message.content.strip()
        except Exception as e:
            print(f"[QuestionAnswerAgent] Error generating answer: {e}")
            return "I am eager to contribute my engineering expertise to the success of your team."
