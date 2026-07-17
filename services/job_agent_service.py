import os
import re
import json
import logging
import asyncio
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("JobApplicationAgent")

BASE_DIR = r"c:\PROJECTS\SKILL PATH\AI-CATALYST-main\AI-CATALYST-main"

class JobApplicationAgent:
    def __init__(self, headless=True):
        self.headless = headless

    async def analyze_form(self, url: str):
        """
        Navigates to the job page, detects form fields, and classifies them.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.headless)
            # Create a context with standard desktop viewport and user agent to avoid bot detection
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            try:
                logger.info(f"Navigating to {url}...")
                await page.goto(url, wait_until="networkidle", timeout=30000)
                
                # Check for Apply button if we are not directly on a form page
                # Often job description pages have an "Apply Now" or "Easy Apply" button
                apply_buttons = await page.query_selector_all("text=Apply, text=apply, text='Apply Now', text='Submit Application'")
                if apply_buttons:
                    # If we found an apply button, try to click it to open the form
                    for btn in apply_buttons:
                        if await btn.is_visible():
                            logger.info("Found potential Apply button. Clicking to open form...")
                            await btn.click()
                            await page.wait_for_timeout(3000)
                            break

                # Extract inputs
                form_fields = []
                inputs = await page.query_selector_all("input, textarea, select")
                
                for idx, element in enumerate(inputs):
                    # Skip hidden fields or submit buttons
                    el_type = await element.get_attribute("type")
                    if el_type in ["hidden", "submit", "button", "checkbox", "radio"]:
                        continue
                        
                    name = await element.get_attribute("name") or ""
                    el_id = await element.get_attribute("id") or ""
                    placeholder = await element.get_attribute("placeholder") or ""
                    aria_label = await element.get_attribute("aria-label") or ""
                    tag_name = await element.evaluate("el => el.tagName.toLowerCase()")
                    
                    # Try to find associated label text
                    label_text = ""
                    if el_id:
                        label_el = await page.query_selector(f"label[for='{el_id}']")
                        if label_el:
                            label_text = await label_el.inner_text()
                    
                    if not label_text:
                        # Fallback: check closest parent or sibling text
                        label_text = await element.evaluate("""el => {
                            let label = el.closest('label');
                            if (label) return label.innerText;
                            let prev = el.previousElementSibling;
                            if (prev && prev.tagName.toLowerCase() === 'label') return prev.innerText;
                            let parent = el.parentElement;
                            if (parent) {
                                let textEl = parent.querySelector('.label, .field-label, span');
                                if (textEl) return textEl.innerText;
                            }
                            return '';
                        }""")

                    label_text = (label_text or "").strip()
                    field_key = label_text or name or el_id or placeholder or f"field_{idx}"
                    
                    # Classify field
                    classification = self._classify_field(field_key, tag_name)
                    
                    form_fields.append({
                        "index": idx,
                        "label": label_text or field_key,
                        "name": name,
                        "id": el_id,
                        "type": tag_name if tag_name != "input" else (el_type or "text"),
                        "placeholder": placeholder,
                        "classification": classification,
                        "value": ""
                    })

                # Check for captcha presence
                captcha_detected = False
                captcha_frames = await page.query_selector_all("iframe[src*='recaptcha'], iframe[src*='hcaptcha'], div[class*='captcha']")
                if captcha_frames:
                    captcha_detected = True
                    logger.warning("CAPTCHA detected on the application form page!")

                # Take screenshot of the empty form
                screenshot_dir = os.path.join(BASE_DIR, "static", "screenshots")
                os.makedirs(screenshot_dir, exist_ok=True)
                screenshot_name = f"form_empty_{int(asyncio.get_event_loop().time())}.png"
                screenshot_path = os.path.join(screenshot_dir, screenshot_name)
                await page.screenshot(path=screenshot_path)

                await browser.close()
                return {
                    "fields": form_fields,
                    "captcha_detected": captcha_detected,
                    "screenshot": f"/static/screenshots/{screenshot_name}"
                }
                
            except Exception as e:
                logger.error(f"Error during form analysis: {e}")
                if browser:
                    await browser.close()
                raise e

    def _classify_field(self, label: str, tag_name: str) -> str:
        label_lower = label.lower()
        if "first name" in label_lower:
            return "first_name"
        elif "last name" in label_lower:
            return "last_name"
        elif "full name" in label_lower or "name" in label_lower:
            return "full_name"
        elif "email" in label_lower or "mail" in label_lower:
            return "email"
        elif "phone" in label_lower or "mobile" in label_lower or "contact" in label_lower:
            return "phone"
        elif "linkedin" in label_lower:
            return "linkedin"
        elif "github" in label_lower:
            return "github"
        elif "portfolio" in label_lower or "website" in label_lower or "website" in label_lower:
            return "portfolio"
        elif "resume" in label_lower or "cv" in label_lower:
            return "resume"
        elif "cover letter" in label_lower:
            return "cover_letter"
        elif tag_name == "textarea" or "why" in label_lower or "describe" in label_lower or "tell us" in label_lower or "?" in label_lower:
            return "essay"
        return "other"

    async def fill_form(self, url: str, profile_data: dict, essay_answers: dict, submit: bool = False):
        """
        Launches Playwright, fills the form using matched profile fields and essay answers.
        Takes screenshots on success or failure.
        """
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.headless)
            context = await browser.new_context(
                viewport={"width": 1280, "height": 800},
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )
            page = await context.new_page()
            
            screenshot_dir = os.path.join(BASE_DIR, "static", "screenshots")
            os.makedirs(screenshot_dir, exist_ok=True)
            timestamp = int(asyncio.get_event_loop().time())
            
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
                
                # Check for Apply button if we are not directly on the form
                apply_buttons = await page.query_selector_all("text=Apply, text=apply, text='Apply Now', text='Submit Application'")
                if apply_buttons:
                    for btn in apply_buttons:
                        if await btn.is_visible():
                            await btn.click()
                            await page.wait_for_timeout(3000)
                            break

                inputs = await page.query_selector_all("input, textarea, select")
                filled_log = []
                unfilled_log = []

                # Split name if requested and profile has full name
                full_name = profile_data.get("full_name", "")
                first_name = ""
                last_name = ""
                if full_name:
                    parts = full_name.split(maxsplit=1)
                    first_name = parts[0]
                    last_name = parts[1] if len(parts) > 1 else ""

                for idx, element in enumerate(inputs):
                    el_type = await element.get_attribute("type")
                    if el_type in ["hidden", "submit", "button", "checkbox", "radio"]:
                        continue

                    name = await element.get_attribute("name") or ""
                    el_id = await element.get_attribute("id") or ""
                    placeholder = await element.get_attribute("placeholder") or ""
                    tag_name = await element.evaluate("el => el.tagName.toLowerCase()")
                    
                    label_text = ""
                    if el_id:
                        label_el = await page.query_selector(f"label[for='{el_id}']")
                        if label_el:
                            label_text = await label_el.inner_text()
                    
                    if not label_text:
                        label_text = await element.evaluate("""el => {
                            let label = el.closest('label');
                            if (label) return label.innerText;
                            let prev = el.previousElementSibling;
                            if (prev && prev.tagName.toLowerCase() === 'label') return prev.innerText;
                            return '';
                        }""")

                    label_text = (label_text or "").strip()
                    field_key = label_text or name or el_id or placeholder or f"field_{idx}"
                    classification = self._classify_field(field_key, tag_name)

                    # Determine fill value
                    fill_val = ""
                    if classification == "full_name":
                        fill_val = full_name
                    elif classification == "first_name":
                        fill_val = first_name
                    elif classification == "last_name":
                        fill_val = last_name
                    elif classification == "email":
                        fill_val = profile_data.get("email", "")
                    elif classification == "phone":
                        fill_val = profile_data.get("phone", "")
                    elif classification == "linkedin":
                        fill_val = profile_data.get("linkedin_profile", "")
                    elif classification == "github":
                        fill_val = profile_data.get("github_profile", "")
                    elif classification == "portfolio":
                        fill_val = profile_data.get("portfolio_url", "")
                    elif classification == "essay":
                        # Match label to keys in essay_answers
                        matched_key = None
                        for key in essay_answers.keys():
                            if key.lower() in field_key.lower() or field_key.lower() in key.lower():
                                matched_key = key
                                break
                        if matched_key:
                            fill_val = essay_answers[matched_key]
                        else:
                            # Fallback: get the first available essay answer
                            fill_val = list(essay_answers.values())[0] if essay_answers else ""

                    # Fill value if available
                    if fill_val:
                        if el_type == "file":
                            file_dir = os.path.join(BASE_DIR, "data", "temp_uploads")
                            os.makedirs(file_dir, exist_ok=True)
                            
                            file_name = "resume.pdf" if "resume" in classification else "cover_letter.pdf"
                            file_path = os.path.join(file_dir, file_name)
                            if not os.path.exists(file_path):
                                with open(file_path, "w") as tf:
                                    tf.write(f"Sample PDF File for {classification}")
                                    
                            await element.set_input_files(file_path)
                            filled_log.append(f"Uploaded {file_name} for '{field_key}'")
                        else:
                            await element.focus()
                            await element.fill(fill_val)
                            filled_log.append(f"Filled '{field_key}' with: {fill_val[:30]}...")
                    else:
                        unfilled_log.append(field_key)

                # Capture preview screenshot before final submission
                preview_screenshot = f"preview_{timestamp}.png"
                preview_path = os.path.join(screenshot_dir, preview_screenshot)
                await page.screenshot(path=preview_path)

                if submit:
                    # Attempt final form submission
                    submit_btn = await page.query_selector("button[type='submit'], input[type='submit'], button:has-text('Submit'), button:has-text('Apply')")
                    if submit_btn:
                        logger.info("Submitting form application...")
                        await submit_btn.click()
                        await page.wait_for_timeout(5000)
                        
                        # Take final success/failure screenshot
                        success_screenshot = f"success_{timestamp}.png"
                        success_path = os.path.join(screenshot_dir, success_screenshot)
                        await page.screenshot(path=success_path)
                        await browser.close()
                        
                        return {
                            "status": "Applied",
                            "filled_fields": filled_log,
                            "unfilled_fields": unfilled_log,
                            "screenshot": f"/static/screenshots/{success_screenshot}"
                        }
                    else:
                        logger.warning("Could not locate form submit button automatically.")
                        await browser.close()
                        return {
                            "status": "Pending Review",
                            "filled_fields": filled_log,
                            "unfilled_fields": unfilled_log,
                            "screenshot": f"/static/screenshots/{preview_screenshot}",
                            "error": "Submit button not found automatically. Manual confirmation required."
                        }

                await browser.close()
                return {
                    "status": "Pending Review",
                    "filled_fields": filled_log,
                    "unfilled_fields": unfilled_log,
                    "screenshot": f"/static/screenshots/{preview_screenshot}"
                }
                
            except Exception as e:
                logger.error(f"Error during form submission execution: {e}")
                # Capture error screenshot for diagnostics
                error_screenshot = f"error_{timestamp}.png"
                error_path = os.path.join(screenshot_dir, error_screenshot)
                try:
                    await page.screenshot(path=error_path)
                except Exception:
                    pass
                if browser:
                    await browser.close()
                return {
                    "status": "Failed",
                    "error": str(e),
                    "screenshot": f"/static/screenshots/{error_screenshot}" if os.path.exists(error_path) else None
                }
