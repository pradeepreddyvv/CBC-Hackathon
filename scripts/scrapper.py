"""
TinyFish Web Scraper for Interview Research
Scrapes real interview data from Reddit, LeetCode, Glassdoor, GeeksForGeeks
using TinyFish Web Agent API.

Usage:
    python scrapper.py --company "Amazon" --role "SDE" [--api-key YOUR_KEY]

Or as a module:
    from scrapper import scrape_interview_data
    data = await scrape_interview_data("Amazon", "SDE", api_key="...")
"""

import asyncio
import json
import os
import sys
import argparse
import httpx
from typing import Optional


TINYFISH_API_URL = "https://agent.tinyfish.ai/v1/automation/run-sse"
TINYFISH_API_KEY = os.environ.get("TINYFISH_API_KEY", "")


# ── Sources to scrape ────────────────────────────────────────────

def get_scrape_targets(company: str, role: str):
    """Generate URLs and goals for each source."""
    company_lower = company.lower().replace(" ", "+")
    role_lower = role.lower().replace(" ", "+")

    return [
        {
            "source": "Reddit r/cscareerquestions",
            "url": f"https://www.reddit.com/r/cscareerquestions/search/?q={company_lower}+interview&sort=relevance&t=year",
            "goal": f"Find the top 5 most relevant posts about {company} {role} interview experiences. For each post, extract: the title, the key details about the interview process (rounds, questions asked, difficulty, tips), and any advice given. Return as JSON array with fields: title, content_summary, questions_mentioned, tips, difficulty_rating."
        },
        {
            "source": "Reddit r/leetcode",
            "url": f"https://www.reddit.com/r/leetcode/search/?q={company_lower}+interview&sort=relevance&t=year",
            "goal": f"Find the top 5 posts about {company} coding interview questions and experiences. Extract: post title, leetcode problems mentioned, difficulty level, interview round details, and tips. Return as JSON array with fields: title, problems_mentioned, difficulty, round_type, tips."
        },
        {
            "source": "LeetCode Discuss",
            "url": f"https://leetcode.com/discuss/interview-experience?currentPage=1&orderBy=most_relevant&query={company_lower}",
            "goal": f"Find the top 5 interview experience posts for {company}. For each, extract: title, role applied for, interview rounds described, coding questions mentioned, behavioral questions, outcome (offer/reject), and tips. Return as JSON array with fields: title, role, rounds, coding_questions, behavioral_questions, outcome, tips."
        },
        {
            "source": "Glassdoor",
            "url": f"https://www.glassdoor.com/Interview/{company_lower}-interview-questions-SRCH_KE0,{len(company)}.htm",
            "goal": f"Find interview reviews for {company} {role} positions. Extract the top 8 interview questions reported, the interview process description, difficulty rating, and any tips. Return as JSON with fields: interview_process, common_questions (array), difficulty, experience_rating, tips (array)."
        },
        {
            "source": "GeeksForGeeks",
            "url": f"https://www.geeksforgeeks.org/tag/{company_lower}-interview-experience/",
            "goal": f"Find the top 5 interview experience articles for {company}. For each, extract: title, role, rounds described, questions asked (both coding and behavioral), difficulty, and result. Return as JSON array with fields: title, role, rounds, questions, difficulty, result."
        },
    ]


# ── TinyFish API Call ────────────────────────────────────────────

async def scrape_source(client: httpx.AsyncClient, source: dict, api_key: str) -> dict:
    """Scrape a single source using TinyFish SSE API."""
    result = {
        "source": source["source"],
        "url": source["url"],
        "data": None,
        "error": None,
    }

    try:
        # TinyFish uses SSE (Server-Sent Events)
        response_text = ""
        async with client.stream(
            "POST",
            TINYFISH_API_URL,
            headers={
                "X-API-Key": api_key,
                "Content-Type": "application/json",
            },
            json={
                "url": source["url"],
                "goal": source["goal"],
            },
            timeout=120.0,
        ) as response:
            if response.status_code != 200:
                result["error"] = f"HTTP {response.status_code}"
                return result

            async for line in response.aiter_lines():
                if not line or not line.startswith("data:"):
                    continue
                data_str = line[5:].strip()
                if not data_str:
                    continue
                try:
                    event = json.loads(data_str)
                    if event.get("type") == "COMPLETE" and event.get("status") == "COMPLETED":
                        result["data"] = event.get("result")
                        return result
                    elif event.get("type") == "ERROR":
                        result["error"] = event.get("message", "Unknown error")
                        return result
                    # Accumulate text responses
                    if event.get("type") == "TEXT":
                        response_text += event.get("text", "")
                except json.JSONDecodeError:
                    continue

        # If we got text but no COMPLETE event, try to parse
        if response_text:
            match = None
            # Try to find JSON array or object
            import re
            match = re.search(r'[\[{][\s\S]*[\]}]', response_text)
            if match:
                try:
                    result["data"] = json.loads(match.group())
                except json.JSONDecodeError:
                    result["data"] = response_text
            else:
                result["data"] = response_text

    except httpx.TimeoutException:
        result["error"] = "Timeout (120s)"
    except Exception as e:
        result["error"] = str(e)

    return result


