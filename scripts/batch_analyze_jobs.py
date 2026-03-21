#!/usr/bin/env python3
"""
Batch analyze LinkedIn jobs via Gemini 3.1 Pro Preview.
Usage:
  python3 batch_analyze_jobs.py              # last 7 days
  python3 batch_analyze_jobs.py --days 1     # last 1 day
  python3 batch_analyze_jobs.py --days 3     # last 3 days
  python3 batch_analyze_jobs.py --top 10     # only show top 10

Saves results to batch_analysis_results.json + prints ranked summary.
"""

import json
import time
import re
import sys
import os
import argparse
import requests
from datetime import datetime

# ─── CONFIG ───────────────────────────────────────────────────────────────────
GEMINI_KEY    = os.environ.get("GEMINI_KEY", "")
GEMINI_MODEL  = "gemini-3.1-pro-preview"
GEMINI_URL    = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
N8N_BASE      = os.environ.get("N8N_BASE", "http://localhost:5678")
N8N_JOBS_API  = f"{N8N_BASE}/webhook/jobs-api"
OUTPUT_FILE   = os.path.join(os.path.dirname(os.path.abspath(__file__)), "batch_analysis_results.json")
THROTTLE_SEC  = 2   # seconds between Gemini calls
TIMEOUT_SEC   = 120 # per-job Gemini timeout

# ─── CANDIDATE PROFILE ───────────────────────────────────────────────────────
CANDIDATE = """MSCS Student (Dec 2026) | 2yr SWE experience (high-throughput APIs, Spring Boot/Redis/AWS) | ML publication | Work authorized
STACK: Java, Python, Spring Boot, React, FastAPI, AWS, Docker, PostgreSQL, MongoDB, Redis, Kafka, PyTorch, TensorFlow, LLMs, RAG, microservices, REST APIs"""

# ─── CONNECTIONS MAP ──────────────────────────────────────────────────────────
CONNECTIONS_MAP = {
    # Example: "company_name": [{"name": "Contact Name", "role": "Their Role"}],
    # Populate with your LinkedIn connections to personalize outreach
}

def get_connections(company: str) -> list:
    key = re.sub(r'[.,®™]', '', company.lower().strip()).strip()
    clean = re.sub(r'\s+(inc|corp|ltd|llc|technologies|technology|labs|systems|software|group)$', '', key).strip()
    for k in [key, clean]:
        if k in CONNECTIONS_MAP and CONNECTIONS_MAP[k]:
            return CONNECTIONS_MAP[k]
        for mapKey in CONNECTIONS_MAP:
            if k in mapKey or mapKey in k:
                if CONNECTIONS_MAP[mapKey]:
                    return CONNECTIONS_MAP[mapKey]
    return []

def call_gemini(prompt: str, max_tokens: int = 8192) -> dict:
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens}
    }
    resp = requests.post(f"{GEMINI_URL}?key={GEMINI_KEY}", json=payload,
                         timeout=TIMEOUT_SEC, headers={"Content-Type": "application/json"})
    resp.raise_for_status()
    data = resp.json()
    parts = data["candidates"][0]["content"].get("parts", [])
    raw = ""
    for part in parts:
        if part.get("text") and not part.get("thought"):
            raw = part["text"]
            break
    if not raw and parts:
        raw = parts[-1].get("text", "")
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise ValueError("No JSON in Gemini response")
    return json.loads(m.group(0))

def enrich_description(job: dict) -> str:
    """Use Gemini to generate a realistic JD when Apify didn't capture one."""
    title = job.get('title', '')
    company = job.get('company', '')
    location = job.get('location', '')
    prompt = f"""Generate a realistic job description for this internship posting based on your knowledge of the company and role. Keep it factual and concise (300-400 words). Include: responsibilities, requirements, preferred qualifications, tech stack if known.

Title: {title}
Company: {company}
Location: {location}

Return ONLY the job description text, no JSON, no markdown headers."""
    try:
        payload = {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"maxOutputTokens": 2048}
        }
        resp = requests.post(f"{GEMINI_URL}?key={GEMINI_KEY}", json=payload,
                             timeout=60, headers={"Content-Type": "application/json"})
        resp.raise_for_status()
        data = resp.json()
        parts = data["candidates"][0]["content"].get("parts", [])
        for part in parts:
            if part.get("text") and not part.get("thought"):
                return part["text"].strip()
        return parts[-1].get("text", "").strip() if parts else ""
    except Exception as e:
        print(f"    (enrich failed: {e})")
        return ""

def build_analysis_prompt(job: dict) -> str:
    jd = (job.get('description') or '')[:8000]
    company = job.get('company', '')
    conns = get_connections(company)
    conn_ctx = ''
    if conns:
        names = ', '.join(f"{c['name']} ({c['role']})" for c in conns)
        conn_ctx = f"\nCONNECTIONS: {names} — referral viable"

    desc_line = ('DESCRIPTION:\n' + jd) if jd else 'No description available — score based on company/title/location only.'
    enriched = ' (AI-enriched)' if job.get('_enriched') else ''

    return f"""You are a senior technical recruiter. Analyze this internship posting for the candidate. Score 0-100 based on ACTUAL fit (not the example value).

CANDIDATE: {CANDIDATE}
{conn_ctx}

JOB: {job.get('title', '')} at {company} ({job.get('location', 'USA')}){enriched}
{desc_line}

VISA: "must be authorized" / "cannot sponsor" = NOT a blocker (CPT/OPT = authorized). Only fail on "US citizen only" or "active security clearance".

SCORING GUIDE:
- 85-100: Perfect match (title+stack+company alignment, no blockers)
- 70-84: Strong match (most skills align, good company)
- 55-69: Decent match (some skill gaps or less relevant role)
- 40-54: Weak match (significant gaps or non-tech role)
- 0-39: Poor match (clearance required, wrong field, etc.)

Return ONLY valid JSON:
{{"score":0,"summary":"2-sentence honest assessment","ats_keywords":["exact JD phrase"],"matching_skills":["skill"],"missing_skills":["skill"],"interview_difficulty":"Medium","red_flags":[],"recommendation":"APPLY","apply_rationale":"one sentence"}}"""

