import os
import logging

logger = logging.getLogger("JobApplicationAgent.StorageService")

class StorageService:
    @staticmethod
    def upload_document(bucket_name: str, file_path: str, destination_name: str) -> str:
        """
        Uploads a file to a Supabase storage bucket. Falls back to a local path URL if offline.
        """
        logger.info(f"Uploading file {os.path.basename(file_path)} to Supabase bucket {bucket_name}...")
        
        from app import get_sb
        sb = get_sb()
        if not sb:
            logger.warning("Supabase client is not available. Falling back to local storage URL path.")
            return f"/static/uploads/{destination_name}"
            
        try:
            with open(file_path, 'rb') as f:
                # Attempt storage upload
                sb.storage.from_(bucket_name).upload(
                    path=destination_name,
                    file=f,
                    file_options={"cache-control": "3600", "upsert": "true"}
                )
            
            # Get public URL
            public_url = sb.storage.from_(bucket_name).get_public_url(destination_name)
            logger.info(f"Supabase upload complete: {public_url}")
            return public_url
        except Exception as e:
            logger.warning(f"Supabase storage upload failed: {e}. Falling back to local URL.")
            # Ensure local access folder is ready
            base_dir = r"c:\PROJECTS\SKILL PATH\AI-CATALYST-main\AI-CATALYST-main"
            upload_dir = os.path.join(base_dir, "static", "uploads")
            os.makedirs(upload_dir, exist_ok=True)
            local_dest = os.path.join(upload_dir, destination_name)
            try:
                import shutil
                shutil.copy(file_path, local_dest)
            except Exception:
                pass
            return f"/static/uploads/{destination_name}"
