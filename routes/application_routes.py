import queue
import json
import asyncio
import threading
from flask import Blueprint, request, jsonify, Response, g
from services.application_service import ApplicationService
from agents.question_answer_agent import QuestionAnswerAgent

application_bp = Blueprint("application", __name__)

# Global storage for active job application sessions
APPLY_QUEUES = {}
APPLY_EVENTS = {}
APPLY_SESSIONS_DATA = {}

@application_bp.route("/api/jobs/apply/prepare", methods=["POST"])
def apply_prepare():
    """Step 1: Fetches profile and pre-generates tailored personal details & essays."""
    from app import token_required, get_sb
    
    @token_required
    def handler():
        data = request.get_json() or {}
        job_url = data.get("job_url", "")
        company = data.get("company", "Company")
        role = data.get("role", "Software Engineer")
        description = data.get("description", "")
        
        if not description:
            description = f"Software Engineering position at {company} matching candidate skillset."

        sb = get_sb()
        if not sb:
            return jsonify({"error": "Database service offline."}), 500

        try:
            # Fetch user profile from Supabase
            user_id = g.user_id
            res = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            if not res.data:
                return jsonify({"error": "Profile not found."}), 404
                
            profile = res.data[0]

            # Generate essays
            qa_agent = QuestionAnswerAgent()
            essay_answers = {
                "Why Join": qa_agent.answer_question("Why are you interested in this role?", profile, description),
                "Key Project": qa_agent.answer_question("Describe a significant technical project you built.", profile, description),
                "Alignment": qa_agent.answer_question("How does your background align with this role?", profile, description)
            }

            return jsonify({
                "prefilled_info": {
                    "full_name": profile.get("full_name", ""),
                    "email": profile.get("email", ""),
                    "phone": profile.get("phone", ""),
                    "linkedin": profile.get("linkedin_profile", ""),
                    "github": profile.get("github_profile", ""),
                    "portfolio": profile.get("portfolio_url", "")
                },
                "essay_answers": essay_answers
            })
        except Exception as e:
            return jsonify({"error": str(e)}), 500
            
    return handler()


@application_bp.route("/api/jobs/apply/stream", methods=["GET"])
def apply_stream():
    """Real-time SSE progress logs stream endpoint."""
    from app import token_required
    
    @token_required
    def handler():
        user_id = g.user_id
        if user_id not in APPLY_QUEUES:
            APPLY_QUEUES[user_id] = queue.Queue()
            
        def event_generator():
            q = APPLY_QUEUES[user_id]
            while True:
                try:
                    event_data = q.get(timeout=30.0)
                    if event_data == "DONE":
                        yield "data: {\"state\": \"FINISHED\", \"message\": \"Pipeline complete.\"}\n\n"
                        break
                    yield f"data: {json.dumps(event_data)}\n\n"
                except queue.Empty:
                    yield ": keepalive\n\n"
                    
        return Response(event_generator(), mimetype="text/event-stream")
        
    return handler()


@application_bp.route("/api/jobs/apply/start", methods=["POST"])
def apply_start():
    """Step 2: Spawns the automation state machine pipeline in a background thread."""
    from app import token_required, run_async
    
    @token_required
    def handler():
        data = request.get_json() or {}
        job_url = data.get("job_url", "")
        company = data.get("company", "Company")
        role = data.get("role", "Software Engineer")
        description = data.get("description", "")
        profile_data = data.get("profile_data", {})
        essay_answers = data.get("essay_answers", {})

        if not job_url:
            return jsonify({"error": "Job URL is required."}), 400
            
        if not description:
            description = f"Software Engineering position at {company} matching candidate skillset."

        user_id = g.user_id
        APPLY_QUEUES[user_id] = queue.Queue()
        confirm_event = asyncio.Event()
        APPLY_EVENTS[user_id] = confirm_event
        APPLY_SESSIONS_DATA[user_id] = {
            "company": company,
            "role": role,
            "job_url": job_url
        }

        # Background runner thread
        def thread_worker():
            async def run_pipeline():
                service = ApplicationService()
                try:
                    await service.execute_job_application(
                        user_id=user_id,
                        job_url=job_url,
                        company=company,
                        role=role,
                        description=description,
                        profile_data=profile_data,
                        user_queues=APPLY_QUEUES,
                        confirm_event=confirm_event
                    )
                except Exception as e:
                    print(f"[BlueprintRoutes] Pipeline failed: {e}")
                finally:
                    APPLY_QUEUES[user_id].put("DONE")
            run_async(run_pipeline())

        threading.Thread(target=thread_worker, daemon=True).start()
        return jsonify({"status": "Started", "message": "State machine pipeline initialized."})
        
    return handler()


@application_bp.route("/api/jobs/apply/confirm", methods=["POST"])
def apply_confirm():
    """Step 3: Triggered when the user confirms the application preview."""
    from app import token_required, get_sb
    
    @token_required
    def handler():
        user_id = g.user_id
        if user_id not in APPLY_EVENTS:
            return jsonify({"error": "No active application session found."}), 404

        confirm_event = APPLY_EVENTS[user_id]
        confirm_event.set()

        session_data = APPLY_SESSIONS_DATA.get(user_id, {})
        sb = get_sb()
        if sb and session_data:
            try:
                # Add auto mock interview prep milestone row
                sb.table("interview_progress").insert({
                    "user_id": user_id,
                    "company": session_data.get("company", "Company"),
                    "score": 0,
                    "feedback": {"notes": "Scheduled automatically after AI Job Application Agent submission."}
                }).execute()
            except Exception as e:
                print(f"[BlueprintRoutes] Interview insert failed: {e}")

        return jsonify({"status": "Confirmed", "message": "Resuming Playwright pipeline for final submission."})
        
    return handler()
