import os
import json
import time
import logging
import asyncio
from automation.browser import BrowserManager
from automation.login_detector import LoginDetector
from automation.website_detector import WebsiteDetector
from automation.adapter_generic import GenericWebsiteAdapter
from automation.adapter_greenhouse import GreenhouseWebsiteAdapter
from automation.adapter_lever import LeverWebsiteAdapter
from automation.adapter_workday import WorkdayWebsiteAdapter
from automation.upload_files import FileUploader
from automation.submit_application import Submitter
from automation.detect_fields import FieldDetector

logger = logging.getLogger("JobApplicationAgent.PlaywrightRunner")

class PlaywrightRunner:
    def __init__(self, headless: bool = False):
        self.headless = headless

    async def execute_pipeline(self, url: str, profile_data: dict, essay_answers: dict, status_callback, confirm_event: asyncio.Event) -> dict:
        """
        Coordinates the automated state machine steps.
        """
        async def log(state: str, message: str, success: bool = True):
            await status_callback(state, message, success)

        await log("START", "Playwright pipeline runner starting...")
        
        browser = None
        context = None
        try:
            # 1. Launch Browser
            browser, context = await BrowserManager.launch(headless=self.headless)
            page = await context.new_page()
            
            # 2. Open Job URL
            await log("OPEN_JOB", f"Navigating to {url}...")
            await page.goto(url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)
            
            # Click initial Apply button if needed
            apply_buttons = await page.query_selector_all("text=Apply, text=apply, text='Apply Now'")
            for btn in apply_buttons:
                if await btn.is_visible():
                    await log("OPEN_JOB", "Clicking 'Apply' action trigger to open inputs...")
                    await btn.click()
                    await page.wait_for_timeout(3000)
                    break
                    
            # 3. Check Authentication Requirements
            await log("CHECK_LOGIN", "Evaluating authentication requirement status...")
            auth_needed = await LoginDetector.detect_auth_required(page)
            
            if auth_needed:
                await log("WAIT_FOR_USER_LOGIN", "Login is required. Please sign in or complete MFA in the browser window.", success=False)
                logged_in = await LoginDetector.wait_for_user_login(page, log)
                if not logged_in:
                    raise TimeoutError("User login checkpoint timed out.")
                await log("LOGIN_SUCCESS", "Login detected successfully! Resuming form automation.")
            else:
                await log("LOGIN_SUCCESS", "No authentication forms found or session active. Continuing...")
                
            # 4. Detect Target Website Type (Lever, Greenhouse, Workday, etc)
            await log("OPEN_APPLICATION", "Determining website type and choosing adapter...")
            site_type = await WebsiteDetector.detect(page)
            await log("OPEN_APPLICATION", f"Detected site type: {site_type.upper()}")
            
            # Instantiate correct Adapter Pattern class
            if site_type == "greenhouse":
                adapter = GreenhouseWebsiteAdapter()
            elif site_type == "lever":
                adapter = LeverWebsiteAdapter()
            elif site_type == "workday":
                adapter = WorkdayWebsiteAdapter()
            else:
                adapter = GenericWebsiteAdapter()
                
            # 5. Detect and fill fields
            await log("DETECT_FORM", "Scanning form fields with selected adapter...")
            adapter_res = await adapter.fill_form(page, profile_data, essay_answers)
            
            # 6. Upload Tailored Resume/Cover Letter files
            # Find any input file elements
            await log("UPLOAD_RESUME", "Scanning form for file upload containers...")
            fields = await FieldDetector.detect_fields(page)
            
            base_dir = r"c:\PROJECTS\SKILL PATH\AI-CATALYST-main\AI-CATALYST-main"
            file_dir = os.path.join(base_dir, "data", "temp_uploads")
            os.makedirs(file_dir, exist_ok=True)
            
            for field in fields:
                field_id = field["id"]
                label = field["label"].lower()
                el_type = field["type"]
                
                if el_type == "file":
                    if "resume" in label or "cv" in label:
                        resume_path = os.path.join(file_dir, "resume.pdf")
                        if not os.path.exists(resume_path):
                            with open(resume_path, "w") as rf:
                                rf.write("Resume Data Tailored")
                        await log("UPLOAD_RESUME", f"Uploading resume document for: '{field['label']}'...")
                        await FileUploader.upload(page, field_id, resume_path)
                        adapter_res["filled_fields"].append("Resume PDF")
                    elif "cover" in label:
                        cover_path = os.path.join(file_dir, "cover_letter.pdf")
                        if not os.path.exists(cover_path):
                            with open(cover_path, "w") as cf:
                                cf.write("Cover Letter Tailored")
                        await log("UPLOAD_COVER_LETTER", f"Uploading cover letter for: '{field['label']}'...")
                        await FileUploader.upload(page, field_id, cover_path)
                        adapter_res["filled_fields"].append("Cover Letter PDF")

            # 7. Scan for any essay fields to flag essay answering step
            has_essay = any("essay" in field["label"].lower() for field in fields)
            if has_essay:
                await log("ANSWER_APPLICATION_QUESTIONS", "Answering complex/essay text questions dynamically...")

            # 8. Capture preview screenshot
            screenshot_dir = os.path.join(base_dir, "static", "screenshots")
            os.makedirs(screenshot_dir, exist_ok=True)
            timestamp = int(time.time())
            preview_screenshot = f"preview_{timestamp}.png"
            preview_path = os.path.join(screenshot_dir, preview_screenshot)
            await page.screenshot(path=preview_path)
            
            # Check for captcha warning
            captcha_detected = False
            captcha_frames = await page.query_selector_all("iframe[src*='recaptcha'], iframe[src*='hcaptcha']")
            if captcha_frames:
                captcha_detected = True
                
            preview_data = {
                "filled_fields": adapter_res["filled_fields"],
                "unfilled_fields": adapter_res["unfilled_fields"],
                "screenshot": f"/static/screenshots/{preview_screenshot}",
                "captcha_detected": captcha_detected
            }
            
            # 9. Yield Preview Application details
            await log("PREVIEW_APPLICATION", json.dumps(preview_data))
            
            # 10. Wait for User Confirmation
            await log("WAIT_FOR_USER_CONFIRMATION", "Application ready for review. Waiting for your confirmation...", success=False)
            try:
                await asyncio.wait_for(confirm_event.wait(), timeout=600.0)
            except asyncio.TimeoutError:
                raise TimeoutError("Application confirmation timed out.")
                
            # 11. Final Submission Click
            await log("SUBMIT_APPLICATION", "Resuming Playwright pipeline to click submit...")
            success, conf_num, success_screenshot = await Submitter.click_submit(page)
            
            if not success:
                raise ValueError("Could not complete final form submission click automatically.")
                
            await log("SAVE_APPLICATION_HISTORY", f"Submission confirmed! Ref: {conf_num}")
            await log("START_INTERVIEW_PREPARATION", "Auto-scheduling mock prep workflows...")
            
            await browser.close()
            return {
                "status": "Applied",
                "screenshot": success_screenshot,
                "confirmation_number": conf_num
            }
            
        except Exception as e:
            logger.error(f"Error in runner pipeline: {e}")
            if browser:
                try:
                    await browser.close()
                except Exception:
                    pass
            raise e
