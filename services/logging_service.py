import queue
import logging

logger = logging.getLogger("JobApplicationAgent.LoggingService")

class LoggingService:
    def __init__(self):
        # We reuse the global APPLY_QUEUES dict declared in app.py or imported from routes
        pass

    @staticmethod
    def emit_progress(user_queues_dict: dict, user_id: str, state: str, message: str, success: bool = True):
        """
        Pushes a structured state log into the user's active SSE queue.
        """
        if user_id not in user_queues_dict:
            user_queues_dict[user_id] = queue.Queue()
            
        logger.info(f"[{state}] {message}")
        user_queues_dict[user_id].put({
            "state": state,
            "message": message,
            "success": success
        })
