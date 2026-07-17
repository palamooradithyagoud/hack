import os
import logging

logger = logging.getLogger("JobApplicationAgent.FileUploader")

class FileUploader:
    @staticmethod
    async def upload(page, field_id: str, file_path: str) -> bool:
        """
        Locates the file upload input element and attaches the document file path.
        """
        element = await page.query_selector(f"#{field_id}")
        if not element:
            element = await page.query_selector(f"[name='{field_id}']")
            
        if not element:
            logger.warning(f"Could not locate file input for key: {field_id}")
            return False
            
        if not os.path.exists(file_path):
            logger.error(f"Upload abort: local file not found at path: {file_path}")
            return False

        try:
            await element.set_input_files(file_path)
            logger.info(f"Successfully uploaded: {os.path.basename(file_path)} to field {field_id}")
            return True
        except Exception as e:
            logger.error(f"Error uploading file to field '{field_id}': {e}")
            return False
