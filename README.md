# CareerHub AI

**AI-Powered Career Intelligence Platform for Students**

> HackASU 2026 | Track 3: Economic Empowerment & Education

## The Problem

Students spend **40+ hours per application cycle** manually tailoring resumes, writing cover letters, and researching companies. Career centers at most universities are understaffed and appointment-limited. Students at non-target schools often lack access to the same quality career guidance available at elite institutions.

The result: talented students miss opportunities not because they lack skills, but because the application process is a full-time job in itself.

## Our Solution

CareerHub AI is an open-source, AI-powered career intelligence platform that automates the most time-consuming parts of the job search:

- **Job Discovery** — Aggregates listings from 7 open-source GitHub internship repos + manual JD input
- **AI Scoring** — Claude analyzes each job against your profile and scores match quality (0-100)
- **Tailored Resumes** — Generates ATS-optimized resumes using ONLY your real experience
- **Cover Letters** — Creates personalized cover letters with company-specific hooks
- **Interview Prep** — Behavioral + technical questions mapped to your actual STAR stories
- **Outreach Messages** — LinkedIn DMs, cold emails, and referral asks ready to send
- **AI Career Advisor** — Chat with Claude about any job, strategy, or career question

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐
│   Job Sources        │     │   CareerHub UI        │
│  GitHub Intern Repos │────▶│  Single-Page App      │
│  (7 open-source      │     │  Dark Theme           │
│   repositories)      │     │  6 Tabs + AI Chat     │
│  + Manual JD Input   │     │                       │
└─────────────────────┘     └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   Claude API Proxy    │
                            │   (n8n Webhook)       │
                            │                       │
                            │  /webhook/claude-proxy│
                            └──────────┬───────────┘
                                       │
                            ┌──────────▼───────────┐
                            │   Claude (Anthropic)  │
                            │   Scoring, Resume Gen │
                            │   Cover Letters, Chat │
                            │   Interview Prep      │
                            └───────────────────────┘
```

## Features

| Feature | Description |
|---------|-------------|
| **Command Center** | Dashboard with metrics, priority jobs, workflow controls |
| **Apply Tab** | Job details, AI analysis, multi-score breakdown, skill match |
| **Resume Builder** | ATS-optimized text resume + LaTeX generation |
| **Cover Letter** | Personalized 250-320 word cover letters |
| **Outreach** | LinkedIn DM, cold email, referral ask + tracker |
| **Pipeline** | Kanban board (New → Applied → Interview → Offer) |
| **AI Chat** | Per-job context-aware career advisor |
| **Generate Docs** | Paste any JD, instantly get tailored resume + cover letter + ATS audit |
| **Paste JD** | Paste raw job page content, AI extracts structured JD |
| **Filters** | Score ranges, role types, No Analysis, No JD, Has Docs |

## Tech Stack

- **Frontend**: Vanilla HTML/CSS/JS (single-file SPA, no build step)
- **AI**: Claude API (Anthropic) via server-side proxy
- **Backend**: n8n (workflow automation) on DigitalOcean
- **Pipeline**: Python 3.9+ with concurrent document generation
- **Data**: localStorage (client) + JSON file store (server)

## Live Demo

**[CareerHub AI Live](http://146.190.138.113:5678/webhook/career-hub)** — Try it now (no login required)

## Quick Start

### Run the Next.js Interview Coach (current frontend)

This repo includes a full Next.js frontend under `src/app`.

1. Install dependencies
```bash
npm install
```

2. Create `.env.local` in the project root
```bash
GEMINI_API_KEY=your_gemini_key
# Optional fallback (supported too)
# GEMINI_KEY=your_gemini_key
# Optional model override
# GEMINI_MODEL=gemini-2.0-flash
```

3. Start the app
```bash
npm run dev
```

4. Open local URL shown in terminal (usually `http://localhost:3000`, or `3001` if 3000 is occupied)

5. Verify production build
```bash
npm run build
```

### Run the Pipeline Scripts (Python + n8n)

1. Create and activate a Python environment
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install requests fastapi uvicorn httpx
```

2. Export environment variables (script stack uses `GEMINI_KEY`)
```bash
export GEMINI_KEY=your_gemini_key
export N8N_BASE=http://localhost:5678
export N8N_API_KEY=your_n8n_api_key
```

3. Common commands
```bash
# Analyze jobs
python3 scripts/batch_analyze_jobs.py --days 7

# Generate docs
python3 scripts/generate_job_docs.py --days 7 --min-score 30

# Upload generated docs to n8n
python3 scripts/upload_docs_to_n8n.py
```

4. Optional JD service
```bash
python3 scripts/jd_service.py
# health check: http://localhost:8765/health
```

### 1. Clone & Configure
```bash
git clone https://github.com/metalgenesis123321/CBC-Hackathon.git
cd CBC-Hackathon
cp .env.example .env
# Edit .env with your API keys
```

### 2. Set Up the Claude Proxy
The app needs a server-side proxy to call the Claude API (browser CORS restriction).

**Option A: n8n (recommended)**
- Import the proxy workflow into your n8n instance
- Set your Anthropic API key in the workflow

**Option B: Simple Express proxy**
```bash
npm install express cors anthropic
node proxy.js  # Starts on port 3001
```

### 3. Open the App
- Serve `career_hub.html` via any static server or n8n webhook
- On first visit, complete the setup wizard (name, school, resume)
- Start browsing jobs and generating tailored applications!

### 4. Run the Pipeline (Optional)
```bash
pip install requests
export ANTHROPIC_KEY=your_key_here
python scripts/generate_job_docs.py --manual
```

## Ethical Design

See [ETHICAL_CONSIDERATIONS.md](docs/ETHICAL_CONSIDERATIONS.md) for our full ethical framework.

Key principles:
- **Truthfulness**: Every AI prompt includes "NEVER fabricate data." ATS audits verify content against real experience.
- **Transparency**: All AI-generated content is labeled. Users always review before submitting.
- **Privacy**: All personal data stays in the user's browser (localStorage). No central database.
- **Equity**: Free and open-source. Any student gets the same quality career intelligence.
- **Human Agency**: The tool assists, never replaces. Users make all final decisions.

## Impact

- Reduces application preparation time from **4-6 hours to 15 minutes** per job
- Generates ATS-optimized resumes with **85%+ keyword coverage**
- Levels the playing field for students at non-target schools
- Open-source — any university career center can deploy it

## Team

Built at HackASU 2026 (Claude Builder Club Hackathon)

## License

MIT
