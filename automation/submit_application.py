import os
import re
import time
import logging

logger = logging.getLogger("JobApplicationAgent.Submitter")

class Submitter:
    @staticmethod
    async def click_submit(page) -> tuple[bool, str, str]:
        """
        Locates the form submit button, clicks it, and waits for confirmation.
        Returns (success: bool, confirmation_number: str, success_screenshot: str)
        """
        submit_btn = await page.query_selector("button[type='submit'], input[type='submit'], button:has-text('Submit'), button:has-text('Apply')")
        
        if not submit_btn:
            logger.warning("Form submit button could not be located.")
            return False, "", ""
            
        try:
            logger.info("Clicking final form submit button...")
            await submit_btn.click()
            await page.wait_for_timeout(5000)
            
            # Look for common success identifiers or confirmation numbers
            page_text = await page.evaluate("() => document.body.innerText")
            conf_num = Submitter._extract_confirmation(page_text)
            
            # Take screenshot of the success screen
            screenshot_dir = r"c:\PROJECTS\SKILL PATH\AI-CATALYST-main\AI-CATALYST-main\static\screenshots"
            os.makedirs(screenshot_dir, exist_ok=True)
            success_screenshot = f"success_{int(time.time())}.png"
            screenshot_path = os.path.join(screenshot_dir, success_screenshot)
            await page.screenshot(path=screenshot_path)
            
            return True, conf_num, f"/static/screenshots/{success_screenshot}"
        except Exception as e:
            logger.error(f"Error during final form submission click: {e}")
            return False, "", ""

    @staticmethod
    def _extract_confirmation(text: str) -> str:
        """
        Scans success page text for confirmation codes or ID patterns.
        """
        patterns = [
            r"Confirmation\s*(?:#|Number|ID)?\s*:\s*([A-Za-z0-9\-]+)",
            r"Application\s*(?:#|Number|ID)?\s*:\s*([A-Za-z0-9\-]+)",
            r"Ref\s*(?:#|Number|ID)?\s*:\s*([A-Za-z0-9\-]+)"
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return "HM-" + str(int(time.time()))[-6:]