# ── Main Scraper ─────────────────────────────────────────────────

async def scrape_interview_data(
    company: str,
    role: str,
    api_key: Optional[str] = None,
    sources: Optional[list[str]] = None,
) -> dict:
    """
    Scrape interview data from multiple sources using TinyFish.

    Args:
        company: Company name (e.g., "Amazon")
        role: Role (e.g., "SDE Intern")
        api_key: TinyFish API key (falls back to TINYFISH_API_KEY env var)
        sources: Optional list of source names to scrape (default: all)

    Returns:
        dict with scraped data from each source
    """
    key = api_key or TINYFISH_API_KEY
    if not key:
        return {"error": "TINYFISH_API_KEY not set", "results": []}

    targets = get_scrape_targets(company, role)

    # Filter sources if specified
    if sources:
        source_lower = [s.lower() for s in sources]
        targets = [t for t in targets if any(s in t["source"].lower() for s in source_lower)]

    print(f"Scraping {len(targets)} sources for {company} {role}...")

    async with httpx.AsyncClient() as client:
        tasks = [scrape_source(client, target, key) for target in targets]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    scraped = []
    for r in results:
        if isinstance(r, Exception):
            scraped.append({"source": "unknown", "error": str(r), "data": None})
        else:
            scraped.append(r)
            status = "OK" if r.get("data") else f"FAILED: {r.get('error', 'no data')}"
            print(f"  [{status}] {r['source']}")

    return {
        "company": company,
        "role": role,
        "results": scraped,
        "sources_scraped": len([r for r in scraped if r.get("data")]),
        "sources_failed": len([r for r in scraped if not r.get("data")]),
    }


def format_for_research_context(scraped_data: dict) -> str:
    """
    Format scraped data into a text context string
    suitable for passing to the research API / AI model.
    """
    if not scraped_data.get("results"):
        return ""

    parts = []
    parts.append(f"=== REAL INTERVIEW DATA FOR {scraped_data['company']} {scraped_data['role']} ===\n")

    for result in scraped_data["results"]:
        if not result.get("data"):
            continue

        parts.append(f"\n--- Source: {result['source']} ---")
        data = result["data"]

        if isinstance(data, str):
            parts.append(data[:2000])
        elif isinstance(data, list):
            for item in data[:10]:
                if isinstance(item, dict):
                    for k, v in item.items():
                        if isinstance(v, list):
                            parts.append(f"  {k}: {', '.join(str(x) for x in v[:5])}")
                        else:
                            parts.append(f"  {k}: {v}")
                    parts.append("")
                else:
                    parts.append(f"  - {item}")
        elif isinstance(data, dict):
            for k, v in data.items():
                if isinstance(v, list):
                    parts.append(f"  {k}:")
                    for item in v[:10]:
                        parts.append(f"    - {item}")
                else:
                    parts.append(f"  {k}: {v}")

    context = "\n".join(parts)
    # Limit to ~4000 chars for prompt context
    return context[:4000]


# ── CLI ──────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="Scrape interview data using TinyFish")
    parser.add_argument("--company", required=True, help="Company name")
    parser.add_argument("--role", default="Software Engineer", help="Role")
    parser.add_argument("--api-key", help="TinyFish API key")
    parser.add_argument("--sources", nargs="*", help="Sources to scrape (reddit, leetcode, glassdoor, geeksforgeeks)")
    parser.add_argument("--output", help="Output JSON file path")
    parser.add_argument("--context", action="store_true", help="Print formatted context string")
    args = parser.parse_args()

    data = await scrape_interview_data(
        company=args.company,
        role=args.role,
        api_key=args.api_key,
        sources=args.sources,
    )

    if args.context:
        print("\n" + format_for_research_context(data))
    elif args.output:
        with open(args.output, "w") as f:
            json.dump(data, f, indent=2)
        print(f"\nSaved to {args.output}")
    else:
        print(json.dumps(data, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
