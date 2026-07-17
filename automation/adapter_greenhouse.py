import logging
from automation.adapter_generic import BaseWebsiteAdapter, GenericWebsiteAdapter

logger = logging.getLogger("JobApplicationAgent.Adapter.Greenhouse")

class GreenhouseWebsiteAdapter(BaseWebsiteAdapter):
    async def fill_form(self, page, profile_data: dict, essay_answers: dict) -> dict:
        """
        Specialized Greenhouse Form automation. Greenhouse usually contains predictable element IDs:
        #first_name, #last_name, #email, #phone, #job_application_answers_attributes_...
        """
        logger.info("Running Greenhouse specialized adapter logic...")
        
        # Greenhouse forms are single-page and regular HTML inputs. We can fall back
        # on the generic adapter, but we can also target Greenhouse-specific inputs directly first.
        generic_adapter = GenericWebsiteAdapter()
        result = await generic_adapter.fill_form(page, profile_data, essay_answers)
        
        # Greenhouse custom checks: e.g. clicking checkboxes for equal opportunity
        try:
            equal_opportunity_checkboxes = await page.query_selector_all("input[type='checkbox'][name*='eeoc']")
            for cb in equal_opportunity_checkboxes:
                await cb.check()
        except Exception as e:
            logger.debug(f"EEOC checkbox click skipped: {e}")
            
        return result
