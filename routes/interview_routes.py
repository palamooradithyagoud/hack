import os
import logging
from flask import Blueprint, request, jsonify, g
from interview.interview_agent import InterviewAgent
from voice.text_to_speech import TextToSpeech

interview_routes_bp = Blueprint("interview_routes", __name__)

logger = logging.getLogger("VoiceMockInterview.Routes")

# Holds active InterviewAgent instances per user ID
ACTIVE_INTERVIEWS = {}

@interview_routes_bp.route("/api/interview/start", methods=["POST"])
def interview_start():
    """Initializes the mock interview session context and generates the greeting speech audio."""
    from app import token_required, get_sb
    
    @token_required
    def handler():
        data = request.get_json() or {}
        company = data.get("company", "Company")
        role = data.get("role", "Software Engineer")
        exp_level = data.get("experience_level", "Mid")
        
        user_id = g.user_id
        sb = get_sb()
        if not sb:
            return jsonify({"error": "Database service offline."}), 500

        try:
            # Fetch profile details for tailoring
            res = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            profile = res.data[0] if res.data else {}

            agent = InterviewAgent()
            greeting_text = agent.initialize_interview(company, role, exp_level, profile)
            
            # Save active agent to memory
            ACTIVE_INTERVIEWS[user_id] = {
                "agent": agent,
                "company": company,
                "role": role,
                "experience_level": exp_level,
                "profile": profile
            }
            
            # Synthesize text speech audio
            audio_url = TextToSpeech.synthesize(greeting_text, user_id)
            
            return jsonify({
                "response_text": greeting_text,
                "audio_url": audio_url
            })
        except Exception as e:
            logger.error(f"Error starting mock interview: {e}")
            return jsonify({"error": str(e)}), 500
            
    return handler()


@interview_routes_bp.route("/api/interview/chat", methods=["POST"])
def interview_chat():
    """Exchanges candidate voice transcript text for the next mock question voice audio."""
    from app import token_required
    
    @token_required
    def handler():
        data = request.get_json() or {}
        user_response = data.get("user_response", "")
        
        user_id = g.user_id
        if user_id not in ACTIVE_INTERVIEWS:
            return jsonify({"error": "No active mock interview session found. Please start first."}), 404
            
        session = ACTIVE_INTERVIEWS[user_id]
        agent = session["agent"]
        profile = session["profile"]
        company = session["company"]
        role = session["role"]

        try:
            # Process chat turn
            next_question = agent.chat_turn(user_response, profile, company, role)
            
            # Synthesize voice audio
            audio_url = TextToSpeech.synthesize(next_question, user_id)
            
            return jsonify({
                "response_text": next_question,
                "audio_url": audio_url
            })
        except Exception as e:
            logger.error(f"Error processing interview chat turn: {e}")
            return jsonify({"error": str(e)}), 500
            
    return handler()


@interview_routes_bp.route("/api/interview/finish", methods=["POST"])
def interview_finish():
    """Concludes the interview, evaluates transcript metrics, saves report to database."""
    from app import token_required, get_sb
    
    @token_required
    def handler():
        user_id = g.user_id
        if user_id not in ACTIVE_INTERVIEWS:
            return jsonify({"error": "No active mock interview session found."}), 404
            
        session = ACTIVE_INTERVIEWS[user_id]
        agent = session["agent"]
        company = session["company"]
        role = session["role"]
        exp_level = session["experience_level"]

        sb = get_sb()
        if not sb:
            return jsonify({"error": "Database service offline."}), 500

        try:
            report = agent.evaluate_interview()
            
            # Save evaluation report row to Supabase
            db_data = {
                "user_id": user_id,
                "company": company,
                "role": role,
                "experience_level": exp_level,
                "score": report["score"],
                "feedback": report["feedback"],
                "transcript": report["transcript"],
                "recommendations": report["recommendations"]
            }
            
            try:
                sb.table("mock_interviews").insert(db_data).execute()
            except Exception as db_err:
                logger.error(f"Error saving mock interview report to DB: {db_err}")

            # Cleanup session state
            del ACTIVE_INTERVIEWS[user_id]
            
            return jsonify(report)
        except Exception as e:
            logger.error(f"Error evaluating mock interview: {e}")
            return jsonify({"error": str(e)}), 500
            
    return handler()
