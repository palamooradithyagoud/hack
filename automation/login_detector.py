import asyncio
import logging

logger = logging.getLogger("JobApplicationAgent.LoginDetector")

class LoginDetector:
    @staticmethod
    async def check_login_status(page) -> bool:
        """
        Scans elements on the page to determine if there is an active logged-in session.
        """
        login_indicators = [
            "text=Sign Out", "text=Logout", "text=log out", "text=sign out",
            "a[href*='logout']", "a[href*='signout']",
            "div[class*='avatar']", "img[class*='profile']",
            "text=Dashboard", "text=My Applications", "text=Welcome,"
        ]
        
        for selector in login_indicators:
            try:
                el = await page.query_selector(selector)
                if el and await el.is_visible():
                    logger.info(f"Login indicator matched: {selector}")
                    return True
            except Exception:
                continue
                
        url = page.url.lower()
        if any(path in url for path in ["dashboard", "home", "feed", "profile"]):
            logger.info(f"URL path indicates dashboard: {page.url}")
            return True
            
        return False

    @staticmethod
    async def detect_auth_required(page) -> bool:
        """
        Scans elements on the page to determine if authentication is requested.
        """
        auth_selectors = [
            "input[type='password']", "input[name*='password']",
            "text=Sign In", "text=Login", "text=Log in", "text=Sign in to",
            "button:has-text('Sign In')", "button:has-text('Log In')",
            "a[href*='login']", "a[href*='signin']"
        ]
        
        for selector in auth_selectors:
            try:
                el = await page.query_selector(selector)
                if el and await el.is_visible():
                    # Double check if we are already logged in
                    if not await LoginDetector.check_login_status(page):
                        logger.info(f"Authentication requested via selector: {selector}")
                        return True
            except Exception:
                continue
        return False

    @staticmethod
    async def wait_for_user_login(page, update_func) -> bool:
        """
        Pauses and waits for the user to complete login/OTP/CAPTCHA in the browser.
        Checks every 2 seconds for up to 5 minutes (150 iterations).
        """
        logger.info("Starting authentication wait loop...")
        for i in range(150):
            if await LoginDetector.check_login_status(page):
                logger.info("Successful user login detected.")
                return True
                
            # If the auth selectors are gone, user likely navigated or completed auth
            if not await LoginDetector.detect_auth_required(page):
                await page.wait_for_timeout(2000)
                if await LoginDetector.check_login_status(page) or not await LoginDetector.detect_auth_required(page):
                    logger.info("Auth page forms disappeared. Proceeding.")
                    return True
                    
            await asyncio.sleep(2)
        return False
