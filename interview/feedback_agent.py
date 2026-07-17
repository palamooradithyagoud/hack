import logging

logger = logging.getLogger("VoiceMockInterview.FeedbackAgent")

class FeedbackAgent:
    @staticmethod
    def analyze_responses(transcript: list[dict], fillers: list[str] = None) -> dict:
        """
        Analyzes the full conversation transcript for verbal cues, fillers, clarity, and competence.
        Returns a structured metrics evaluation dict.
        """
        logger.info("Analyzing conversational cues, pauses, and speech fillers...")
        
        if not fillers:
            fillers = ["um", "uh", "like", "basically", "you know"]
            
        full_text = " ".join([turn.get("content", "") for turn in transcript if turn.get("role") == "user"]).lower()
        
        # Count fillers
        filler_counts = {}
        total_fillers = 0
        for filler in fillers:
            cnt = full_text.count(filler)
            filler_counts[filler] = cnt
            total_fillers += cnt
            
        # Basic heuristic score calculations
        num_turns = len([turn for turn in transcript if turn.get("role") == "user"])
        if num_turns == 0:
            return {
                "communication": 50, "technical": 50, "confidence": 50, "behavior": 50,
                "readiness_score": 50, "fillers_detected": {}, "voice_clarity": "Clear",
                "grammar": "Good", "weak_areas": [], "strong_areas": []
            }
            
        # Lower filler count per turn implies higher confidence & communication scores
        avg_fillers_per_turn = float(total_fillers) / num_turns
        
        comm_score = max(40, min(100, int(95 - (avg_fillers_per_turn * 12))))
        conf_score = max(40, min(100, int(90 - (avg_fillers_per_turn * 15))))
        
        # Parse technical score based on transcript content length and context keywords
        tech_score = 75
        tech_keywords = ["supabase", "flask", "latency", "scale", "concurrency", "security", "database", "api"]
        matched_kw = sum(1 for kw in tech_keywords if kw in full_text)
        tech_score = min(100, int(60 + (matched_kw * 5)))
        
        behavior_score = max(50, min(100, int(70 + min(num_turns * 3, 20))))
        
        # Total readiness calculation: Comm 30% + Tech 30% + Conf 20% + Behav 20%
        readiness_score = int(
            (comm_score * 0.3) +
            (tech_score * 0.3) +
            (conf_score * 0.2) +
            (behavior_score * 0.2)
        )
        
        weak_areas = []
        strong_areas = []
        
        if comm_score < 75:
            weak_areas.append("Speech fluency: Frequent use of fillers like 'like' or 'um'.")
        else:
            strong_areas.append("Fluent verbal delivery and structural articulation.")
            
        if tech_score < 75:
            weak_areas.append("System architecture: Could explain stack design details more deeply.")
        else:
            strong_areas.append("Strong technical explanations of framework decisions.")
            
        if conf_score < 75:
            weak_areas.append("Delivery confidence: Pauses and speech rhythm can be smoother.")
        else:
            strong_areas.append("Great posture and steady pacing during explanation rounds.")

        return {
            "communication": comm_score,
            "technical": tech_score,
            "confidence": conf_score,
            "behavior": behavior_score,
            "readiness_score": readiness_score,
            "fillers_detected": filler_counts,
            "voice_clarity": "Good" if avg_fillers_per_turn < 1.5 else "Moderate",
            "grammar": "Fluent",
            "weak_areas": weak_areas,
            "strong_areas": strong_areas
        }
