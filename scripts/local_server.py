#!/usr/bin/env python3
"""
Local API server replacing n8n for CareerHub.
Scrapes jobs from 7 open-source GitHub internship repos, scores them via Gemini,
and serves all endpoints that career_hub.html needs.

Usage:
  python3 scripts/local_server.py

Runs on http://localhost:8080
"""

import json
import os
import re
import time
import sqlite3
import threading
from datetime import datetime, timezone, timedelta
from pathlib import Path

import requests
from fastapi import FastAPI, Query, Request
from fastapi.responses import HTMLResponse, JSONResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# ─── CONFIG ───────────────────────────────────────────────────────────────────
GEMINI_KEY = os.environ.get("GEMINI_KEY") or os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-2.0-flash")
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

BASE_DIR = Path(__file__).parent.parent
DB_PATH = BASE_DIR / "scripts" / "jobs.db"
BATCH_RESULTS_FILE = BASE_DIR / "scripts" / "batch_analysis_results.json"
CAREER_HUB_HTML = BASE_DIR / "career_hub.html"

PORT = 8080

# ─── 7 GitHub Internship Repos ───────────────────────────────────────────────
# These repos maintain curated lists of internship/new-grad positions
GITHUB_REPOS = [
    {
        "owner": "SimplifyJobs",
        "repo": "Summer2025-Internships",
        "file": "README.md",
        "branch": "dev",
        "source": "simplify-summer2025",
    },
    {
        "owner": "SimplifyJobs",
        "repo": "New-Grad-Positions",
        "file": "README.md",
        "branch": "dev",
        "source": "simplify-newgrad",
    },
    {
        "owner": "pittcsc",
        "repo": "Summer2025-Internships",
        "file": "README.md",
        "branch": "dev",
        "source": "pittcsc-summer2025",
    },
    {
        "owner": "Ouckah",
        "repo": "Summer2025-Internships",
        "file": "README.md",
        "branch": "dev",
        "source": "ouckah-summer2025",
    },
    {
        "owner": "speedyapply",
        "repo": "2025-SWE-College-Jobs",
        "file": "README.md",
        "branch": "main",
        "source": "speedyapply-2025",
    },
    {
        "owner": "ReaVNaiL",
        "repo": "New-Grad-2025",
        "file": "README.md",
        "branch": "main",
        "source": "reavnail-newgrad2025",
    },
    {
        "owner": "bsovs",
        "repo": "Fall2025-Internships",
        "file": "README.md",
        "branch": "main",
        "source": "bsovs-fall2025",
    },
]

# ─── CANDIDATE PROFILE (configurable) ────────────────────────────────────────
CANDIDATE = os.environ.get("CANDIDATE_PROFILE", "")

# ─── DATABASE ─────────────────────────────────────────────────────────────────
def get_db():
    con = sqlite3.connect(str(DB_PATH))
    con.row_factory = sqlite3.Row
    return con

def init_db():
    con = get_db()
    con.execute("""CREATE TABLE IF NOT EXISTS jobs (
        job_id TEXT PRIMARY KEY,
        title TEXT,
        company TEXT,
        location TEXT,
        url TEXT,
        description TEXT DEFAULT '',
        source TEXT,
        posted_at TEXT,
        fetched_at TEXT,
        score INTEGER DEFAULT NULL,
        analysis TEXT DEFAULT NULL
    )""")
    con.execute("CREATE INDEX IF NOT EXISTS idx_source ON jobs(source)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_fetched ON jobs(fetched_at)")
    con.commit()
    con.close()

