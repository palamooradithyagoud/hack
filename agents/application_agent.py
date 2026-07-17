from agents.job_analysis_agent import JobAnalysisAgent
from agents.resume_agent import ResumeAgent
from agents.cover_letter_agent import CoverLetterAgent
from agents.field_mapping_agent import FieldMappingAgent
from agents.question_answer_agent import QuestionAnswerAgent
from agents.interview_agent import InterviewAgent

class ApplicationAgent:
    def __init__(self):
        self.job_analysis_agent = JobAnalysisAgent()
        self.resume_agent = ResumeAgent()
        self.cover_letter_agent = CoverLetterAgent()
        self.field_mapping_agent = FieldMappingAgent()
        self.question_answer_agent = QuestionAnswerAgent()
        self.interview_agent = InterviewAgent()

    def analyze_job(self, description: str) -> dict:
        return self.job_analysis_agent.analyze_job(description)

    def generate_resume(self, profile: dict, job_analysis: dict) -> str:
        return self.resume_agent.generate_tailored_resume(profile, job_analysis)

    def generate_cover_letter(self, profile: dict, job_analysis: dict) -> str:
        return self.cover_letter_agent.generate_cover_letter(profile, job_analysis)

    def map_fields(self, form_fields: list, profile: dict) -> dict:
        return self.field_mapping_agent.map_fields(form_fields, profile)

    def answer_question(self, question: str, profile: dict, job_description: str) -> str:
        return self.question_answer_agent.answer_question(question, profile, job_description)

    def generate_interview_prep(self, company: str, role: str) -> dict:
        return self.interview_agent.generate_interview_prep(company, role)
