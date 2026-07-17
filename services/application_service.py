import os
import logging
import asyncio
from agents.application_agent import ApplicationAgent
from automation.playwright_runner import PlaywrightRunner
from services.storage_service import StorageService
from services.logging_service import LoggingService

logger = logging.getLogger("JobApplicationAgent.ApplicationService")

class ApplicationService:
    def __init__(self):
        self.agent = ApplicationAgent()

    async def execute_job_application(self, user_id: str, job_url: str, company: str, role: str, description: str, profile_data: dict, user_queues: dict, confirm_event: asyncio.Event) -> dict:
        """
        Orchestrates job analysis, resume/cover letter tailoring, file uploads, and Playwright automation.
        """
        async def emit(state: str, message: str, success: bool = True):
            LoggingService.emit_progress(user_queues, user_id, state, message, success)

        try:
            # 1. Analyze Job Description
            await emit("START", "Analyzing target job description attributes...")
            job_analysis = self.agent.analyze_job(description)
            await emit("START", f"Extracted keywords: {', '.join(job_analysis.get('ats_keywords', []))[:120]}...")

            # 2. Generate Tailored Resume and Cover Letter
            await emit("START", "Generating tailored resume version matching qualifications...")
            tailored_resume = self.agent.generate_resume(profile_data, job_analysis)
            
            await emit("START", "Constructing tailored cover letter content...")
            tailored_cl = self.agent.generate_cover_letter(profile_data, job_analysis)

            # Save generated documents locally first
            base_dir = r"c:\PROJECTS\SKILL PATH\AI-CATALYST-main\AI-CATALYST-main"
            doc_dir = os.path.join(base_dir, "data", "temp_uploads")
            os.makedirs(doc_dir, exist_ok=True)
            
            resume_path = os.path.join(doc_dir, "resume.pdf")
            cl_path = os.path.join(doc_dir, "cover_letter.pdf")
            
            with open(resume_path, "w", encoding="utf-8") as f:
                f.write(tailored_resume)
            with open(cl_path, "w", encoding="utf-8") as f:
                f.write(tailored_cl)

            # 3. Store in Supabase Storage
            await emit("START", "Uploading tailored profile documents to database...")
            resume_url = StorageService.upload_document("resumes", resume_path, f"{user_id}_resume.pdf")
            cl_url = StorageService.upload_document("cover_letters", cl_path, f"{user_id}_cover_letter.pdf")

            # 4. Generate Essay Answers in Advance
            await emit("START", "Pre-generating professional essay question answers...")
            essay_questions = [
                "Why are you interested in this role?",
                "Describe a significant technical project you built.",
                "How does your background align with this role?"
            ]
            essay_answers = {}
            for q in essay_questions:
                ans = self.agent.answer_question(q, profile_data, description)
                # Map question shortname
                short_name = "Why Join" if "interested" in q else ("Key Project" if "project" in q else "Alignment")
                essay_answers[short_name] = ans

            # 5. Launch Playwright State Machine Runner
            runner = PlaywrightRunner(headless=False) # Local headful mode
            
            async def status_bridge(state, message, success=True):
                await emit(state, message, success)

            result = await runner.execute_pipeline(
                url=job_url,
                profile_data=profile_data,
                essay_answers=essay_answers,
                status_callback=status_bridge,
                confirm_event=confirm_event
            )

            # 6. Save final status in Supabase table
            from app import get_sb
            sb = get_sb()
            if sb:
                status = result.get("status", "Applied")
                db_data = {
                    "user_id": user_id,
                    "company": company,
                    "role": role,
                    "apply_url": job_url,
                    "status": status,
                    "resume_version": resume_url,
                    "cover_letter_version": cl_url,
                    "screenshot_url": result.get("screenshot", ""),
                    "notes": f"Submitted. Confirmation: {result.get('confirmation_number', '')}"
                }
                try:
                    sb.table("job_applications").insert(db_data).execute()
                except Exception as db_err:
                    logger.error(f"Error saving application history: {db_err}")

            await emit("FINISHED", "Application flow completed successfully!")
            return result

        except Exception as e:
            logger.error(f"Error executing application service pipeline: {e}")
            await emit("FAILED", f"Process aborted: {str(e)}", success=False)
            raise e
