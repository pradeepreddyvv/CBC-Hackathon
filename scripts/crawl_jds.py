#!/usr/bin/env python3
"""
Fetch job descriptions for LinkedIn manual scrape jobs using Gemini with web search grounding.
Since crawl4ai needs Python 3.10+ and LinkedIn pages need auth, we use Gemini's
built-in web search to find and extract job descriptions.

Usage:
  python3 crawl_jds.py
  python3 crawl_jds.py --limit 20  # Process first 20 jobs only
"""

import json, time, sys, os, argparse, re, requests
from pathlib import Path

GEMINI_KEY = os.environ.get("GEMINI_KEY", "")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key={GEMINI_KEY}"
INPUT_FILE = Path(__file__).parent / "linkedin_manual_jobs.json"
THROTTLE = 3  # seconds between API calls


def call_gemini_search(prompt, max_tokens=4096):
    """Call Gemini with Google Search grounding for web-based content retrieval."""
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "tools": [{"google_search": {}}],
        "generationConfig": {
            "maxOutputTokens": max_tokens,
            "temperature": 0.1,
        },
    }
    r = requests.post(GEMINI_URL, json=body, timeout=60)
    r.raise_for_status()
    data = r.json()
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
    texts = [p["text"] for p in parts if "text" in p and "thought" not in p]
    return "\n".join(texts).strip()


def fetch_jd_for_job(job):
    """Use Gemini web search to find and extract the job description."""
    title = job.get("title", "")
    company = job.get("company", "")
    location = job.get("location", "")
    url = job.get("url", "")

    prompt = f"""Search the web and find the COMPLETE job description for this position:

Title: {title}
Company: {company}
Location: {location}
LinkedIn URL: {url}

Return the job description in this structured plain text format:
- Company overview (2-3 sentences)
- Role summary
- Responsibilities (bullet points)
- Requirements/Qualifications (bullet points)
- Nice to have / Preferred (bullet points if available)
- Benefits/Compensation (if available)
- Application deadline (if available)

Be thorough. Include ALL requirements and responsibilities from the actual posting.
If you cannot find the exact posting, indicate that and provide what you can find about this role at this company."""

    try:
        result = call_gemini_search(prompt, max_tokens=4096)
        if result and len(result) > 100:
            return result
    except Exception as e:
        print(f"    Error: {e}")

    return ""


def main():
    parser = argparse.ArgumentParser(description="Fetch JDs for LinkedIn manual jobs")
    parser.add_argument("--limit", type=int, default=0, help="Max jobs to process (0=all)")
    parser.add_argument("--skip-existing", action="store_true", help="Skip jobs that already have descriptions")
    args = parser.parse_args()

    print(f"Loading {INPUT_FILE}...")
    with open(INPUT_FILE) as f:
        jobs = json.load(f)
    print(f"  → {len(jobs)} jobs")

    # Filter to jobs needing descriptions
    to_process = []
    for j in jobs:
        if args.skip_existing and j.get("description", "").strip() and len(j["description"]) > 100:
            continue
        to_process.append(j)

    if args.limit > 0:
        to_process = to_process[:args.limit]

    print(f"  → {len(to_process)} jobs to fetch JDs for")

    success = 0
    errors = 0
    for i, job in enumerate(to_process, 1):
        title = job.get("title", "?")[:40]
        company = job.get("company", "?")
        print(f"  [{i:3d}/{len(to_process)}] {title} @ {company}...", end=" ", flush=True)

        jd = fetch_jd_for_job(job)
        if jd and len(jd) > 100:
            job["description"] = jd
            success += 1
            print(f"OK ({len(jd)} chars)")
        else:
            errors += 1
            print("FAILED")

        time.sleep(THROTTLE)

        # Save progress every 10 jobs
        if i % 10 == 0:
            with open(INPUT_FILE, "w") as f:
                json.dump(jobs, f, indent=2)
            print(f"    [saved progress: {success} OK, {errors} failed]")

    # Final save
    with open(INPUT_FILE, "w") as f:
        json.dump(jobs, f, indent=2)

    print(f"\n✅ Done: {success} JDs fetched, {errors} failed")
    print(f"   Saved to {INPUT_FILE}")

    # Stats
    with_desc = sum(1 for j in jobs if j.get("description", "").strip() and len(j["description"]) > 100)
    print(f"   Total with descriptions: {with_desc}/{len(jobs)}")


if __name__ == "__main__":
    main()
