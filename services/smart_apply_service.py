import os
import re
import uuid
import time
import asyncio
import logging
import threading
import tempfile
import requests
from typing import Dict, List, Any
import google.generativeai as genai
from playwright.async_api import async_playwright

# logger setup
logger = logging.getLogger("VoiceMockInterview.SmartApplyService")

# Global dict to track background automation tasks
# Structure: { task_id: { "status": str, "logs": list, "preview": dict, "event": asyncio.Event, "loop": asyncio.AbstractEventLoop, "browser": Browser, "page": Page, "data": dict } }
AUTOMATION_TASKS: Dict[str, Any] = {}

def get_gemini_client():
    api_key = os.environ.get("GEMINI_API_KEY")
    if api_key:
        genai.configure(api_key=api_key)
        return genai.GenerativeModel("gemini-1.5-flash")
    return None

class SmartApplyService:
    @staticmethod
    def log_message(task_id: str, message: str):
        if task_id in AUTOMATION_TASKS:
            logger.info(f"[Task {task_id}] {message}")
            AUTOMATION_TASKS[task_id]["logs"].append({
                "timestamp": time.time(),
                "message": message
            })

    @staticmethod
    def get_task_status(task_id: str) -> Dict[str, Any]:
        task = AUTOMATION_TASKS.get(task_id)
        if not task:
            return {"error": "Task not found"}
        return {
            "task_id": task_id,
            "status": task["status"],
            "logs": task["logs"],
            "preview": task.get("preview"),
            "company": task["data"].get("company"),
            "role": task["data"].get("role"),
            "job_url": task["data"].get("job_url")
        }

    @staticmethod
    def calculate_match_score(user_skills: List[str], job_description: str) -> Dict[str, Any]:
        """Heuristic dynamic match calculation using standard keywords."""
        if not job_description:
            return {"match_score": 75, "skills_match": [], "missing_skills": []}

        TECH_KEYWORDS = {
            "python", "javascript", "typescript", "java", "c++", "c#", "go", "golang", "rust", "ruby", "php", 
            "html", "css", "react", "angular", "vue", "node", "nodejs", "express", "django", "flask", "fastapi", 
            "spring", "asp.net", "docker", "kubernetes", "aws", "azure", "gcp", "sql", "mysql", "postgresql", 
            "mongodb", "redis", "elasticsearch", "git", "github", "ci/cd", "jenkins", "terraform", "graphql", 
            "rest", "api", "microservices", "agile", "scrum", "machine learning", "ai", "data structures", "algorithms"
        }

        desc_lower = job_description.lower()
        user_skills_set = {s.lower().strip() for s in user_skills if s.strip()}
        
        # Detect technologies present in the job description
        job_technologies = []
        for kw in TECH_KEYWORDS:
            # Check word boundary to avoid partial matches
            if re.search(r'\b' + re.escape(kw) + r'\b', desc_lower):
                job_technologies.append(kw)

        if not job_technologies:
            # If no specific tech keywords match, check for title/general match
            return {"match_score": 70, "skills_match": [], "missing_skills": []}

        skills_match = []
        missing_skills = []

        for tech in job_technologies:
            matched = False
            for uskill in user_skills_set:
                if uskill in tech or tech in uskill:
                    matched = True
                    break
            if matched:
                skills_match.append(tech.capitalize())
            else:
                missing_skills.append(tech.capitalize())

        total = len(job_technologies)
        matched_count = len(skills_match)
        match_score = int((matched_count / total) * 100) if total > 0 else 70
        match_score = max(35, min(100, match_score))

        return {
            "match_score": match_score,
            "skills_match": skills_match,
            "missing_skills": missing_skills
        }

    @staticmethod
    def deep_analyze_job(profile: Dict[str, Any], job_desc: str, resumes: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Use Gemini to perform deep JD analysis, recommend resume, and draft cover letter."""
        model = get_gemini_client()
        if not model:
            # Fallback draft if Gemini is not set up
            cover_letter = f"Dear Hiring Team,\n\nI am writing to express my interest in the software role. With my background in technology and my experience listed on my resume, I am confident in my ability to add value to your team.\n\nSincerely,\n{profile.get('full_name', 'Applicant')}"
            recommended_resume = resumes[0]["name"] if resumes else "Default Resume"
            return {
                "match_score": 85,
                "recommended_resume": recommended_resume,
                "cover_letter": cover_letter,
                "ats_keywords": ["Development", "APIs"],
                "missing_skills_analysis": "Check skills against JD details."
            }

        resume_names = [r["name"] for r in resumes]
        prompt = f"""
        You are an expert tech recruiter and ATS scanner. Analyze this candidate profile and the target job description.
        
        Candidate Profile:
        Name: {profile.get('full_name')}
        Target Role: {profile.get('target_role')}
        Skills: {profile.get('skills')}
        Experience Summary: {profile.get('experience')}
        Education: {profile.get('education')}
        
        Available Resumes:
        {json_dump_helper(resumes)}
        
        Job Description:
        {job_desc}
        
        Tasks:
        1. Calculate a Job Match Score (0-100) based on strict requirements.
        2. Recommend the best resume version from the available list.
        3. Draft a brief, tailored, highly professional Cover Letter (3 paragraphs max) highlight the candidate's matching projects/skills.
        4. Identify missing keywords or skills the candidate should add for ATS compliance.
        
        Return ONLY a valid JSON object matching this structure:
        {{
          "match_score": 88,
          "recommended_resume": "Name of recommended resume",
          "cover_letter": "The drafted cover letter text",
          "ats_keywords": ["keyword1", "keyword2"],
          "missing_skills_analysis": "Summary of critical missing requirements"
        }}
        """
        try:
            res = model.generate_content(prompt)
            text = res.text.strip()
            # Clean JSON markdown blocks if any
            text = re.sub(r'^```json\s*|\s*```$', '', text, flags=re.MULTILINE)
            import json
            data = json.loads(text)
            return data
        except Exception as e:
            logger.error(f"Gemini job analysis failed: {e}")
            recommended_resume = resumes[0]["name"] if resumes else "Default Resume"
            return {
                "match_score": 80,
                "recommended_resume": recommended_resume,
                "cover_letter": f"Dear Hiring Manager,\n\nI am excited about this opportunity. I am a software developer with experience in {profile.get('skills')}.\n\nSincerely,\n{profile.get('full_name')}",
                "ats_keywords": [],
                "missing_skills_analysis": "Error loading deep analysis."
            }

    @staticmethod
    def start_apply_automation(user_id: str, data: Dict[str, Any]) -> str:
        task_id = str(uuid.uuid4())
        AUTOMATION_TASKS[task_id] = {
            "status": "Initializing...",
            "logs": [],
            "preview": None,
            "event": asyncio.Event(),
            "loop": None,
            "browser": None,
            "page": None,
            "data": data,
            "user_id": user_id
        }
        
        # Run Playwright flow in a dedicated thread
        t = threading.Thread(target=SmartApplyService._run_playwright_thread, args=(task_id, user_id, data))
        t.daemon = True
        t.start()
        
        return task_id

    @staticmethod
    def _run_playwright_thread(task_id: str, user_id: str, data: Dict[str, Any]):
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        AUTOMATION_TASKS[task_id]["loop"] = loop
        
        try:
            loop.run_until_complete(SmartApplyService._autofill_flow(task_id, user_id, data))
        except Exception as e:
            logger.error(f"Error in Playwright thread for task {task_id}: {e}")
            SmartApplyService.log_message(task_id, f"Critical automation error: {str(e)}")
            if task_id in AUTOMATION_TASKS:
                AUTOMATION_TASKS[task_id]["status"] = f"Failed: {str(e)}"
        finally:
            loop.close()

    @staticmethod
    async def _autofill_flow(task_id: str, user_id: str, data: Dict[str, Any]):
        SmartApplyService.log_message(task_id, "Launching browser in headed mode...")
        AUTOMATION_TASKS[task_id]["status"] = "Launching browser..."
        
        async with async_playwright() as p:
            # Launch chromium in headed mode so user can see it and solve security popups
            browser = await p.chromium.launch(headless=False)
            AUTOMATION_TASKS[task_id]["browser"] = browser
            
            context = await browser.new_context()
            page = await context.new_page()
            AUTOMATION_TASKS[task_id]["page"] = page
            
            job_url = data["job_url"]
            SmartApplyService.log_message(task_id, f"Navigating to job page: {job_url[:60]}...")
            AUTOMATION_TASKS[task_id]["status"] = "Analyzing job..."
            
            try:
                # Use load state 'domcontentloaded' with a 30s timeout for initial page load
                await page.goto(job_url, timeout=30000, wait_until="domcontentloaded")
            except Exception as e:
                SmartApplyService.log_message(task_id, f"Initial navigation warning: {str(e)}")

            try:
                # Try to wait for networkidle but don't crash if it takes too long
                await page.wait_for_load_state("networkidle", timeout=10000)
            except Exception:
                pass
            
            # Check for immediate login prompts
            if await SmartApplyService._detect_login_page(page):
                SmartApplyService.log_message(task_id, "Authentication page detected. Pausing for user login.")
                AUTOMATION_TASKS[task_id]["status"] = "PAUSED_LOGIN"
                # Wait until the user completes the login manually
                await SmartApplyService._wait_for_user_resume(task_id, page, detect_type="login")
                
            # Check for CAPTCHA/MFA
            if await SmartApplyService._detect_captcha(page):
                SmartApplyService.log_message(task_id, "CAPTCHA/Security check detected. Pausing for user input.")
                AUTOMATION_TASKS[task_id]["status"] = "PAUSED_CAPTCHA"
                await SmartApplyService._wait_for_user_resume(task_id, page, detect_type="captcha")

            AUTOMATION_TASKS[task_id]["status"] = "Autofilling form..."
            SmartApplyService.log_message(task_id, "Scanning form fields and injecting unique trackers...")
            
            # Fetch user profile for filling
            from app import get_sb
            sb = get_sb()
            prof_res = sb.table("profiles").select("*").eq("id", user_id).limit(1).execute()
            profile = prof_res.data[0] if prof_res.data else {}
            
            # Scan DOM elements and inject identifiers
            fields = await SmartApplyService._inject_form_trackers(page)
            SmartApplyService.log_message(task_id, f"Detected {len(fields)} fillable fields on the page.")
            
            # Call Gemini to map fields to values
            AUTOMATION_TASKS[task_id]["status"] = "Generating AI answers..."
            SmartApplyService.log_message(task_id, "Querying Gemini AI model to compute correct form answers...")
            
            mapped_values = await SmartApplyService._map_fields_with_gemini(fields, profile, data)
            
            # Perform autofill
            AUTOMATION_TASKS[task_id]["status"] = "Autofilling form..."
            SmartApplyService.log_message(task_id, "Applying form values into browser input elements...")
            await SmartApplyService._apply_autofill_values(page, mapped_values)
            
            # Handle resume download and upload
            resume_url = data.get("resume_url")
            if resume_url:
                AUTOMATION_TASKS[task_id]["status"] = "Uploading files..."
                SmartApplyService.log_message(task_id, f"Downloading resume version to local buffer...")
                temp_resume_path = await SmartApplyService._download_temp_file(resume_url, ".pdf")
                
                if temp_resume_path:
                    SmartApplyService.log_message(task_id, "Locating resume upload inputs on form...")
                    uploaded = await SmartApplyService._upload_file_playwright(page, temp_resume_path, ["resume", "cv", "upload", "document"])
                    if uploaded:
                        SmartApplyService.log_message(task_id, "Resume uploaded successfully.")
                    else:
                        SmartApplyService.log_message(task_id, "Warning: Could not automatically locate resume upload field.")
                    
                    try:
                        os.remove(temp_resume_path)
                    except Exception:
                        pass
            
            # Provide preview to the user
            AUTOMATION_TASKS[task_id]["status"] = "Waiting for review..."
            SmartApplyService.log_message(task_id, "Form autofilled. Pausing for final candidate confirmation.")
            
            # Construct preview object
            AUTOMATION_TASKS[task_id]["preview"] = {
                "fields": mapped_values,
                "resume_selected": data.get("resume_name", "Primary Resume"),
                "cover_letter": data.get("cover_letter_text", ""),
                "confidence_score": 90
            }
            
            # Wait for user confirmation event trigger
            await AUTOMATION_TASKS[task_id]["event"].wait()
            
            # Check confirmation action
            action = AUTOMATION_TASKS[task_id].get("confirm_action")
            if action == "submit":
                AUTOMATION_TASKS[task_id]["status"] = "Ready to submit..."
                SmartApplyService.log_message(task_id, "Finalizing submission in browser window...")
                
                # Attempt to click submit button
                submitted = await SmartApplyService._click_submit_button(page)
                if submitted:
                    AUTOMATION_TASKS[task_id]["status"] = "Submitted successfully"
                    SmartApplyService.log_message(task_id, "Application submitted successfully!")
                else:
                    AUTOMATION_TASKS[task_id]["status"] = "Failed"
                    SmartApplyService.log_message(task_id, "Error: Could not trigger final submit button click. Browser remains open for manual click.")
            else:
                AUTOMATION_TASKS[task_id]["status"] = "Cancelled"
                SmartApplyService.log_message(task_id, "Application process cancelled by user.")
            
            # Close browser context
            await asyncio.sleep(2)
            await browser.close()

    @staticmethod
    async def _detect_login_page(page) -> bool:
        # Check standard username/email inputs on login endpoints
        login_indicators = [
            "input[type='password']",
            "a:has-text('Sign In')",
            "button:has-text('Log In')",
            "a[href*='login']",
            "a[href*='signin']"
        ]
        url = page.url.lower()
        if "login" in url or "signin" in url or "auth" in url:
            return True
        for sel in login_indicators:
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    return True
            except Exception:
                pass
        return False

    @staticmethod
    async def _detect_captcha(page) -> bool:
        captcha_indicators = [
            "iframe[src*='recaptcha']",
            "iframe[src*='hcaptcha']",
            ".g-recaptcha",
            "#cf-turnstile",
            "iframe[src*='cloudflare']"
        ]
        for sel in captcha_indicators:
            try:
                el = await page.query_selector(sel)
                if el and await el.is_visible():
                    return True
            except Exception:
                pass
        return False

    @staticmethod
    async def _wait_for_user_resume(task_id: str, page, detect_type: str):
        # Poll the browser state every 2 seconds to see if the block is cleared
        while True:
            await asyncio.sleep(2.0)
            if detect_type == "login":
                still_login = await SmartApplyService._detect_login_page(page)
                if not still_login:
                    SmartApplyService.log_message(task_id, "Login cleared. Resuming automation.")
                    break
            elif detect_type == "captcha":
                still_captcha = await SmartApplyService._detect_captcha(page)
                if not still_captcha:
                    SmartApplyService.log_message(task_id, "Security check cleared. Resuming automation.")
                    break
            
            # Also support manual resume triggers from UI (changes task status)
            if AUTOMATION_TASKS[task_id]["status"] not in ["PAUSED_LOGIN", "PAUSED_CAPTCHA"]:
                break

    @staticmethod
    async def _inject_form_trackers(page) -> List[Dict[str, Any]]:
        # Injects unique smart attributes to fillable tags and returns metadata
        js_script = """
        () => {
            const inputs = document.querySelectorAll('input, textarea, select');
            const fields = [];
            let index = 0;
            inputs.forEach(el => {
                if (el.offsetWidth === 0 && el.offsetHeight === 0) return; // Ignore invisible
                const type = el.type || 'text';
                if (type === 'hidden' || type === 'submit' || type === 'button') return;
                
                const smartId = 'smart-' + index++;
                el.setAttribute('data-smart-id', smartId);
                
                // Get label text
                let label = '';
                if (el.id) {
                    const labelEl = document.querySelector('label[for="' + el.id + '"]');
                    if (labelEl) label = labelEl.innerText;
                }
                if (!label) {
                    const parentLabel = el.closest('label');
                    if (parentLabel) label = parentLabel.innerText;
                }
                if (!label) {
                    label = el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.name || '';
                }
                
                // Options for select
                const options = [];
                if (el.tagName.toLowerCase() === 'select') {
                    Array.from(el.options).forEach(opt => {
                        options.push({ text: opt.text, value: opt.value });
                    });
                }
                
                fields.push({
                    smart_id: smartId,
                    tag: el.tagName.toLowerCase(),
                    type: type,
                    name: el.name || '',
                    placeholder: el.getAttribute('placeholder') || '',
                    label: label.replace(/\\s+/g, ' ').trim() || label,
                    options: options
                });
            });
            return fields;
        }
        """
        try:
            fields = await page.evaluate(js_script)
            # Standardize label spacing
            for f in fields:
                f["label"] = " ".join(f["label"].split())
            return fields
        except Exception as e:
            logger.error(f"Failed to inject trackers: {e}")
            return []

    @staticmethod
    async def _map_fields_with_gemini(fields: List[Dict[str, Any]], profile: Dict[str, Any], data: Dict[str, Any]) -> List[Dict[str, Any]]:
        model = get_gemini_client()
        if not model:
            # Simple fallback maps name, email, phone based on labels
            result = []
            for f in fields:
                lbl = f["label"].lower()
                val = ""
                if "first name" in lbl: val = profile.get("full_name", "").split()[0]
                elif "last name" in lbl:
                    parts = profile.get("full_name", "").split()
                    val = parts[-1] if len(parts) > 1 else ""
                elif "name" in lbl: val = profile.get("full_name", "")
                elif "email" in lbl: val = profile.get("email", "")
                elif "phone" in lbl: val = profile.get("phone", "")
                elif "linkedin" in lbl: val = profile.get("linkedin_profile", "")
                elif "github" in lbl: val = profile.get("github_profile", "")
                
                result.append({**f, "value": val})
            return result

        prompt = f"""
        You are an AI assistant filling out a job application form. Map each form field below to the best answer based on the candidate's profile and the job description.
        
        Candidate Profile:
        Full Name: {profile.get('full_name')}
        Email: {profile.get('email')}
        Phone: {profile.get('phone')}
        Location/Address: {profile.get('address', 'United States')}
        LinkedIn: {profile.get('linkedin_profile')}
        GitHub: {profile.get('github_profile')}
        Portfolio: {profile.get('portfolio_url')}
        Skills: {profile.get('skills')}
        Experience: {profile.get('experience')}
        Education: {profile.get('education')}
        
        Job Details:
        Company: {data.get('company')}
        Role: {data.get('role')}
        Cover Letter Content: {data.get('cover_letter_text')}
        
        Form Fields to fill (mapped by smart_id):
        {json_dump_helper(fields)}
        
        Instructions:
        1. Return answers for standard fields (email, name, phone, links).
        2. If a field asks for custom developer questions, generate a truthful, high-quality response based on the candidate's profile.
        3. Never invent experience, certifications, or grades. Keep responses factual.
        4. For select dropdowns, pick the value of the option that matches best. Return the exact value.
        5. Return ONLY a valid JSON list matching this structure:
        [
          {{
            "smart_id": "smart-0",
            "value": "answer text or select option value"
          }}
        ]
        """
        try:
            res = model.generate_content(prompt)
            text = res.text.strip()
            text = re.sub(r'^```json\s*|\s*```$', '', text, flags=re.MULTILINE)
            import json
            mapping = json.loads(text)
            
            # Merge value mapping back into original fields list
            mapping_dict = {item["smart_id"]: item["value"] for item in mapping}
            for f in fields:
                f["value"] = mapping_dict.get(f["smart_id"], "")
            return fields
        except Exception as e:
            logger.error(f"Gemini mapping failed: {e}")
            return fields

    @staticmethod
    async def _apply_autofill_values(page, mapped_fields: List[Dict[str, Any]]):
        for field in mapped_fields:
            smart_id = field["smart_id"]
            val = field.get("value")
            if val is None or val == "":
                continue
                
            selector = f'[data-smart-id="{smart_id}"]'
            try:
                el = await page.query_selector(selector)
                if not el: continue
                
                tag = field["tag"]
                ftype = field["type"]
                
                if tag == "select":
                    await page.select_option(selector, value=val)
                elif ftype == "checkbox":
                    if str(val).lower() in ["true", "yes", "check", "1"]:
                        await page.check(selector)
                elif ftype == "radio":
                    # For radio buttons, check if the selector text/value matches
                    await page.check(selector)
                else:
                    await page.fill(selector, str(val))
                    
                await asyncio.sleep(0.1) # Small pause to simulate real typing
            except Exception as e:
                logger.warning(f"Failed to fill element {smart_id}: {e}")

    @staticmethod
    async def _download_temp_file(url: str, suffix: str) -> str:
        try:
            r = requests.get(url, stream=True)
            if r.status_code == 200:
                with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as f:
                    for chunk in r.iter_content(chunk_size=8192):
                        f.write(chunk)
                    return f.name
        except Exception as e:
            logger.error(f"Failed to download resume file: {e}")
        return ""

    @staticmethod
    async def _upload_file_playwright(page, file_path: str, keywords: List[str]) -> bool:
        # Search for file inputs
        inputs = await page.query_selector_all("input[type='file']")
        for el in inputs:
            try:
                name = await el.get_attribute("name") or ""
                el_id = await el.get_attribute("id") or ""
                # Check for associated label
                label_text = ""
                if el_id:
                    lbl = await page.query_selector(f"label[for='{el_id}']")
                    if lbl: label_text = await lbl.inner_text()
                
                combined_desc = (name + " " + el_id + " " + label_text).lower()
                if any(kw in combined_desc for kw in keywords):
                    await el.set_input_files(file_path)
                    return True
            except Exception:
                pass
        
        # Fallback: if only one file input exists, try uploading to it
        if len(inputs) == 1:
            try:
                await inputs[0].set_input_files(file_path)
                return True
            except Exception:
                pass
                
        return False

    @staticmethod
    async def _click_submit_button(page) -> bool:
        # Tries to find and click submit/apply button
        submit_selectors = [
            "button[type='submit']",
            "input[type='submit']",
            "button:has-text('Submit')",
            "button:has-text('Apply')",
            "button:has-text('Complete')"
        ]
        for sel in submit_selectors:
            try:
                btn = await page.query_selector(sel)
                if btn and await btn.is_visible():
                    await btn.click()
                    try:
                        await page.wait_for_load_state("networkidle", timeout=10000)
                    except Exception:
                        pass
                    return True
            except Exception:
                pass
        return False

def json_dump_helper(obj: Any) -> str:
    import json
    try:
        return json.dumps(obj)
    except Exception:
        return str(obj)
