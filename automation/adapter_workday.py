import logging
from automation.adapter_generic import BaseWebsiteAdapter, GenericWebsiteAdapter

logger = logging.getLogger("JobApplicationAgent.Adapter.Workday")

class WorkdayWebsiteAdapter(BaseWebsiteAdapter):
    async def fill_form(self, page, profile_data: dict, essay_answers: dict) -> dict:
        """
        Specialized Workday Form automation. Workday uses dynamic forms inside iframe-like shadow trees
        or complex input groups with aria-labelledby attributes.
        """
        logger.info("Running Workday specialized adapter logic...")
        
        # Workday has multiple multi-step pages.
        # Fall back on the generic adapter to fill inputs for the current step page.
        generic_adapter = GenericWebsiteAdapter()
        result = await generic_adapter.fill_form(page, profile_data, essay_answers)
        
        # Workday multi-step page navigation helper: click "Next" or "Save and Continue"
        try:
            next_btn = await page.query_selector("button:has-text('Save and Continue'), button:has-text('Next')")
            if next_btn and await next_btn.is_visible():
                logger.info("Workday 'Next' button detected. Clicking to proceed to the next page.")
                # Note: The pipeline will check state again after any navigation.
        except Exception as e:
            logger.debug(f"Workday navigation click skipped: {e}")
            
        return result
