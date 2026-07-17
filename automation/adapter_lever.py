import logging
from automation.adapter_generic import BaseWebsiteAdapter, GenericWebsiteAdapter

logger = logging.getLogger("JobApplicationAgent.Adapter.Lever")

class LeverWebsiteAdapter(BaseWebsiteAdapter):
    async def fill_form(self, page, profile_data: dict, essay_answers: dict) -> dict:
        """
        Specialized Lever Form automation. Lever uses input fields with names:
        name, email, phone, org, urls[LinkedIn], urls[GitHub], etc.
        """
        logger.info("Running Lever specialized adapter logic...")
        
        # Lever uses regular text inputs and file uploads.
        # Fall back on the generic adapter logic which maps and fills standard fields dynamically.
        generic_adapter = GenericWebsiteAdapter()
        result = await generic_adapter.fill_form(page, profile_data, essay_answers)
        
        # Lever specific upload attachment triggers
        try:
            resume_input = await page.query_selector("input[type='file'][id='resume-upload-input']")
            if resume_input:
                logger.info("Lever resume input element found.")
        except Exception as e:
            logger.debug(f"Lever specific input scan skipped: {e}")
            
        return result
