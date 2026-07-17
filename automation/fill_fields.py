import logging

logger = logging.getLogger("JobApplicationAgent.FieldFiller")

class FieldFiller:
    @staticmethod
    async def fill(page, field_id: str, value: str):
        """
        Locates the field by ID and inputs the value (handles textbox, select dropdowns, and textarea).
        """
        element = await page.query_selector(f"#{field_id}")
        if not element:
            # Fallback to query by name
            element = await page.query_selector(f"[name='{field_id}']")
            
        if not element:
            logger.warning(f"Could not locate form element for key: {field_id}")
            return False
            
        tag_name = await element.evaluate("el => el.tagName.toLowerCase()")
        el_type = await element.get_attribute("type") or ""
        
        try:
            if tag_name == "select":
                # Handle dropdown selection
                await element.select_option(value=value)
            elif el_type in ["checkbox", "radio"]:
                # Checked state
                if value.lower() in ["true", "yes", "1", "on"]:
                    await element.check()
            else:
                # Text input or textarea
                await element.focus()
                await element.fill(value)
            return True
        except Exception as e:
            logger.error(f"Error filling field '{field_id}': {e}")
            return False
        
    @staticmethod
    async def classify_field(label: str, tag_name: str) -> str:
        """
        Classifies form fields based on label text or elements.
        """
        l = label.lower()
        if "first name" in l:
            return "first_name"
        elif "last name" in l:
            return "last_name"
        elif "full name" in l or "name" in l:
            return "full_name"
        elif "email" in l or "mail" in l:
            return "email"
        elif "phone" in l or "mobile" in l or "contact" in l:
            return "phone"
        elif "linkedin" in l:
            return "linkedin"
        elif "github" in l:
            return "github"
        elif "portfolio" in l or "website" in l:
            return "portfolio"
        elif "resume" in l or "cv" in l:
            return "resume"
        elif "cover letter" in l:
            return "cover_letter"
        elif tag_name == "textarea" or "why" in l or "describe" in l or "tell us" in l or "?" in l:
            return "essay"
        return "other"
