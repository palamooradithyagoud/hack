import logging

logger = logging.getLogger("VoiceMockInterview.ConversationMemory")

class ConversationMemory:
    def __init__(self):
        # Stores history as a list of {"role": "system"/"user"/"assistant", "content": "..."}
        self.messages = []

    def clear(self):
        self.messages = []

    def add_message(self, role: str, content: str):
        self.messages.append({"role": role, "content": content})

    def get_history(self) -> list[dict]:
        return self.messages

    def set_system_context(self, system_prompt: str):
        """
        Sets or updates the initial system prompt instructions.
        """
        # Ensure the first message is the system prompt
        if self.messages and self.messages[0]["role"] == "system":
            self.messages[0]["content"] = system_prompt
        else:
            self.messages.insert(0, {"role": "system", "content": system_prompt})
