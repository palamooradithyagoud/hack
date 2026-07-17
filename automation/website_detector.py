import logging

logger = logging.getLogger("JobApplicationAgent.WebsiteDetector")

class WebsiteDetector:
    @staticmethod
    async def detect(page) -> str:
        """
        Inspects the page URL, meta tags, and body elements to identify the ATS.
        Returns one of: 'greenhouse', 'lever', 'workday', 'ashby', 'smartrecruiters', 'oracle', 'successfactors', 'generic'
        """
        url = page.url.lower()
        
        # URL matching heuristics
        if "greenhouse.io" in url:
            return "greenhouse"
        elif "lever.co" in url:
            return "lever"
        elif "myworkdayjobs.com" in url or "workday" in url:
            return "workday"
        elif "ashbyhq.com" in url:
            return "ashby"
        elif "smartrecruiters.com" in url:
            return "smartrecruiters"
        elif "oraclecloud.com" in url or "taleo" in url:
            return "oracle"
        elif "successfactors" in url or "sfshare" in url:
            return "successfactors"
            
        # DOM inspection heuristics
        body_html = await page.evaluate("() => document.body.innerHTML.toLowerCase()")
        
        if "greenhouse" in body_html:
            return "greenhouse"
        elif "lever-job" in body_html or "lever.co" in body_html:
            return "lever"
        elif "workday" in body_html:
            return "workday"
        elif "ashby" in body_html:
            return "ashby"
        elif "smartrecruiters" in body_html:
            return "smartrecruiters"
            
        return "generic"