def db_upsert_job(job):
    con = get_db()
    con.execute("""INSERT OR REPLACE INTO jobs
        (job_id, title, company, location, url, description, source, posted_at, fetched_at, score, analysis)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (job.get("job_id", ""), job.get("title", ""), job.get("company", ""),
         job.get("location", ""), job.get("url", ""), job.get("description", ""),
         job.get("source", ""), job.get("posted_at", ""),
         datetime.now(timezone.utc).isoformat(),
         job.get("score"), json.dumps(job.get("analysis")) if job.get("analysis") else None))
    con.commit()
    con.close()

def db_get_jobs(days=7):
    con = get_db()
    rows = con.execute(
        "SELECT * FROM jobs ORDER BY fetched_at DESC"
    ).fetchall()
    con.close()
    return [dict(r) for r in rows]

def db_get_scored_jobs():
    con = get_db()
    rows = con.execute(
        "SELECT * FROM jobs WHERE score IS NOT NULL ORDER BY score DESC"
    ).fetchall()
    con.close()
    results = []
    for r in rows:
        d = dict(r)
        if d.get("analysis"):
            try:
                d["_analysis"] = json.loads(d["analysis"])
                d["_score"] = d["score"]
            except:
                pass
        results.append(d)
    return results

def db_job_count():
    con = get_db()
    n = con.execute("SELECT COUNT(*) FROM jobs").fetchone()[0]
    con.close()
    return n

# ─── GITHUB README PARSER ────────────────────────────────────────────────────
def fetch_github_readme(repo_info):
    """Fetch raw README from GitHub repo."""
    url = f"https://raw.githubusercontent.com/{repo_info['owner']}/{repo_info['repo']}/{repo_info['branch']}/{repo_info['file']}"
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            return r.text
        # Try main branch as fallback
        url2 = f"https://raw.githubusercontent.com/{repo_info['owner']}/{repo_info['repo']}/main/{repo_info['file']}"
        r2 = requests.get(url2, timeout=30)
        return r2.text if r2.status_code == 200 else None
    except Exception as e:
        print(f"  Error fetching {repo_info['owner']}/{repo_info['repo']}: {e}")
        return None

def parse_markdown_table(readme_text, source):
    """Parse job listings from GitHub README markdown tables."""
    jobs = []
    lines = readme_text.split("\n")
    in_table = False
    headers = []

    for line in lines:
        line = line.strip()
        if not line:
            in_table = False
            headers = []
            continue

        # Detect table header
        if "|" in line and not in_table:
            cells = [c.strip() for c in line.split("|")]
            cells = [c for c in cells if c]
            # Check if this looks like a header row
            lower_cells = [c.lower() for c in cells]
            if any(kw in " ".join(lower_cells) for kw in ["company", "name", "role", "title", "position"]):
                headers = lower_cells
                in_table = True
                continue

        # Skip separator row
        if in_table and re.match(r"^[\|\s\-:]+$", line):
            continue

        # Parse data row
        if in_table and "|" in line:
            cells = [c.strip() for c in line.split("|")]
            cells = [c for c in cells if c != ""]

            if len(cells) < 2:
                continue

            job = {"source": source}

            for i, header in enumerate(headers):
                if i >= len(cells):
                    break
                cell = cells[i]
                # Strip HTML tags and extract href if present
                html_link = re.search(r'href="([^"]*)"', cell)
                cell_clean = re.sub(r'<[^>]+>', '', cell).strip()
                # Strip markdown links: [text](url) → text + extract url
                link_match = re.findall(r'\[([^\]]*)\]\(([^)]*)\)', cell)

                if "company" in header or "name" in header:
                    if link_match:
                        job["company"] = re.sub(r'<[^>]+>', '', link_match[0][0]).strip()
                        if not job.get("url"):
                            job["url"] = link_match[0][1].strip()
                    elif html_link:
                        job["company"] = cell_clean
                        if not job.get("url"):
                            job["url"] = html_link.group(1)
                    else:
                        job["company"] = re.sub(r'[*_~`]', '', cell_clean).strip()

                elif "role" in header or "title" in header or "position" in header:
                    if link_match:
                        job["title"] = re.sub(r'<[^>]+>', '', link_match[0][0]).strip()
                        job["url"] = link_match[0][1].strip()
                    elif html_link:
                        job["title"] = cell_clean
                        job["url"] = html_link.group(1)
                    else:
                        job["title"] = re.sub(r'[*_~`]', '', cell_clean).strip()

                elif "location" in header:
                    job["location"] = re.sub(r'[*_~`]', '', cell_clean).strip()

                elif "date" in header or "added" in header or "posted" in header:
                    job["posted_at"] = re.sub(r'[*_~`]', '', cell).strip()

                elif "link" in header or "apply" in header or "application" in header:
                    if link_match:
                        job["url"] = link_match[0][1].strip()
                    elif cell.startswith("http"):
                        job["url"] = cell.strip()

            # Filter out closed/unavailable positions
            full_line_lower = line.lower()
            if "closed" in full_line_lower or "🔒" in line or "❌" in line:
                continue

            # Must have at least company and title
            if job.get("company") and job.get("title"):
                # Generate a stable job_id
                job["job_id"] = f"{source}_{job['company']}_{job['title']}".replace(" ", "_")[:120]
                job.setdefault("url", "")
                job.setdefault("location", "USA")
                job.setdefault("posted_at", "")
                job.setdefault("description", "")
                jobs.append(job)

    return jobs


def scrape_all_github_repos():
    """Scrape jobs from all 7 GitHub repos."""
    all_jobs = []
    seen_ids = set()

    for repo in GITHUB_REPOS:
        label = f"{repo['owner']}/{repo['repo']}"
        print(f"  Fetching {label}...", end=" ", flush=True)
        readme = fetch_github_readme(repo)
        if not readme:
            print("SKIP (not found)")
            continue

        jobs = parse_markdown_table(readme, repo["source"])
        new_count = 0
        for job in jobs:
            if job["job_id"] not in seen_ids:
                seen_ids.add(job["job_id"])
                all_jobs.append(job)
                new_count += 1
        print(f"{new_count} jobs")

    return all_jobs


# ─── GEMINI API ───────────────────────────────────────────────────────────────
def call_gemini(prompt, max_tokens=8192, temperature=0.7):
    """Call Gemini API and return raw text response."""
    if not GEMINI_KEY:
        raise ValueError("GEMINI_KEY not set")
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens, "temperature": temperature},
    }
    resp = requests.post(
        f"{GEMINI_URL}?key={GEMINI_KEY}",
        json=payload,
        timeout=120,
        headers={"Content-Type": "application/json"},
    )
    resp.raise_for_status()
    data = resp.json()
    parts = data["candidates"][0]["content"].get("parts", [])
    for part in parts:
        if part.get("text") and not part.get("thought"):
            return part["text"]
    return parts[-1].get("text", "") if parts else ""


def call_gemini_json(prompt, max_tokens=8192):
    """Call Gemini and parse JSON from response."""
    raw = call_gemini(prompt, max_tokens, temperature=0.3)
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        raise ValueError("No JSON in Gemini response")
    return json.loads(m.group(0))


def score_job(job, candidate_profile=""):
    """Score a single job against candidate profile."""
    jd = (job.get("description") or "")[:8000]
    company = job.get("company", "")
    title = job.get("title", "")
    location = job.get("location", "USA")

    desc_line = f"DESCRIPTION:\n{jd}" if jd else "No description available — score based on company/title/location only."

    candidate = candidate_profile or CANDIDATE or "General software engineering student looking for internships"

    prompt = f"""You are a senior technical recruiter. Analyze this job posting for the candidate. Score 0-100 based on ACTUAL fit.

CANDIDATE: {candidate}

JOB: {title} at {company} ({location})
{desc_line}

SCORING GUIDE:
- 85-100: Perfect match (title+stack+company alignment, no blockers)
- 70-84: Strong match (most skills align, good company)
- 55-69: Decent match (some skill gaps or less relevant role)
- 40-54: Weak match (significant gaps or non-tech role)
- 0-39: Poor match (clearance required, wrong field, etc.)

Return ONLY valid JSON:
{{"score":0,"summary":"2-sentence honest assessment","ats_keywords":["exact JD phrase"],"matching_skills":["skill"],"missing_skills":["skill"],"interview_difficulty":"Medium","red_flags":[],"recommendation":"APPLY","apply_rationale":"one sentence"}}"""

    try:
        analysis = call_gemini_json(prompt)
        return analysis
    except Exception as e:
        print(f"  Score error for {title} @ {company}: {e}")
        return None


# ─── FASTAPI APP ──────────────────────────────────────────────────────────────
app = FastAPI(title="CareerHub Local Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def startup():
    init_db()
    # Load .env.local if exists
    env_file = BASE_DIR / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())
    global GEMINI_KEY
    GEMINI_KEY = os.environ.get("GEMINI_KEY") or os.environ.get("GEMINI_API_KEY", "")
    print(f"\n  CareerHub Local Server")
    print(f"  Gemini Key: {'set' if GEMINI_KEY else 'NOT SET'}")
    print(f"  DB: {DB_PATH}")
    print(f"  Jobs in DB: {db_job_count()}")
    print(f"  UI: http://localhost:{PORT}/\n")


# ── Serve career_hub.html at root ────────────────────────────────────────────
@app.get("/")
def serve_ui():
    if CAREER_HUB_HTML.exists():
        return HTMLResponse(CAREER_HUB_HTML.read_text())
    return HTMLResponse("<h1>career_hub.html not found</h1>", status_code=404)


# ── Health ────────────────────────────────────────────────────────────────────
@app.get("/webhook/health")
def health():
    return {"ok": True, "jobs_in_db": db_job_count(), "gemini": bool(GEMINI_KEY)}


# ── Jobs API — fetch from GitHub repos ────────────────────────────────────────
@app.get("/webhook/jobs-api")
def jobs_api(days: int = Query(default=7)):
    # Return cached jobs from DB
    jobs = db_get_jobs(days)
    if not jobs:
        # If DB is empty, trigger a scrape
        print("  DB empty — scraping GitHub repos...")
        scraped = scrape_all_github_repos()
        for j in scraped:
            db_upsert_job(j)
        jobs = db_get_jobs(days)
        print(f"  Scraped {len(jobs)} jobs total")

    # Format for frontend
    result = []
    for j in jobs:
        item = {
            "job_id": j["job_id"],
            "title": j["title"],
            "company": j["company"],
            "location": j["location"],
            "url": j["url"],
            "description": j["description"],
            "source": j["source"],
            "postedAt": j["posted_at"],
        }
        if j.get("score") is not None:
            item["_score"] = j["score"]
            if j.get("analysis"):
                try:
                    item["_analysis"] = json.loads(j["analysis"])
                except:
                    pass
        result.append(item)

    return {"jobs": result}


# ── Refresh — re-scrape GitHub repos ─────────────────────────────────────────
@app.post("/webhook/refresh-jobs")
def refresh_jobs():
    print("  Re-scraping GitHub repos...")
    scraped = scrape_all_github_repos()
    new_count = 0
    for j in scraped:
        db_upsert_job(j)
        new_count += 1
    return {"ok": True, "scraped": new_count, "total": db_job_count()}


# ── Batch Results — return scored jobs ────────────────────────────────────────
@app.get("/webhook/batch-results")
def batch_results():
    # First check DB for scored jobs
    scored = db_get_scored_jobs()
    if scored:
        return {"jobs": scored}

    # Fallback to file
    if BATCH_RESULTS_FILE.exists():
        try:
            data = json.loads(BATCH_RESULTS_FILE.read_text())
            return data
        except:
            pass

    return {"jobs": []}


# ── Analyze Jobs — score via Gemini ───────────────────────────────────────────
@app.get("/webhook/analyze-jobs")
def analyze_jobs(days: int = Query(default=7), top: int = Query(default=35), enrich: bool = Query(default=True)):
    jobs = db_get_jobs(days)
    # Filter to unscored or all
    to_score = [j for j in jobs if j.get("score") is None][:top]

    if not to_score:
        # Return already scored
        scored = db_get_scored_jobs()
        return {"jobs": scored[:top]}

    print(f"  Scoring {len(to_score)} jobs via Gemini...")
    results = []
    for i, job in enumerate(to_score, 1):
        title = job.get("title", "?")
        company = job.get("company", "?")
        print(f"  [{i:02d}/{len(to_score)}] {title} @ {company}...", end=" ", flush=True)

        analysis = score_job(job)
        if analysis:
            score = analysis.get("score", 0)
            job["score"] = score
            job["analysis"] = json.dumps(analysis)
            job["_analysis"] = analysis
            job["_score"] = score
            db_upsert_job(job)
            print(f"score={score}")
        else:
            print("SKIP")

        results.append(job)
        if i < len(to_score):
            time.sleep(1)  # Rate limit

    # Return all scored jobs
    all_scored = db_get_scored_jobs()
    return {"jobs": all_scored[:top]}


# ── Claude/Gemini Proxy — for AI chat in career_hub.html ─────────────────────
@app.post("/webhook/claude-proxy")
async def claude_proxy(request: Request):
    body = await request.json()
    prompt = body.get("prompt", "")
    temperature = body.get("temperature", 0.7)

    if not prompt:
        return JSONResponse({"error": "No prompt"}, status_code=400)

    try:
        text = call_gemini(prompt, max_tokens=4096, temperature=temperature)
        return {"text": text}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)


# ── Job Docs — stored docs (empty for now, generate via pipeline) ─────────────
@app.get("/webhook/job-docs")
def job_docs(job_key: str = Query(default="")):
    docs_file = BASE_DIR / "scripts" / "generated_docs" / "pipeline_output.json"
    if not docs_file.exists():
        if job_key:
            return {"found": False}
        return {"all": {}}

    try:
        data = json.loads(docs_file.read_text())
        all_docs = data.get("jobs", {})
        if job_key:
            return {"found": job_key in all_docs, "doc": all_docs.get(job_key, {})}
        return {"all": all_docs}
    except:
        return {"all": {}}


# ── Interview Prep redirect ──────────────────────────────────────────────────
@app.get("/webhook/interview-prep")
def interview_prep():
    return HTMLResponse("""<html><body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh">
    <div style="text-align:center">
        <h1>Interview Coach</h1>
        <p>Go to <a href="http://localhost:3000" style="color:#6c63ff">http://localhost:3000</a> for the Interview Coach app</p>
    </div></body></html>""")


# ─── MAIN ─────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Load .env.local
    env_file = BASE_DIR / ".env.local"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ.setdefault(key.strip(), val.strip())

    GEMINI_KEY = os.environ.get("GEMINI_KEY") or os.environ.get("GEMINI_API_KEY", "")

    uvicorn.run("local_server:app", host="0.0.0.0", port=PORT, log_level="info", reload=False)
