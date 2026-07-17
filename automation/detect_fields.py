import logging

logger = logging.getLogger("JobApplicationAgent.FieldDetector")

class FieldDetector:
    @staticmethod
    async def detect_fields(page) -> list[dict]:
        """
        Dynamically extracts all visible input fields, textareas, selects, and uploads on the current page.
        Returns a list of structured JSON field descriptors.
        """
        logger.info("Scanning page DOM for application input fields...")
        
        raw_elements = await page.query_selector_all("input, textarea, select")
        fields = []
        
        for idx, element in enumerate(raw_elements):
            if not await element.is_visible():
                continue
                
            el_type = await element.get_attribute("type") or ""
            if el_type in ["hidden", "submit", "button", "checkbox", "radio"]:
                continue
                
            el_id = await element.get_attribute("id") or ""
            name = await element.get_attribute("name") or ""
            placeholder = await element.get_attribute("placeholder") or ""
            required = await element.get_attribute("required") is not None
            tag_name = await element.evaluate("el => el.tagName.toLowerCase()")
            
            # Find label
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
            
            fields.append({
                "id": el_id or f"field_{idx}",
                "name": name,
                "label": label_text,
                "type": el_type if tag_name == "input" else tag_name,
                "required": required,
                "placeholder": placeholder
            })
            
        logger.info(f"Found {len(fields)} interactive form fields.")
        return fields
