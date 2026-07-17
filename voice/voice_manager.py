import logging
from voice.speech_to_text import SpeechToText
from voice.text_to_speech import TextToSpeech

logger = logging.getLogger("VoiceMockInterview.VoiceManager")

class VoiceManager:
    def __init__(self):
        self.stt = SpeechToText()
        self.tts = TextToSpeech()

    def convert_text_to_voice(self, text: str, user_id: str) -> str:
        """
        Synthesizes text input into a spoken audio MP3 URL file.
        """
        return self.tts.synthesize(text, user_id)

    def convert_voice_to_text(self, audio_file_path: str) -> str:
        """
        Transcribes voice audio recordings into text.
        """
        return self.stt.transcribe_audio(audio_file_path)
