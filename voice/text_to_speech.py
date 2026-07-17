import os
import time
import logging
from gtts import gTTS

logger = logging.getLogger("VoiceMockInterview.TextToSpeech")

class TextToSpeech:
    @staticmethod
    def synthesize(text: str, user_id: str) -> str:
        """
        Synthesizes text into an MP3 file using Google TTS (free, natural sounding).
        Saves the file to static storage and returns the local URL.
        """
        logger.info(f"Synthesizing text: '{text[:60]}...'")
        
        base_dir = r"c:\PROJECTS\SKILL PATH\AI-CATALYST-main\AI-CATALYST-main"
        audio_dir = os.path.join(base_dir, "static", "audio")
        os.makedirs(audio_dir, exist_ok=True)
        
        filename = f"speak_{user_id}_{int(time.time())}.mp3"
        filepath = os.path.join(audio_dir, filename)
        
        try:
            # Generate speech
            tts = gTTS(text=text, lang='en', tld='co.uk') # British accent for professional recruiter tone
            tts.save(filepath)
            
            logger.info(f"Audio file saved successfully: {filepath}")
            return f"/static/audio/{filename}"
        except Exception as e:
            logger.error(f"Error during Text-to-Speech synthesis: {e}")
            return ""