def main():
    parser = argparse.ArgumentParser(description='Batch analyze LinkedIn jobs')
    parser.add_argument('--days', type=int, default=7, help='Number of days to look back (default: 7)')
    parser.add_argument('--top', type=int, default=0, help='Only show top N results (default: all)')
    parser.add_argument('--enrich', action='store_true', default=True, help='Enrich empty descriptions via Gemini')
    parser.add_argument('--no-enrich', dest='enrich', action='store_false', help='Skip description enrichment')
    args = parser.parse_args()

    api_url = f"{N8N_JOBS_API}?days={args.days}"
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Fetching jobs from {api_url}...")
    r = requests.get(api_url, timeout=30)
    r.raise_for_status()
    data = r.json()
    jobs = data.get('jobs', data) if isinstance(data, dict) else data
    print(f"  → {len(jobs)} jobs loaded")

    # Count empty descriptions
    empty = sum(1 for j in jobs if not (j.get('description') or '').strip())
    print(f"  → {empty} jobs have empty descriptions")

    # Enrich empty descriptions
    if args.enrich and empty > 0:
        print(f"\n  Enriching {empty} empty descriptions via Gemini 3.1 Pro...\n")
        for i, job in enumerate(jobs):
            if not (job.get('description') or '').strip():
                title = job.get('title', '?')
                company = job.get('company', '?')
                print(f"  [{i+1}] Enriching {title} @ {company}...", end=' ', flush=True)
                desc = enrich_description(job)
                if desc:
                    job['description'] = desc
                    job['_enriched'] = True
                    print(f"OK ({len(desc)} chars)")
                else:
                    print("SKIP")
                time.sleep(1)
        print()

    results = []
    errors = []

    print(f"Analyzing {len(jobs)} jobs...\n")
    for i, job in enumerate(jobs, 1):
        title   = job.get('title', 'Unknown')
        company = job.get('company', 'Unknown')
        print(f"[{i:02d}/{len(jobs)}] {title} @ {company} ...", end=' ', flush=True)

        try:
            prompt   = build_analysis_prompt(job)
            analysis = call_gemini(prompt)
            score    = analysis.get('score', 0)
            rec      = analysis.get('recommendation', '?')
            priority = 'HIGH' if score >= 70 else 'MID' if score >= 50 else 'LOW'

            job_result = {**job, '_analysis': analysis, '_score': score, '_priority': priority}
            results.append(job_result)

            conns = get_connections(company)
            conn_flag = ' 🔗' if conns else ''
            enriched = ' 📝' if job.get('_enriched') else ''
            print(f"score={score} [{rec}]{conn_flag}{enriched}")
        except Exception as e:
            print(f"ERROR: {e}")
            errors.append({'job': f"{title} @ {company}", 'error': str(e)})
            results.append({**job, '_score': 0, '_priority': 'ERROR', '_error': str(e)})

        if i < len(jobs):
            time.sleep(THROTTLE_SEC)

    # Sort by score desc
    results.sort(key=lambda x: x.get('_score', 0), reverse=True)

    # Save
    output = {
        "generated_at": datetime.now().isoformat(),
        "days": args.days,
        "total": len(results),
        "errors": len(errors),
        "enriched": sum(1 for j in results if j.get('_enriched')),
        "jobs": results
    }
    with open(OUTPUT_FILE, 'w') as f:
        json.dump(output, f, indent=2)

    # Print summary
    top = args.top or len(results)
    print(f"\n{'='*70}")
    print(f"RESULTS: {len(results)} analyzed, {len(errors)} errors, {output['enriched']} enriched")
    print(f"Saved → {OUTPUT_FILE}")

    print(f"\n{'='*70}")
    print(f"{'RANK':>4} {'SCORE':>5}  {'REC':<13} {'TITLE':<50} {'COMPANY':<20}")
    print(f"{'─'*4} {'─'*5}  {'─'*13} {'─'*50} {'─'*20}")

    for rank, j in enumerate(results[:top], 1):
        a = j.get('_analysis', {})
        score = j.get('_score', 0)
        rec = a.get('recommendation', j.get('_priority', '?'))
        title = j.get('title', '')[:48]
        company = j.get('company', '')[:18]
        conns = get_connections(j.get('company', ''))
        flags = ''
        if conns: flags += '🔗'
        if j.get('_enriched'): flags += '📝'
        color = '\033[92m' if score >= 70 else '\033[93m' if score >= 50 else '\033[91m' if score > 0 else '\033[90m'
        print(f"{rank:>4} {color}{score:>5}\033[0m  {rec:<13} {title:<50} {company:<20} {flags}")
        if score >= 70:
            print(f"     {'':>5}  → {a.get('apply_rationale', '')}")

    apply_count = sum(1 for j in results if j.get('_score', 0) >= 70)
    maybe_count = sum(1 for j in results if 50 <= j.get('_score', 0) < 70)
    skip_count = sum(1 for j in results if 0 < j.get('_score', 0) < 50)
    print(f"\n🟢 APPLY NOW: {apply_count}  |  🟡 MAYBE: {maybe_count}  |  🔴 SKIP: {skip_count}  |  ⚠️ ERRORS: {len(errors)}")

    if errors:
        print(f"\n⚠️  ERRORS:")
        for e in errors:
            print(f"  - {e['job']}: {e['error']}")

if __name__ == '__main__':
    main()
