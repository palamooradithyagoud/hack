import os
import json
import re
import logging
import google.generativeai as genai

logger = logging.getLogger("VoiceMockInterview.FeedbackAgent")

class FeedbackAgent:
    @staticmethod
    def analyze_responses(transcript: list[dict], fillers: list[str] = None) -> dict:
        """
        Analyzes the full conversation transcript for verbal cues, fillers, clarity, and competence.
        Uses Gemini to perform a highly critical, realistic, and brutal evaluation.
        """
        logger.info("Analyzing conversational cues and evaluating transcript via Gemini...")
        
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
            
        # Basic counts
        num_turns = len([turn for turn in transcript if turn.get("role") == "user"])
        if num_turns == 0:
            return {
                "communication": 50, "technical": 50, "confidence": 50, "behavior": 50,
                "readiness_score": 50, "fillers_detected": {}, "voice_clarity": "Clear",
                "grammar": "Good", "weak_areas": [], "strong_areas": []
            }
            
        avg_fillers_per_turn = float(total_fillers) / num_turns

        # Check if Gemini key is available for deep brutal evaluation
        api_key = os.environ.get("GEMINI_API_KEY")
        if api_key:
            try:
                genai.configure(api_key=api_key)
                model = genai.GenerativeModel("gemini-1.5-flash")
                
                # Format transcript for prompt
                transcript_str = ""
                for turn in transcript:
                    role = "Interviewer" if turn.get("role") == "assistant" else "Candidate"
                    transcript_str += f"{role}: {turn.get('content')}\n\n"
                    
                prompt = f"""
                You are a highly critical Principal Engineer and Technical Bar Raiser at a top tier FAANG company.
                You are evaluating a candidate's mock interview transcript.
                
                Be EXTREMELY BRUTAL, CRITICAL, AND REALISTIC.
                If the candidate gives incorrect answers, wrong logic, short/empty/evasive responses, or generic fluff, grade them extremely low (e.g. 0 to 50 range). Do not sugarcoat.
                A score of 70+ means they actually answered advanced questions correctly with robust logic.
                If their answer is blatantly wrong or indicates they do not understand core scaling, database, or algorithmic trade-offs, drop their Technical Score to 10-30.
                
                Evaluate the following transcript:
                {transcript_str}
                
                Tasks:
                1. Calculate scores (0 to 100) for these metrics:
                   - Communication (clarity, structure, articulation, lack of fillers)
                   - Technical competence (correctness of technical answers, scale, trade-off explanation)
                   - Confidence (assertiveness, steady explanation)
                   - Behavior (alignment, problem solving, STAR method)
                2. Calculate the overall 'readiness_score' as a weighted average: (Communication * 0.3) + (Technical * 0.3) + (Confidence * 0.2) + (Behavior * 0.2).
                3. Identify strong areas (list of strings).
                4. Identify weak areas (list of strings, focusing heavily on what was wrong or missing).
                
                Return ONLY a valid JSON object matching this structure:
                {{
                  "communication": 45,
                  "technical": 30,
                  "confidence": 40,
                  "behavior": 50,
                  "readiness_score": 41,
                  "weak_areas": ["detailed weak area 1", "detailed weak area 2"],
                  "strong_areas": ["detailed strong area 1"]
                }}
                """
                
                res = model.generate_content(prompt)
                text = res.text.strip()
                text = re.sub(r'^```json\s*|\s*```$', '', text, flags=re.MULTILINE)
                
                data = json.loads(text)
                required_keys = ["communication", "technical", "confidence", "behavior", "readiness_score", "weak_areas", "strong_areas"]
                if all(k in data for k in required_keys):
                    return {
                        "communication": int(data["communication"]),
                        "technical": int(data["technical"]),
                        "confidence": int(data["confidence"]),
                        "behavior": int(data["behavior"]),
                        "readiness_score": int(data["readiness_score"]),
                        "fillers_detected": filler_counts,
                        "voice_clarity": "Good" if avg_fillers_per_turn < 1.5 else "Moderate",
                        "grammar": "Fluent",
                        "weak_areas": data["weak_areas"],
                        "strong_areas": data["strong_areas"]
                    }
            except Exception as e:
                logger.error(f"Gemini evaluation failed, falling back to heuristics: {e}")

        # Fallback heuristic score calculations
        comm_score = max(40, min(100, int(95 - (avg_fillers_per_turn * 12))))
        conf_score = max(40, min(100, int(90 - (avg_fillers_per_turn * 15))))
        
        tech_score = 75
        tech_keywords = ["supabase", "flask", "latency", "scale", "concurrency", "security", "database", "api"]
        matched_kw = sum(1 for kw in tech_keywords if kw in full_text)
        tech_score = min(100, int(60 + (matched_kw * 5)))
        
        behavior_score = max(50, min(100, int(70 + min(num_turns * 3, 20))))
        
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
