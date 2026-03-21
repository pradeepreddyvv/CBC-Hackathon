# Architecture

## System Overview

```
┌──────────────────────────────────────────────────────┐
│                    Job Sources                        │
│  ┌──────────┐  ┌───────────┐  ┌──────────────────┐  │
│  │ LinkedIn  │  │  GitHub   │  │ JSearch (multi-  │  │
│  │  (Apify)  │  │  Repos    │  │  board: Indeed,  │  │
│  │           │  │  (7 repos)│  │  Glassdoor, etc.)│  │
│  └─────┬────┘  └─────┬─────┘  └────────┬─────────┘  │
└────────┼──────────────┼─────────────────┼────────────┘
         │              │                 │
         ▼              ▼                 ▼
┌──────────────────────────────────────────────────────┐
│              n8n Server (DigitalOcean)                │
│                                                      │
│  ┌────────────────┐  ┌────────────────────────────┐  │
│  │  Jobs Fetch API │  │  Claude Proxy              │  │
│  │  /webhook/      │  │  /webhook/claude-proxy     │  │
│  │  jobs-api       │  │  POST {prompt, max_tokens} │  │
│  └────────────────┘  │  → Anthropic Messages API   │  │
│                      │  → {text: "..."}            │  │
│  ┌────────────────┐  └────────────────────────────┘  │
│  │  Job Docs API  │                                  │
│  │  /webhook/     │  ┌────────────────────────────┐  │
│  │  job-docs      │  │  Career Hub UI             │  │
│  └────────────────┘  │  /webhook/career-hub       │  │
│                      │  (serves the SPA)           │  │
│  ┌────────────────┐  └────────────────────────────┘  │
│  │  Batch Results │                                  │
│  │  /webhook/     │                                  │
│  │  batch-results │                                  │
│  └────────────────┘                                  │
└──────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────┐
│                  CareerHub UI (Browser)               │
│                                                      │
│  ┌──────────┐ ┌────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Command  │ │ Apply  │ │ Outreach │ │ Pipeline │ │
│  │ Center   │ │ Tab    │ │ Tab      │ │ Kanban   │ │
│  └──────────┘ └────────┘ └──────────┘ └──────────┘ │
│  ┌──────────┐ ┌──────────────────────────────────┐  │
│  │ Generate │ │        AI Chat Panel             │  │
│  │ Docs Tab │ │    Claude-Powered Advisor        │  │
│  └──────────┘ └──────────────────────────────────┘  │
│                                                      │
│  Data: localStorage (profile, chat, pipeline state)  │
└──────────────────────────────────────────────────────┘
```

## Document Generation Pipeline

```
                    ┌───────────────────┐
                    │ Company Research   │  ← Gate: must finish first
                    │ (Claude + Search)  │
                    └─────────┬─────────┘
                              │
             ┌────────┬───────┼───────┬────────┬────────┬────────┐
             │        │       │       │        │        │        │
             ▼        ▼       ▼       ▼        ▼        ▼        ▼
          Resume   Resume   Cover  Outreach  Follow  Interview Multi-
          Text     LaTeX    Letter Messages    Up      Prep     Score
            │
            ▼
         ATS Audit
```

Each job passes through a DAG of 9 document types, with 7 parallel tracks after the company research gate.

## Concurrency Model

- **Inter-Job**: ThreadPoolExecutor with configurable workers (default: 3)
- **Intra-Job**: 7 parallel API calls per job after company research
- **Rate Limiting**: Semaphore limits concurrent API calls (default: 5)
- **Retry**: Exponential backoff (5s, 10s, 20s) up to 3 attempts
- **Crash Safety**: Progress saved after each job; SIGINT handler for graceful shutdown

## Data Flow

1. **Job Discovery**: n8n cron triggers Apify scraper → dedup → score top matches
2. **JD Fetching**: ATS APIs (Greenhouse, Lever, Ashby) → crawl4ai fallback → AI extraction
3. **Scoring**: Claude scores each job 0-100 against user profile
4. **Doc Generation**: Pipeline generates 9 tailored documents per qualifying job
5. **UI Merge**: Frontend fetches jobs + batch results + pre-generated docs → unified view

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/webhook/career-hub` | GET | Serves the CareerHub SPA |
| `/webhook/claude-proxy` | POST | Proxies requests to Claude API |
| `/webhook/jobs-api` | GET | Fetch aggregated job listings |
| `/webhook/batch-results` | GET | Get scored/analyzed results |
| `/webhook/job-docs` | GET | List/retrieve generated documents |
| `/webhook/job-docs-upload` | POST | Upload pipeline output |
