import os
import logging
from flask import Response

logger = logging.getLogger("VoiceMockInterview.AudioStream")

class AudioStream:
    @staticmethod
    def stream_audio_file(file_path: str) -> Response:
        """
        Streams local MP3 audio files chunk by chunk back to the client.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio stream source not found: {file_path}")

        def generate_chunks():
            with open(file_path, 'rb') as f:
                while True:
                    chunk = f.read(4096)
                    if not chunk:
                        break
                    yield chunk

        return Response(generate_chunks(), mimetype="audio/mpeg")
