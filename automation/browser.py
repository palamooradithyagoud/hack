import logging
from playwright.async_api import async_playwright, Browser, BrowserContext

logger = logging.getLogger("JobApplicationAgent.Browser")

class BrowserManager:
    @staticmethod
    async def launch(headless: bool = False) -> tuple[Browser, BrowserContext]:
        """
        Launches the Playwright browser and returns the Browser and Context instances.
        """
        logger.info(f"Launching Playwright browser (headless={headless})...")
        playwright_instance = await async_playwright().start()
        browser = await playwright_instance.chromium.launch(headless=headless)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        return browser, context
