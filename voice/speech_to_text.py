import os
import logging
import google.generativeai as genai

logger = logging.getLogger("VoiceMockInterview.SpeechToText")

class SpeechToText:
    def __init__(self):
        self.api_key = os.environ.get("GEMINI_API_KEY")
        if self.api_key:
            genai.configure(api_key=self.api_key)

    def transcribe_audio(self, file_path: str) -> str:
        """
        Transcribes local audio recording files using the Gemini multimodal model.
        """
        if not self.api_key:
            raise ValueError("GEMINI_API_KEY environment variable is missing.")
            
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found at: {file_path}")

        try:
            logger.info("Uploading audio clip to Gemini for transcription...")
            audio_file = genai.upload_file(path=file_path)
            
            # Use Gemini Flash to transcribe the audio content
            model = genai.GenerativeModel("gemini-1.5-flash")
            response = model.generate_content([
                audio_file,
                "Transcribe the audio speech exactly as spoken. Do not include notes or commentary."
            ])
            
            transcript = response.text.strip()
            logger.info(f"Gemini Speech transcription complete: {transcript[:80]}...")
            
            # Clean up uploaded resource from Gemini servers
            genai.delete_file(audio_file.name)
            
            return transcript
        except Exception as e:
            logger.error(f"Failed to transcribe audio via Gemini: {e}")
            return ""
