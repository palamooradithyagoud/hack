import os
import json
import logging
import google.generativeai as genai
from interview.conversation_memory import ConversationMemory
from interview.resume_agent import ResumeAgent
from interview.project_agent import ProjectAgent
from interview.behavioral_agent import BehavioralAgent
from interview.technical_agent import TechnicalAgent
from interview.feedback_agent import FeedbackAgent
from interview.report_generator import ReportGenerator

logger = logging.getLogger("VoiceMockInterview.InterviewAgent")

class InterviewAgent:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)
            
        self.memory = ConversationMemory()
        self.resume_agent = ResumeAgent()
        self.project_agent = ProjectAgent()
        self.behavioral_agent = BehavioralAgent()
        self.technical_agent = TechnicalAgent()

    def initialize_interview(self, company: str, role: str, exp_level: str, profile: dict):
        """
        Prepares the conversational system context prompt and starts the memory.
        """
        self.memory.clear()
        
        system_prompt = f"""
        You are Alex, an expert technical recruiter and interviewer conducting a mock interview for:
        Company: {company}
        Role: {role}
        Experience Level: {exp_level}
        
        Candidate Profile:
        {profile}
        
        Interview Structure Guidelines:
        1. Keep the conversation extremely natural, warm, and highly conversational.
        2. Never list multiple questions at once. Ask exactly one question, wait for the response, react, and then ask a relevant follow-up or transition.
        3. Politely interrupt or probe the candidate if their answer lacks technical depth (e.g., if they mention using Flask, ask 'Why Flask instead of FastAPI?').
        4. Focus rounds sequentially:
           - Welcome / Intro
           - Resume validation
           - Project walkthrough (e.g. HireMate choices)
           - Technical / System Design
           - Behavioral (STAR format matching {company}'s culture)
           - Closing discussion
        5. Speak as an interviewer directly. Do not output instructions, thoughts, or formatting blocks.
        """
        self.memory.set_system_context(system_prompt)
        
        # Formulate initial greeting question using ResumeAgent
        greeting = f"Hello {profile.get('full_name', 'there')}! My name is Alex, and I'll be your mock interviewer today. Let's start naturally: could you introduce yourself?"
        self.memory.add_message("assistant", greeting)
        return greeting

    def chat_turn(self, user_response: str, profile: dict, company: str, role: str) -> str:
        """
        Processes user response, updates history, and returns the next conversational question.
        Uses Gemini multimodal model to generate responses.
        """
        if not self.api_key:
            return "Could you explain that decision in more detail? I want to ensure I understand."

        self.memory.add_message("user", user_response)
        
        # Load active history context
        history = self.memory.get_history()
        
        model = genai.GenerativeModel("gemini-1.5-flash")
        
        # Convert history format to Gemini roles format
        gemini_messages = []
        for msg in history:
            role_tag = "user" if msg["role"] == "user" else ("model" if msg["role"] == "assistant" else "user")
            gemini_messages.append({"role": role_tag, "parts": [msg["content"]]})
            
        try:
            # Generate next question
            response = model.generate_content(
                contents=gemini_messages,
                generation_config={"temperature": 0.5}
            )
            ai_reply = response.text.strip()
            
            # Save AI turn in history
            self.memory.add_message("assistant", ai_reply)
            return ai_reply
        except Exception as e:
            logger.error(f"Gemini mock interview generation turn failed: {e}")
            return "That makes sense. Can you expand on the main technical challenges you solved there?"

    def evaluate_interview(self) -> dict:
        """
        Evaluates the current interview history and returns overall report, scores, and recommendations.
        """
        history = self.memory.get_history()
        feedback = FeedbackAgent.analyze_responses(history)
        recommendations = ReportGenerator.generate_recommendations(feedback["weak_areas"])
        
        return {
            "score": feedback["readiness_score"],
            "feedback": {
                "communication_score": feedback["communication"],
                "technical_score": feedback["technical"],
                "confidence_score": feedback["confidence"],
                "behavior_score": feedback["behavior"],
                "voice_clarity": feedback["voice_clarity"],
                "grammar": feedback["grammar"],
                "weak_areas": feedback["weak_areas"],
                "strong_areas": feedback["strong_areas"]
            },
            "transcript": history,
            "recommendations": recommendations
        }
