import logging

logger = logging.getLogger("VoiceMockInterview.ReportGenerator")

class ReportGenerator:
    @staticmethod
    def generate_recommendations(weak_areas: list[str]) -> list[dict]:
        """
        Creates actionable learning recommendations based on evaluated weak areas.
        """
        logger.info("Generating learning materials matching diagnostic weak areas...")
        recommendations = []
        
        has_filler_weakness = any("fillers" in wa.lower() or "fluency" in wa.lower() for wa in weak_areas)
        has_tech_weakness = any("technical" in wa.lower() or "architecture" in wa.lower() for wa in weak_areas)
        has_confidence_weakness = any("confidence" in wa.lower() or "rhythm" in wa.lower() for wa in weak_areas)

        # Baseline recommendations if empty
        if not weak_areas:
            recommendations.append({
                "title": "Mock Interview Mastery Guide",
                "type": "Article",
                "link": "https://www.youtube.com/watch?v=mock-mastery",
                "description": "Strategies to scale communication scores from 80 to 95."
            })
            
        if has_filler_weakness:
            recommendations.append({
                "title": "Speak Confidently: Eliminating Filler Words",
                "type": "YouTube Video",
                "link": "https://www.youtube.com/watch?v=elim-fillers",
                "description": "How to pause intentionally instead of saying 'um' or 'like'."
            })
            
        if has_tech_weakness:
            recommendations.append({
                "title": "System Design Fundamentals - Scales & Tradeoffs",
                "type": "YouTube Video",
                "link": "https://www.youtube.com/watch?v=sys-design",
                "description": "Proving technical alignment for senior engineering roles."
            })
            recommendations.append({
                "title": "Supabase vs Firebase Architecture Tradeoffs",
                "type": "Article",
                "link": "https://supabase.com/blog/supabase-vs-firebase",
                "description": "Understanding relational vs document schema choices."
            })
            
        if has_confidence_weakness or len(recommendations) < 2:
            recommendations.append({
                "title": "Cracking the STAR Method for Behavioral Rounds",
                "type": "Article",
                "link": "https://www.youtube.com/watch?v=star-method",
                "description": "Structuring situational statements with high impact."
            })

        return recommendations
