#!/usr/bin/env python3
"""
generate_job_docs.py — Complete Job Document Generation Pipeline v2
====================================================================
Fetches analyzed jobs, classifies by source & role, generates tailored
resume (text + LaTeX), cover letter, outreach messages, interview prep,
and follow-up templates for each qualifying job using Gemini AI.

NEW in v2:
  - Company research "invisible trick" (hidden keywords from blogs/press)
  - Multi-dimensional scoring (tech match, experience relevance, keyword coverage, gap analysis)
  - Post-generation ATS keyword audit
  - Interview prep question generation
  - Follow-up email templates
  - Deduplication against previously generated docs
  - Error recovery (continue on partial failures)
  - Manual JD input mode (--manual)
  - User's exact LaTeX template (textcomp, \resumeSubRole, tighter margins)
  - Expanded work experience bullets (B3a frontend + B3b backend split)

Usage:
  python3 generate_job_docs.py                      # default: last 7 days, score > 30
  python3 generate_job_docs.py --days 3             # last 3 days
  python3 generate_job_docs.py --min-score 50       # only score >= 50
  python3 generate_job_docs.py --top 10             # only top 10
  python3 generate_job_docs.py --from-file          # use local batch_analysis_results.json
  python3 generate_job_docs.py --dry-run            # classify & list only, no generation
  python3 generate_job_docs.py --retry-failures     # re-process only previously failed items
  python3 generate_job_docs.py --manual             # manual JD input mode
"""

import json, time, re, sys, argparse, os, traceback, signal
import requests
import concurrent.futures
import threading
from datetime import datetime
from pathlib import Path

# ═══════════════════════════════════════════════════════════════════════
# CONFIG
# ═══════════════════════════════════════════════════════════════════════
GEMINI_KEY      = os.environ.get("GEMINI_KEY", "")
GEMINI_MODEL    = "gemini-2.5-pro"
GEMINI_URL      = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
GEMINI_SEARCH_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"
N8N_BASE        = os.environ.get("N8N_BASE", "http://localhost:5678")
N8N_API_KEY     = os.environ.get("N8N_API_KEY", "")
_SCRIPT_DIR     = os.path.dirname(os.path.abspath(__file__))
BATCH_FILE      = os.path.join(_SCRIPT_DIR, "batch_analysis_results.json")
OUTPUT_DIR      = os.path.join(_SCRIPT_DIR, "generated_docs")
OUTPUT_FILE     = os.path.join(_SCRIPT_DIR, "generated_docs", "pipeline_output.json")
THROTTLE_SEC    = 2
TIMEOUT_SEC     = 180

# ── Concurrent Processing Config ──
MAX_WORKERS     = 3       # concurrent job processors
MAX_API_CALLS   = 5       # max concurrent Gemini API calls (semaphore)
RETRY_MAX       = 3       # max retries per API call
RETRY_BASE_SEC  = 5       # base wait for exponential backoff

# Thread-safe globals (initialized in concurrent mode)
_api_semaphore = None
_print_lock = threading.Lock()
_save_lock = threading.Lock()
_shutdown = threading.Event()

# ═══════════════════════════════════════════════════════════════════════
# CONNECTIONS MAP (Tier 1-3 from MASTER.md + LINKEDIN_ANALYSIS.md)
# ═══════════════════════════════════════════════════════════════════════
CONNECTIONS_MAP = {
    # Add your LinkedIn connections here. Format:
    # "company_name": [{"name": "Contact Name", "role": "Their Role", "tier": 1}],
    # Tier 1 = Recruiters, Tier 2 = Engineers, Tier 3 = Loose connections
    # Example:
    # "google": [{"name": "Contact Name", "role": "SWE", "tier": 2}],
    # "amazon": [{"name": "Contact Name", "role": "Recruiter", "tier": 1}],
}

def get_connections(company: str) -> list:
    """Find LinkedIn connections at a company using fuzzy matching."""
    if not company:
        return []
    key = re.sub(r'[.,®™]', '', company.lower().strip()).strip()
    clean = re.sub(r'\s+(inc|corp|ltd|llc|technologies|technology|labs|systems|software|group|platform|platforms)$', '', key).strip()
    for k in [key, clean]:
        if k in CONNECTIONS_MAP and CONNECTIONS_MAP[k]:
            return CONNECTIONS_MAP[k]
        for map_key in CONNECTIONS_MAP:
            if (k in map_key or map_key in k) and CONNECTIONS_MAP[map_key]:
                return CONNECTIONS_MAP[map_key]
    return []


# ═══════════════════════════════════════════════════════════════════════
# ROLE CLASSIFICATION
# ═══════════════════════════════════════════════════════════════════════
ROLE_KEYWORDS = {
    "SDE": [
        "software engineer", "software developer", "sde", "software development engineer",
        "backend engineer", "backend developer", "systems engineer", "platform engineer",
        "infrastructure engineer", "site reliability", "sre", "application engineer",
        "junior developer", "jr. developer", "associate engineer", "software intern",
        "engineer intern", "development engineer"
    ],
    "ML/AI": [
        "machine learning", "deep learning", "ai engineer", "artificial intelligence",
        "data scientist", "research engineer", "research scientist", "computer vision",
        "nlp", "natural language", "ml engineer", "ai/ml", "ml/ai", "robotics",
        "perception", "autonomous", "generative ai", "llm"
    ],
    "Frontend": [
        "frontend", "front-end", "front end", "ui engineer", "ui developer",
        "ux engineer", "web developer", "react developer", "angular developer",
        "javascript developer", "typescript developer"
    ],
    "Fullstack": [
        "full stack", "fullstack", "full-stack"
    ],
    "Data": [
        "data engineer", "data engineering", "data platform", "data infrastructure",
        "analytics engineer", "etl", "data pipeline", "big data", "database engineer"
    ],
    "DevOps": [
        "devops", "cloud engineer", "cloud infrastructure", "devsecops",
        "release engineer", "build engineer", "ci/cd"
    ],
}

def classify_role(title: str, description: str = "") -> str:
    """Classify a job into a role category based on title and description."""
    text = (title + " " + description[:500]).lower()
    scores = {}
    for role, keywords in ROLE_KEYWORDS.items():
        score = sum(3 if kw in title.lower() else 1 for kw in keywords if kw in text)
        scores[role] = score
    if scores.get("Fullstack", 0) > 0:
        return "Fullstack"
    best = max(scores, key=scores.get)
    if scores[best] == 0:
        return "SDE"  # default
    return best

def classify_source(job: dict) -> str:
    """Classify job source as 'github', 'linkedin', or 'linkedin_manual'."""
    source = (job.get("source") or "").lower()
    link = (job.get("link") or job.get("url") or "").lower()
    if source == "linkedin_manual":
        return "linkedin_manual"
    if "github" in source or "github.com" in link or "greenhouse" in link or "lever.co" in link or "ashby" in link:
        return "github"
    return "linkedin"


# ═══════════════════════════════════════════════════════════════════════
# MASTER VAULT v2 — Complete candidate context with expanded bullets,
# STAR stories, elevator pitches, and company tier awareness
# ═══════════════════════════════════════════════════════════════════════
MASTER_VAULT = r"""
╔══════════════════════════════════════════════════════════════════════╗
║                    MASTER CANDIDATE VAULT v2                        ║
║           Your Name Here — Complete Context                         ║
║      USE ONLY THIS DATA. NEVER FABRICATE. NEVER HALLUCINATE.        ║
╚══════════════════════════════════════════════════════════════════════╝

═══ IDENTITY ═══
Name (resume header): YOUR FULL NAME (full caps in LaTeX)
Name (text resume):   Your Name
Legal name:           Your Full Legal Name
Goes by:              YourFirstName
Email:                your.email@gmail.com
ASU Email:            yourid@university.edu
Phone:                +1 (555) 000-0000 | formatted: +15550000000
LinkedIn:             linkedin.com/in/your-profile
GitHub:               github.com/your-username
Portfolio:            your-username.github.io
Location:             Tempe, AZ 85281
Visa:                 F-1 Visa | CPT/OPT Eligible | No Sponsorship Required
Availability:         May 27 – August 7, 2026 (Summer internship)

═══ EDUCATION ═══

[ED1] Arizona State University — M.S. Computer Science
  GPA: 4.11/4.0 (exceeds max due to A+ grades)
  Dates: Aug 2025 – Dec 2026 | Tempe, AZ
  Honors: Academic Excellence | AI Scholars Program
  Courses: Distributed Database Systems, Statistical Machine Learning, Perception in Robotics, Semantic Web Mining
  Research: AI Agents, Computer Vision, Cognitive Models

[ED2] Previous University — B.E. Computer Science & Engineering
  Dates: Aug 2019 – May 2023 | City, Country
  Honors: First Class with Distinction (6 consecutive semesters)
  Courses: Web Development, Cloud Computing, Machine Intelligence, Big Data, Software Design Patterns
  ⚠ NEVER show Previous University GPA on US resumes

═══ WORK EXPERIENCE ═══

[W1] Arizona State University — Developer Assistant (Part-time)
  Jan 2026 – Present | Tempe, AZ
  • Engineered automated Python + PostgreSQL pipeline with LLM integration to parse unstructured academic records, accelerating data validation by 75%
  • Executed root cause analysis across 3 deduplication stages (exact, fuzzy, LLM semantic) to eliminate duplicate profiles across university systems

[W2] Example Bank — Software Engineer, API Integration Team (Full-time, 2 years)
  Jul 2023 – Jul 2025 | Mumbai, India
  Manager: Manager Name
  FY2025 Rating: "Has shown strong technical skills and consistent performance and proactive approach"

  BULLET BANK — Select 4-6 most relevant bullets per JD:

  [B1-API-SCALE] Engineered high-throughput REST APIs for KYC identity verification (PAN/Aadhaar/CIBIL) sustaining 100+ TPS at sub-second latency via Spring Boot, Redis TTL caching, and dynamic 30/70 canary traffic routing for zero-downtime deployments

  [B2-ONBOARDING] Built OpenAPI-driven Partner Developer Portal with sandbox API simulation, reducing fintech partner onboarding (Amazon Pay, Cred, Flipkart) from 12 days to 2 days — 83% reduction enabling self-serve partner integrations

  [B3a-DASHBOARD-FRONTEND] Developed role-based React.js compliance portal with granular RBAC (Lead/Support/Admin views), dynamic filtering across 1,500+ APIs, and interactive charts for API audit lifecycle tracking

  [B3b-DASHBOARD-BACKEND] Engineered Spring Boot compliance engine automating 15+ RBI regulatory audit rules with Oracle stored procedures, improving cross-team audit efficiency by 60% and cutting compliance lag by 40%

  [B4-MIGRATION] Led on-premise to AWS migration and MySQL-to-Oracle database transition; audited and rewrote 200+ JPA queries with zero production data loss, achieving 99.9% uptime while reducing infrastructure costs by 50% ($120K annual savings)

  [B5-LLM] Built Outlook email assistant with React UI leveraging in-house LLM models via internal APIs, enabling automated email summarization and context-aware draft generation, reducing team email drafting time by 30%

  [B6-SECURITY] Implemented AES-256 encryption middleware securing PII payloads (PAN, Aadhaar, CIBIL numbers) across all API surfaces, achieving bank-grade security compliance for 100M+ customer data

  [B7-MONITORING] Built Spring Boot + Kong API Gateway polling scheduler aggregating live runtime metrics across 100+ Prod/UAT services into centralized database, enabling real-time lifecycle tracking (8x faster: 100s → 13s for 200 services)

  [B8-SALESFORCE] Developed Salesforce-integrated RESTful APIs via MuleSoft + OAuth 2.0 with Redis TTL caching, reducing SFDC API calls and data fetch latency by 65%

  [B9-OPENAPI] Parsed 1,500+ OpenAPI/Swagger specs to auto-populate metadata into developer portal, enabling API discovery and lifecycle tracking across 7,000+ endpoints

  BULLET SELECTION RULES:
  • Backend/API/Systems → B1, B2, B4, B7 (lead with B1)
  • Full-stack/Product → B3a, B3b, B2, B5 (lead with B3a — shows React+backend full-stack ownership)
  • Frontend → B3a, B5, B2 (lead with B3a — React RBAC portal)
  • ML/AI → B5, B1, B2 (lead with B5)
  • Security/Fintech → B6, B1, B8 (lead with B6)
  • Platform/Infra → B4, B7, B1 (lead with B4)
  • Data → B9, B3b, B1 (lead with B9)

  VERIFIED METRICS: 100+ TPS | sub-second latency | 83% onboarding reduction (12→2 days) | 60% audit efficiency | 40% compliance lag reduction | 50% AWS cost reduction ($120K savings) | 99.9% uptime | 30% email time reduction | 65% fetch time reduction | 7,000+ endpoints | 1,500+ APIs | 200+ queries migrated | zero data loss | 8x monitoring speedup (100s→13s)

[W3] Example Bank — Application Engineer Intern
  Feb 2023 – Jun 2023 | Bangalore, India
  • Developed Salesforce-integrated REST APIs with Spring Boot + OAuth 2.0 authentication and Redis TTL caching, serving 500+ field agents
  • Implemented 25-minute TTL-based Redis caching achieving 95% cache hit rate, reducing API latency by 300ms

[W4] Example ML Startup — Machine Learning Intern, Computer Vision Team
  May 2021 – Oct 2021 | Remote
  • Optimized CV models for fruit-harvesting robot on Raspberry Pi 4 edge hardware: improved disease classification F1-score +0.35, detection accuracy +0.2 (reaching 91%), inference time -20%
  • Built data augmentation pipelines enabling model convergence with 40% less training data, processing 5,000+ labeled images

═══ PROJECTS ═══

[P1] FreshBite — Freshness-First Dish Review Platform
  Live: https://your-project.example.com | GitHub: github.com/your-username/freshbite
  Tech: Spring Boot, FastAPI, PostgreSQL, Next.js 14, TypeScript, Docker, Vercel, Redis, CI/CD
  Role fit: BACKEND, FULLSTACK, SDE
  • Built and deployed full-stack microservices platform (Next.js 14 + Spring Boot 3) with time-windowed review aggregation APIs, ML-powered freshness scoring engine, GPS-based restaurant discovery
  • Optimized PostgreSQL queries using pg_trgm trigram indexes, reducing search P95 latency to 50ms
  • Automated CI/CD pipeline (Vercel + Docker), maintaining <200ms end-to-end latency, supporting 200 concurrent users
  • Live production deployment at your-project.example.com

[P2] CityTraffic NLQ and Analytics
  GitHub: github.com/your-username/city-traffic-nlq
  Tech: AWS EC2, MongoDB, Vector Search, Apache Airflow, Python, Locust, GNN
  Role fit: BACKEND, ML, DATA, PLATFORM
  • Engineered distributed analytics platform with geohash-based MongoDB sharding and LLM-powered natural language query interface
  • P95 latency <600ms, P50 latency 210ms for spatio-temporal queries across 2M+ NYC traffic records
  • Load-tested with Locust at 50 concurrent users / 10x peak traffic
  • Orchestrated data pipelines using Apache Airflow with vector search for semantic queries

[P3] OmniSense — AI Prediction Market Analytics
  GitHub: github.com/your-username/Omnisense
  Tech: Multi-agent AI, RAG, Bayesian Probability, Python, LLMs, FastAPI, Claude, MCP
  Role fit: ML, AI, RESEARCH
  • Created 5-agent RAG pipeline (Planner → Researcher → Critic → Analyst → Reporter) aggregating 20+ real-time data sources
  • Bayesian probability calibration generating transparent evidence-based forecasts within 9 minutes
  • Built at HackASU 2025 using Anthropic Claude + MCP

[P4] Build My Web — Image to HTML Code
  GitHub: github.com/your-username/buildmyweb
  Tech: OpenCV, TensorFlow, CNN, CTC, React, Flask, Python
  Role fit: FULLSTACK, ML, CV
  • End-to-end platform converting hand-drawn wireframes to production HTML/CSS using CNN+CTC model
  • React live editor + Flask REST backend; 30% prototyping time reduction

[P5] Smart Driving Assistance — Published Research
  URL: https://link.springer.com/chapter/10.1007/978-3-031-50993-3_32
  Tech: YOLO, CNN, OpenCV, PyTorch, Python, lane detection, curvature prediction
  Role fit: ML, CV, RESEARCH
  Published: ICCSST 2023 | Springer Nature
  • Co-authored publication on lane detection + curvature prediction + YOLO-based traffic sign recognition
  • >90% accuracy on GTSRB dataset across 43 traffic sign classes
  • Multi-threaded pipeline sustaining 25+ FPS on GPU hardware

[P6] Code Completion Models Benchmark
  GitHub: github.com/your-username/code-completion
  Tech: LSTM, BERT, CodeBERT, CodeGPT, Python, HuggingFace, PyTorch, Transformers
  Role fit: ML, RESEARCH
  • Evaluated LSTM/BERT/CodeBERT/CodeGPT for Java code completion across 10K+ GitHub repos
  • Analyzed Top-K accuracy and scalability trade-offs across multiple context window sizes

[P7] WorkShift — AI Career Transition Analytics Engine
  Tech: React, TypeScript, Supabase, SQL, O*NET API, BLS API
  Role fit: FULLSTACK, DATA
  • 3-phase pipeline: automation risk scoring, salary delta, job availability
  • Guardrail validation engine, structured data contracts, unit + E2E tests

  PROJECT SELECTION RULES:
  • Backend/API/SWE → FreshBite [P1] + CityTraffic [P2]
  • ML/AI/Research → Smart Driving [P5] (lead — published) + OmniSense [P3] ± CityTraffic [P2]
  • Full-stack/Product → FreshBite [P1] + BuildMyWeb [P4]
  • Data/Platform/Infra → CityTraffic [P2] + FreshBite [P1]
  • Computer Vision → Smart Driving [P5] + BuildMyWeb [P4]
  • NLP/LLM → CityTraffic [P2] (NLQ) + OmniSense [P3] (RAG)

═══ TECHNICAL SKILLS (Full Inventory) ═══

Languages:   Java, Python, C/C++, JavaScript/TypeScript, SQL, Bash, Terraform, R, Groovy, Go, HTML/CSS
Backend:     Spring Boot, REST APIs, Microservices, Node.js, FastAPI, Flask, MuleSoft, gRPC, OpenAPI/Swagger, OAuth 2.0, JWT, Kong API Gateway
Frontend:    React.js, Next.js 14, TypeScript, HTML/CSS, Tailwind CSS, Material UI, Bootstrap
Cloud/Infra: AWS (EC2, S3, Lambda, CloudWatch, API Gateway, SageMaker), Docker, Kubernetes, Terraform, Apache Airflow, GOCD, CI/CD, Linux, Vercel, GitHub Actions
Databases:   PostgreSQL, MongoDB, MySQL, Oracle, Redis, Elasticsearch, Cassandra, DynamoDB, Vector Search
AI/ML:       PyTorch, TensorFlow, OpenCV, LLMs, RAG, Multi-agent AI, HuggingFace, YOLO, CNN, Transformers, scikit-learn, Bayesian ML, NLP, Computer Vision
Messaging:   Kafka, RabbitMQ, MuleSoft
Testing:     JUnit, Mockito, Locust, Selenium, Postman
Security:    AES-256, OAuth 2.0, JWT, PII encryption, RBAC

⚠ SKILLS RULE: Only list skills that appear in the JD. 15 targeted skills > 40 random.

═══ ACHIEVEMENTS & CERTIFICATIONS ═══

• CodeChef Global Rank 22/3,200 — April Long Challenge 2022 (top 0.7%)
• Springer Nature Publication — ICCSST 2023 (Smart Driving Assistance, >90% accuracy)
• ASU GPA 4.11/4.0 — exceeds maximum scale due to A+ grades
• Salesforce Certified MuleSoft Developer I
• Google ML Bootcamp certified
• AI Scholars Program (ASU) — competitive cohort selection

═══ STAR STORIES (for cover letters & interview context) ═══

STAR-1: Partner Developer Portal (83% onboarding reduction)
  S: Bank needed faster partner integrations — Amazon Pay, Cred, Flipkart waiting 12 days for manual API setup
  T: Build self-serve sandbox with OpenAPI-driven mock APIs so partners could integrate without bank engineers
  A: Designed sandbox APIs simulating 100+ production endpoints; built automated integration testing; implemented OAuth 2.0 flow; wrote complete OpenAPI specs; created role-based access
  R: 12 → 2 days (83% reduction); partners fully self-serve; adopted by 3+ major fintech partners

STAR-2: High-Throughput KYC APIs (100+ TPS, sub-second)
  S: Digital lending required real-time KYC at scale; existing APIs timed out under burst load
  T: Build stateless APIs for 100+ TPS with <1s latency SLA
  A: REST APIs for PAN/Aadhaar/CIBIL; Redis TTL caching; 30/70 canary traffic routing; MuleSoft for 3rd-party providers
  R: <1s latency sustained at 100+ TPS; zero-downtime deployments through canary strategy

STAR-3: AWS Migration + Oracle (50% cost cut, 99.9% uptime)
  S: On-prem MySQL silently failing on Oracle target — timestamp type mismatches corrupting financial records
  T: Migrate production to AWS + Oracle with zero data loss, ahead of regulatory deadline
  A: Audited 200+ JPA queries; found 47 needing Oracle rewrites; automated validation scripts; parallel environments for 2 weeks
  R: Zero data loss; 50% cost reduction ($120K); 99.9% uptime; completed ahead of schedule

STAR-4: API Inventory Dashboard (60% audit improvement)
  S: No centralized API tracking; RBI compliance audits were manual, error-prone, took weeks
  T: Build full-stack dashboard with RBAC for 1,500+ APIs + automated compliance rule checking
  A: React.js portal + Spring Boot backend with role-based UIs; automated RBI regulatory checks; Kong API Gateway integration
  R: 60% audit productivity; 40% compliance lag reduction; became standard tool across API team

═══ ELEVATOR PITCHES ═══

60-SECOND: "I'm YourFirstName, an MSCS student at ASU with a 4.11 GPA. Before grad school, I spent 2 years as a Software Engineer at Example Bank, where I built high-throughput REST APIs handling 100+ TPS for digital lending, a Developer Portal that cut partner onboarding from 12 days to 2, and an AI email assistant using LLMs. At ASU, I'm working on data pipelines with LLM integration and distributed analytics platforms."

BACKEND-FOCUSED: "I designed systems doing 100+ TPS with sub-second latency, built a Developer Portal that reduced partner onboarding by 83%, and led a MySQL-to-Oracle migration with zero data loss."

ML-FOCUSED: "I've published research in autonomous driving at Springer ICCSST, built multi-agent analytics platforms with RAG, and integrated LLMs into production workflows."

═══ COMPANY TIERS (adjust tone accordingly) ═══

TIER S (Dream): OpenAI, Anthropic, Meta AI, Google DeepMind, Jane Street, Citadel, Two Sigma, HRT
  → Cover letter: more refined, reference specific technical papers/products
TIER A (Top Target): Microsoft, Amazon, Netflix, Apple, NVIDIA, Stripe, Robinhood, PayPal, Databricks, Snowflake
  → Cover letter: confident but specific, reference recent product launches
TIER B (Strong Apply): Adobe, Salesforce, Pinterest, Dropbox, Roblox, Tesla, Cisco, Affirm, Scale AI, Figma, Vercel, Cloudflare, Datadog
  → Cover letter: enthusiastic, show direct skill alignment
TIER C (Good Apply): Intuit, Visa, Goldman Sachs, MongoDB, Coinbase, HubSpot, MathWorks, Nutanix, Gusto, Moloco, ServiceNow
  → Cover letter: direct and metric-heavy, fast sell

═══ RESUME FORMAT RULES ═══

1. Name: YOUR FULL NAME (LaTeX header, full caps) | Your Name (text resume)
2. Email: your.email@gmail.com (NOT university email) — BUT LaTeX header uses yourid@university.edu
3. NEVER show Previous University GPA
4. ONE PAGE — hard constraint, no exceptions
5. Section order: Education → Technical Skills → Professional Experience → Projects → Publications/Achievements
6. Skills: Only JD-matched, max 2 categories (Languages + Technologies)
7. Experience: Example Bank combined block (SWE + Intern under same company with \resumeSubRole) → Example ML Startup
8. Projects: 2-5, with \href links and \ExternalLink icon
9. One-page overflow: Cut weakest project → Trim bullets to ≤2 lines → Cut Example ML Startup to 1 bullet → Never below 11pt font

═══ COVER LETTER RULES ═══

1. 250-320 words MAX — 4 paragraphs
2. Hook: One specific sentence about the company's product/mission/tech — NEVER generic
3. Para 2: Metrics-first + most relevant work experience project for the role
4. Para 3: Strongest project aligned to role + one unique differentiator
5. Closing: Confident ask + visa line: "As an F-1 student on CPT/OPT, I am fully authorized to work in the US without employer sponsorship"
6. NEVER start with "I am motivated/passionate/excited" or "I saw this position on LinkedIn"
7. NEVER open with "I" as the first word
8. Do NOT mention Previous University GPA

COVER LETTER THEMES BY ROLE:
• Backend/API: Para 2 leads with 100+ TPS KYC APIs [B1] → Partner Portal 83% reduction [B2]; Para 3 leads with FreshBite (live production)
• ML/AI: Para 2 leads with Springer publication [P5] → OmniSense 5-agent pipeline [P3]; Para 3 leads with ML Startup CV intern
• Full-stack: Para 2 leads with API Inventory Dashboard full-stack ownership [B3a+B3b] — React RBAC + Spring Boot compliance engine; Para 3 leads with FreshBite (live at your-project.example.com)
• Frontend: Para 2 leads with React RBAC Dashboard [B3a] → LLM Email Assistant React UI [B5]; Para 3 leads with FreshBite Next.js 14 + BuildMyWeb React editor
• Data/Platform: Para 2 leads with AWS Migration [B4] → Monitoring Scheduler [B7]; Para 3 leads with CityTraffic NLQ

═══ OUTREACH RULES ═══

1. LinkedIn DM: 300 character HARD limit
2. Cold email: 150-200 words, company-specific hook required
3. Referral ask: "Would you be open to a quick referral?" — soft, direct, include JD link placeholder
4. Always check CONNECTIONS_MAP first — if connected, reference the specific person
5. ALWAYS attach personalized note referencing their specific role, company product, or shared background

═══ VISA INTERPRETATION RULE ═══

"Must be authorized to work" / "cannot sponsor" = NOT a blocker. CPT/OPT = authorized.
Only hard-fail on "US citizen only" or "active security clearance required."

═══ BLACKLIST ═══
NEVER apply: TikTok, ByteDance
"""

# ═══════════════════════════════════════════════════════════════════════
# LATEX PREAMBLE — User's exact template (textcomp, tighter margins,
# \resumeSubRole, no \bfseries, 3-col education)
# ═══════════════════════════════════════════════════════════════════════
LATEX_PREAMBLE = r"""%-------------------------
% Resume in Latex - Jake Gutierrez Template
% Your Name Here
%------------------------
\documentclass[letterpaper,11pt]{article}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\usepackage{tikz}
\usepackage{textcomp}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

% Tighter margins for 1-page fit
\addtolength{\oddsidemargin}{-0.6in}
\addtolength{\evensidemargin}{-0.6in}
\addtolength{\textwidth}{1.2in}
\addtolength{\topmargin}{-0.75in}
\addtolength{\textheight}{1.55in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

% Sections formatting - balanced readability
\titleformat{\section}{
  \vspace{-5pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

% External link icon
\newcommand{\ExternalLink}{%
  \tikz[x=1.2ex, y=1.2ex, baseline=-0.05ex]{%
    \begin{scope}[x=1ex, y=1ex]
      \clip (-0.1,-0.1)
        --++ (-0, 1.2)
        --++ (0.6, 0)
        --++ (0, -0.6)
        --++ (0.6, 0)
        --++ (0, -1);
      \path[draw, line width = 0.5, rounded corners=0.5]
        (0,0) rectangle (1,1);
    \end{scope}
    \path[draw, line width = 0.5] (0.5, 0.5) -- (1, 1);
    \path[draw, line width = 0.5] (0.6, 1) -- (1, 1) -- (1, 0.6);
  }%
}

% Custom commands
\newcommand{\resumeItem}[1]{
  \item\small{#1 \vspace{-2pt}}
}

\newcommand{\resumeSubRole}[2]{
  \vspace{-2pt}
  \begin{tabular*}{\textwidth}[t]{l@{\extracolsep{\fill}}r}
    \small\textbf{\textit{#1}} & \textit{\small #2} \\
  \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.0in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}\vspace{-2pt}}
\newcommand{\resumeItemListStart}{\begin{itemize}[leftmargin=0.15in]}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}

\renewcommand\labelitemi{$\vcenter{\hbox{\tiny$\bullet$}}$}
\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

% Override any dash defaults
\setlist[itemize]{label=$\vcenter{\hbox{\tiny$\bullet$}}$}


\begin{document}
"""

LATEX_FOOTER = r"""
\end{document}
"""


# ═══════════════════════════════════════════════════════════════════════
# GEMINI API
# ═══════════════════════════════════════════════════════════════════════
def call_gemini(prompt: str, max_tokens: int = 8192, expect_json: bool = True):
    """Call Gemini API. Returns parsed JSON dict or raw text."""
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens}
    }
    resp = requests.post(
        f"{GEMINI_URL}?key={GEMINI_KEY}",
        json=payload, timeout=TIMEOUT_SEC,
        headers={"Content-Type": "application/json"}
    )
    resp.raise_for_status()
    data = resp.json()
    parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])

    # Collect ALL non-thought text parts (not just the first one)
    text_parts = []
    for p in parts:
        if p.get("text") and not p.get("thought"):
            text_parts.append(p["text"])

    # If no non-thought parts, fall back to last part (might be a thinking model)
    if text_parts:
        raw = "\n".join(text_parts)
    elif parts:
        for p in reversed(parts):
            if p.get("text"):
                raw = p["text"]
                break
        else:
            raw = ""
    else:
        raw = ""

    if not expect_json:
        # Strip markdown code fences if present
        raw = re.sub(r'^```(?:latex|tex|text|markdown)?\s*\n?', '', raw.strip())
        raw = re.sub(r'\n?```\s*$', '', raw)
        return raw.strip()

    # Strip markdown code fences from JSON responses too
    raw = re.sub(r'^```(?:json)?\s*\n?', '', raw.strip())
    raw = re.sub(r'\n?```\s*$', '', raw)

    # Extract JSON from response
    m = re.search(r'\{[\s\S]*\}', raw)
    if not m:
        raise ValueError(f"No JSON in Gemini response: {raw[:300]}")
    return json.loads(m.group(0))


def call_gemini_with_search(prompt: str, max_tokens: int = 4096):
    """Call Gemini with Google Search grounding for company research."""
    payload = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {"maxOutputTokens": max_tokens},
        "tools": [{"googleSearch": {}}]
    }
    try:
        resp = requests.post(
            f"{GEMINI_SEARCH_URL}?key={GEMINI_KEY}",
            json=payload, timeout=TIMEOUT_SEC,
            headers={"Content-Type": "application/json"}
        )
        resp.raise_for_status()
        data = resp.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text_parts = []
        for p in parts:
            if p.get("text") and not p.get("thought"):
                text_parts.append(p["text"])
        if text_parts:
            return "\n".join(text_parts).strip()
        elif parts:
            for p in reversed(parts):
                if p.get("text"):
                    return p["text"].strip()
        return ""
    except Exception as e:
        print(f"    [search grounding failed: {e}, falling back to regular call]")
        return call_gemini(prompt, max_tokens=max_tokens, expect_json=False)


# ═══════════════════════════════════════════════════════════════════════
# CONCURRENT HELPERS — thread-safe wrappers with retry + rate limiting
# ═══════════════════════════════════════════════════════════════════════
def _tprint(*args, **kwargs):
    """Thread-safe print."""
    kwargs["flush"] = True
    with _print_lock:
        print(*args, **kwargs)


def _init_concurrent(max_api_calls=MAX_API_CALLS):
    """Initialize concurrency primitives."""
    global _api_semaphore
    _api_semaphore = threading.Semaphore(max_api_calls)
    # Graceful shutdown on Ctrl+C
    def _handler(sig, frame):
        _tprint("\n  [SIGINT] Shutting down gracefully — saving progress...")
        _shutdown.set()
    signal.signal(signal.SIGINT, _handler)


def call_gemini_safe(prompt, max_tokens=8192, expect_json=True):
    """Rate-limited Gemini call with exponential backoff retry (thread-safe)."""
    for attempt in range(RETRY_MAX):
        if _shutdown.is_set():
            raise InterruptedError("Pipeline shutting down")
        try:
            if _api_semaphore:
                _api_semaphore.acquire()
            try:
                result = call_gemini(prompt, max_tokens, expect_json)
            finally:
                if _api_semaphore:
                    _api_semaphore.release()
            return result
        except Exception as e:
            if attempt < RETRY_MAX - 1:
                wait = RETRY_BASE_SEC * (2 ** attempt)
                _tprint(f"        [retry {attempt+1}/{RETRY_MAX} in {wait}s: {type(e).__name__}: {str(e)[:80]}]")
                time.sleep(wait)
            else:
                raise


def call_gemini_search_safe(prompt, max_tokens=4096):
    """Rate-limited Gemini+Search call with retry (thread-safe)."""
    for attempt in range(RETRY_MAX):
        if _shutdown.is_set():
            raise InterruptedError("Pipeline shutting down")
        try:
            if _api_semaphore:
                _api_semaphore.acquire()
            try:
                result = call_gemini_with_search(prompt, max_tokens)
            finally:
                if _api_semaphore:
                    _api_semaphore.release()
            return result
        except Exception as e:
            if attempt < RETRY_MAX - 1:
                wait = RETRY_BASE_SEC * (2 ** attempt)
                _tprint(f"        [retry {attempt+1}/{RETRY_MAX} in {wait}s: {type(e).__name__}]")
                time.sleep(wait)
            else:
                raise


def _save_job_files(doc, job_dir):
    """Save individual document files for a single job."""
    os.makedirs(job_dir, exist_ok=True)
    with open(os.path.join(job_dir, "resume.txt"), "w") as f:
        f.write(doc.get("resume_text", ""))
    with open(os.path.join(job_dir, "resume.tex"), "w") as f:
        f.write(doc.get("resume_latex", ""))
    with open(os.path.join(job_dir, "cover_letter.txt"), "w") as f:
        f.write(doc.get("cover_letter", ""))
    with open(os.path.join(job_dir, "outreach.json"), "w") as f:
        json.dump(doc.get("outreach", {}), f, indent=2)
    for key in ["follow_up", "interview_prep", "ats_audit", "multi_score"]:
        if doc.get(key):
            with open(os.path.join(job_dir, f"{key}.json"), "w") as f:
                json.dump(doc[key], f, indent=2)
    if doc.get("company_research"):
        with open(os.path.join(job_dir, "company_research.txt"), "w") as f:
            f.write(doc["company_research"])
    with open(os.path.join(job_dir, "metadata.json"), "w") as f:
        json.dump({k: v for k, v in doc.items()
                    if k not in ("resume_text", "resume_latex", "cover_letter", "company_research")}, f, indent=2)


# ═══════════════════════════════════════════════════════════════════════
# COMPANY RESEARCH — "Invisible Trick"
# Research company blogs, press releases, hiring manager context
# to find hidden keywords NOT in the JD
# ═══════════════════════════════════════════════════════════════════════
def research_company(company: str, title: str, jd: str) -> str:
    """Research company to find hidden keywords and context for resume optimization."""
    prompt = f"""You are a job application strategist. Research this company and extract hidden priorities that a candidate should weave into their resume — keywords and themes NOT explicitly in the job description but that the company clearly values.

COMPANY: {company}
ROLE: {title}

JOB DESCRIPTION (for reference — find things BEYOND this):
{jd[:3000]}

RESEARCH THESE AREAS:
1. Company's recent engineering blog posts, tech talks, or press releases (2025-2026)
2. Company's tech stack and architectural philosophy (microservices vs monolith, cloud provider, etc.)
3. Company's cultural values and leadership principles
4. Recent product launches, acquisitions, or strategic pivots
5. Common themes in their other job postings
6. Industry-specific terminology they use internally

OUTPUT FORMAT — Return a concise analysis:
HIDDEN_KEYWORDS: [comma-separated list of 10-15 keywords/phrases the candidate should incorporate]
TECH_CONTEXT: [2-3 sentences about their tech stack/philosophy]
CULTURE_SIGNALS: [2-3 key cultural values to reflect in cover letter]
RECENT_NEWS: [1-2 specific recent events to reference in cover letter hook]
TEAM_CONTEXT: [any info about the specific team/org this role is in]

Be specific and factual. If you cannot find information about a category, say "Not found" rather than fabricating."""

    return call_gemini_with_search(prompt, max_tokens=4096)


# ═══════════════════════════════════════════════════════════════════════
# PROMPT BUILDERS — World-class prompts for each document type
# ═══════════════════════════════════════════════════════════════════════

def build_resume_text_prompt(job: dict, role_category: str, company_research: str = "") -> str:
    jd = (job.get("description") or "")[:8000]
    title = job.get("title", "")
    company = job.get("company", "")
    location = job.get("location", "")

    research_section = ""
    if company_research:
        research_section = f"""
═══ COMPANY RESEARCH (hidden keywords to incorporate naturally) ═══
{company_research}
Use the HIDDEN_KEYWORDS from above to subtly enhance bullet points and skills. Mirror their terminology where your experience genuinely aligns. Do NOT force keywords that don't match real experience.
"""

    return f"""You are the world's #1 ATS resume optimization expert with 20 years at Google, Amazon, and Meta recruiting. You have reviewed 500,000+ resumes and know exactly what passes ATS filters and catches a hiring manager's eye in 6 seconds.

YOUR TASK: Generate a PERFECT, ATS-optimized, one-page plain-text resume for the candidate in the vault below, tailored specifically to this job posting.

{MASTER_VAULT}

═══ TARGET JOB ═══
Title: {title}
Company: {company}
Location: {location}
Role Category: {role_category}
Job Description:
{jd if jd else 'No description available — tailor based on title/company/role category.'}
{research_section}
═══ RESUME GENERATION INSTRUCTIONS ═══

STEP 1 — ANALYZE THE JD:
- Extract every technical skill, tool, framework, and keyword from the JD
- Identify the top 5 "must-have" skills and top 5 "nice-to-have" skills
- Note the exact terminology used (e.g., "RESTful APIs" not "REST APIs" if JD says "RESTful")

STEP 2 — SELECT BULLETS FROM MASTER VAULT:
- Use the BULLET SELECTION RULES based on role category: {role_category}
- Pick 4-6 work experience bullets that BEST match the JD keywords
- Reword bullets to mirror JD language while keeping factual accuracy
- Lead each bullet with a strong action verb + quantified impact

STEP 3 — SELECT PROJECTS:
- Use the PROJECT SELECTION RULES based on role category: {role_category}
- Pick 2-3 projects. Include GitHub/live links
- Reword project bullets to emphasize JD-relevant technologies

STEP 4 — FILTER SKILLS:
- ONLY list skills that appear in the JD or are directly related
- Organize into 2 categories: Languages and Technologies (matching JD emphasis)
- Mirror JD terminology exactly

STEP 5 — FORMAT:
- Header: Your Name + contact info + "F-1 Visa | CPT/OPT Authorized"
- Section order: Education → Technical Skills → Professional Experience → Projects → Publications/Achievements
- Work Experience: Example Bank combined (SWE Jul 2023-Jul 2025 + Intern Feb 2023-Jun 2023) → Example ML Startup
- Education: ASU with GPA 4.11/4.0 + Previous University (NO GPA)
- ONE PAGE — if too long, apply overflow rules from MASTER VAULT

CRITICAL RULES:
1. ONLY use data from the MASTER VAULT above — NEVER fabricate projects, metrics, companies, or achievements
2. Every metric must be EXACTLY as listed in the vault (100+ TPS, 83% reduction, etc.)
3. Mirror JD keywords EXACTLY — if JD says "microservices", use "microservices" not "micro-services"
4. Every bullet must have a quantified impact or technical specificity
5. Do NOT include an "Objective" or "Summary" section
6. Name = "Your Name" (not full legal name)
7. Do NOT show Previous University GPA

Return ONLY the complete plain-text resume. No explanations, no markdown, no commentary."""


def build_resume_latex_prompt(job: dict, role_category: str, company_research: str = "") -> str:
    jd = (job.get("description") or "")[:6000]
    title = job.get("title", "")
    company = job.get("company", "")
    location = job.get("location", "")

    research_section = ""
    if company_research:
        research_section = f"""
═══ COMPANY RESEARCH (hidden keywords to incorporate naturally) ═══
{company_research}
Use HIDDEN_KEYWORDS to subtly enhance bullet points and skills where experience genuinely aligns.
"""

    return f"""You are the world's #1 LaTeX resume engineer. You have built 10,000+ one-page LaTeX resumes that pass ATS systems at FAANG companies.

YOUR TASK: Generate a COMPLETE LaTeX resume body for the candidate in the vault below, tailored to this specific job. The preamble is already provided separately — generate ONLY from \\begin{{document}} to \\end{{document}}.

{MASTER_VAULT}

═══ TARGET JOB ═══
Title: {title}
Company: {company}
Location: {location}
Role Category: {role_category}
Job Description:
{jd if jd else 'No description available — tailor based on title/company/role category.'}
{research_section}
═══ EXACT LATEX TEMPLATE STRUCTURE TO FOLLOW ═══

The preamble defines these commands. Use them EXACTLY:

1. HEADING (full caps, centered):
\\begin{{center}}
    {{\\Huge \\scshape YOUR FULL NAME}} \\\\ \\vspace{{2pt}}
    \\small Ph: +15550000000 $|$ \\href{{mailto:yourid@university.edu}}{{\\underline{{yourid@university.edu}}}} $|$
    \\href{{https://linkedin.com/in/your-profile}}{{\\underline{{linkedin.com}}}} $|$
    \\href{{https://your-username.github.io/}}{{\\underline{{portfolio}}}} $|$
    \\href{{https://github.com/your-username/}}{{\\underline{{github.com}}}}
\\end{{center}}
\\vspace{{-8pt}}

2. EDUCATION (3-column tabular):
\\section{{Education}}
  \\resumeSubHeadingListStart
    \\item\\vspace{{-2pt}}
    \\begin{{tabular*}}{{\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}c@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{Arizona State University, AZ}} & \\textbf{{Master\\textquotesingle s in Computer Science (GPA: 4.11)}} & \\textit{{\\small Aug 2025 -- Dec 2026}} \\\\
    \\end{{tabular*}}\\vspace{{0pt}}
    \\small{{Courses: [JD-relevant courses from vault]}}
    \\vspace{{-2pt}}
    \\item\\vspace{{-2pt}}
    \\begin{{tabular*}}{{\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}c@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{Previous University, Country}} & \\hspace{{20pt}}\\textbf{{Bachelor\\textquotesingle s in Computer Science and Engineering}}\\hspace{{-20pt}} & \\textit{{\\small Aug 2019 -- May 2023}} \\\\
    \\end{{tabular*}}\\vspace{{0pt}}
    \\small{{Courses: [JD-relevant courses]}}
  \\resumeSubHeadingListEnd
\\vspace{{-8pt}}

3. TECHNICAL SKILLS (2 categories only):
\\section{{Technical Skills}}
 \\begin{{itemize}}[leftmargin=0.0in, label={{}}]
    \\small{{\\item{{
     \\textbf{{Languages:}} [JD-matched languages] \\\\
     \\vspace{{1pt}}
     \\textbf{{Technologies:}} [JD-matched technologies — frameworks, databases, cloud, tools]
    }}}}
 \\end{{itemize}}
\\vspace{{-8pt}}

4. PROFESSIONAL EXPERIENCE — Example Bank as combined block with \\resumeSubRole:
\\section{{Professional Experience}}
  \\resumeSubHeadingListStart
    \\item\\vspace{{-2pt}}
    \\begin{{tabular*}}{{\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{Example Bank}}, \\textit{{API Integration team}} & \\textit{{\\small Feb 2023 -- Jul 2025}} \\\\
    \\end{{tabular*}}\\vspace{{0pt}}
    \\small{{\\textit{{(key tech stack for this role)}}}}

      \\resumeSubRole{{Software Engineer}}{{Jul 2023 -- Jul 2025}}
      \\resumeItemListStart
        \\resumeItem{{[4-6 bullets selected per BULLET SELECTION RULES for {role_category}]}}
      \\resumeItemListEnd
\\vspace{{3pt}}
      \\resumeSubRole{{Application Engineer Intern}}{{Feb 2023 -- Jun 2023}}
      \\resumeItemListStart
        \\resumeItem{{[1-2 intern bullets]}}
      \\resumeItemListEnd
  \\resumeSubHeadingListEnd

  \\resumeSubHeadingListStart
    \\item\\vspace{{-4pt}}
    \\begin{{tabular*}}{{\\textwidth}}[t]{{l@{{\\extracolsep{{\\fill}}}}r}}
      \\textbf{{Example ML Startup}}, \\textit{{Computer Vision team}} & \\textit{{\\small May 2021 -- Oct 2021}} \\\\
    \\end{{tabular*}}\\vspace{{-1pt}}
    \\textit{{\\small{{\\textbf{{Machine Learning Intern}}}} \\textit{{(Python, PyTorch, OpenCV, TensorFlow)}}}}
    \\vspace{{-7pt}}
      \\resumeItemListStart
        \\resumeItem{{[1 bullet]}}
      \\resumeItemListEnd
  \\resumeSubHeadingListEnd

5. PROJECTS — with \\ExternalLink and context:
\\section{{Projects}}
  \\resumeSubHeadingListStart
    \\item\\vspace{{-0pt}}
    \\small{{\\href{{url}}{{\\textbf{{Project Name}} (description) \\raisebox{{-0.1\\height}}\\ExternalLink}} $|$ \\textit{{context}} $|$ \\textit{{(tech stack)}}}}
    \\vspace{{-18pt}}
    \\resumeItemListStart
      \\resumeItem{{[1 bullet per project]}}
    \\resumeItemListEnd
  \\resumeSubHeadingListEnd

6. PUBLICATIONS AND ACHIEVEMENTS:
\\section{{Publications and Achievements}}
\\vspace{{-0pt}}
 \\begin{{itemize}}[leftmargin=0.15in]
    \\resumeItem{{\\href{{url}}{{\\textbf{{Research Paper}} \\raisebox{{-0.1\\height}}\\ExternalLink}} -- description}}
    \\vspace{{-2pt}}
    \\resumeItem{{\\href{{url}}{{\\textbf{{Competitive Programming}} \\raisebox{{-0.1\\height}}\\ExternalLink}} -- Global Rank 22/3200}}
 \\end{{itemize}}

═══ CRITICAL LATEX RULES ═══
1. Escape ALL special chars: \\%, \\$, \\&, \\_, \\#, \\{{, \\}}, \\~, \\^
2. Use \\href{{url}}{{\\underline{{text}}}} for links
3. ONE PAGE — guaranteed to compile to exactly one page with the preamble
4. ONLY data from MASTER VAULT — NEVER fabricate
5. Every bullet = action verb + quantified impact
6. Mirror JD keywords in bullets and skills
7. Do NOT include preamble — start from \\begin{{document}}
8. Use the EXACT heading format shown above (YOUR FULL NAME in full caps)
9. Use \\resumeSubRole for the SWE/Intern sub-roles under Example Bank
10. Education uses 3-column tabular with l@{{\\extracolsep{{\\fill}}}}c@{{\\extracolsep{{\\fill}}}}r
11. Skills section has exactly 2 categories: Languages and Technologies
12. Project format: \\href{{url}}{{\\textbf{{Name}} \\raisebox{{-0.1\\height}}\\ExternalLink}} $|$ \\textit{{context $|$ (tech stack)}}

Return ONLY the LaTeX code from \\begin{{document}} to \\end{{document}}. No explanations."""


def build_cover_letter_prompt(job: dict, role_category: str, connections: list, company_research: str = "") -> str:
    jd = (job.get("description") or "")[:6000]
    title = job.get("title", "")
    company = job.get("company", "")
    location = job.get("location", "")

    conn_context = ""
    if connections:
        names = ", ".join(f"{c['name']} ({c['role']})" for c in connections)
        conn_context = f"\nCONNECTIONS AT {company.upper()}: {names}\nMention the referral naturally in the closing paragraph."

    research_section = ""
    if company_research:
        research_section = f"""
═══ COMPANY RESEARCH (use for personalized hook and context) ═══
{company_research}
Use RECENT_NEWS for the opening hook. Use CULTURE_SIGNALS to align tone. Use TECH_CONTEXT to show you understand their stack.
"""

    # Role-specific paragraph ordering
    role_themes = {
        "SDE": "Para 2: Lead with 100+ TPS KYC APIs [B1] → Partner Portal 83% reduction [B2] → AWS Migration. Para 3: FreshBite (live production app at your-project.example.com) + CityTraffic.",
        "ML/AI": "Para 2: Lead with Springer publication [P5] → OmniSense 5-agent RAG pipeline [P3]. Para 3: Example ML Startup CV internship (F1+0.35, edge deployment).",
        "Fullstack": "Para 2: Lead with API Inventory Dashboard — full-stack ownership: React.js RBAC compliance portal [B3a] + Spring Boot compliance engine automating 15+ RBI rules [B3b], improving audit efficiency by 60%. Para 3: FreshBite (live at your-project.example.com — Next.js 14 + Spring Boot microservices).",
        "Frontend": "Para 2: Lead with React RBAC Dashboard [B3a] → LLM Email Assistant with React UI [B5]. Para 3: FreshBite Next.js 14 frontend + BuildMyWeb React live editor.",
        "Data": "Para 2: Lead with AWS Migration + 200+ JPA queries [B4] → Monitoring Scheduler 100+ services [B7]. Para 3: CityTraffic NLQ (2M+ records, P95 <600ms).",
        "DevOps": "Para 2: Lead with AWS Migration [B4] → Kong Monitoring [B7] → CI/CD pipeline experience. Para 3: FreshBite Docker + Vercel CI/CD deployment.",
    }
    theme = role_themes.get(role_category, role_themes["SDE"])

    return f"""You are the world's top career strategist who has written cover letters that secured offers at Google, Amazon, Meta, Apple, Netflix, and every top tech company. Your cover letters have a 78% interview conversion rate because they are SPECIFIC, METRICS-DRIVEN, and NEVER generic.

YOUR TASK: Write a KILLER personalized cover letter for Your Name applying to this specific role.

{MASTER_VAULT}

═══ TARGET JOB ═══
Title: {title}
Company: {company}
Location: {location}
Role Category: {role_category}
{conn_context}

Job Description:
{jd if jd else 'No description available — personalize based on company/role.'}
{research_section}
═══ COVER LETTER ARCHITECTURE ═══

ROLE-SPECIFIC THEME FOR {role_category.upper()}:
{theme}

PARAGRAPH 1 — THE HOOK (2-3 sentences):
- First sentence MUST reference something SPECIFIC about {company}: a recent product launch, technology decision, open-source contribution, market position, or mission statement
- Do NOT start with "I" — start with the company
- Second sentence: position yourself as the solution to their specific need

PARAGRAPH 2 — THE PROOF (3-4 sentences):
- Follow the ROLE-SPECIFIC THEME above for paragraph ordering
- Use exact numbers: "100+ TPS", "83% reduction", "50% cost savings ($120K)"
- Connect each metric to what THEY need

PARAGRAPH 3 — THE DIFFERENTIATOR (2-3 sentences):
- Follow the ROLE-SPECIFIC THEME above
- Add one unique differentiator: Springer publication, 4.11 GPA, competitive programming rank, or specific tech depth

PARAGRAPH 4 — THE CLOSE (2-3 sentences):
- Confident, direct ask for an interview
- If connection exists, mention them naturally
- Visa line: "As an F-1 student on CPT/OPT, I am fully authorized to work in the United States without employer sponsorship."
- Professional sign-off: "Sincerely, Your Name"

═══ ABSOLUTE RULES ═══
1. 250-320 words MAXIMUM
2. NEVER start with "I am writing to express my interest"
3. NEVER use "passionate", "enthusiastic", "I believe I would be a great fit"
4. NEVER start any sentence with "I am a highly motivated..."
5. Every paragraph must contain at least one SPECIFIC detail
6. Use EXACT skills/terminology from the JD
7. ONLY reference real data from the MASTER VAULT
8. Address to: Hiring Manager at {company}
9. Sign as: Your Name
10. Do NOT mention Previous University GPA

Return ONLY the cover letter text. No commentary, no explanations, no subject line."""


def build_outreach_prompt(job: dict, connections: list) -> str:
    title = job.get("title", "")
    company = job.get("company", "")
    jd_snippet = (job.get("description") or "")[:2000]

    conn_details = ""
    if connections:
        for c in connections:
            conn_details += f"\n  - {c['name']} | {c['role']} | Tier {c.get('tier', 3)}"

    return f"""You are a networking strategist who has helped 1,000+ candidates land FAANG internships through strategic outreach. Your messages have an 85% response rate because they are SHORT, SPECIFIC, and HUMAN.

YOUR TASK: Generate 3 types of outreach messages for Your Name targeting this role.

CANDIDATE SUMMARY:
- MSCS ASU, GPA 4.11/4.0 (graduating Dec 2026)
- 2yr SWE at Example Bank (100+ TPS APIs, 83% onboarding reduction, $120K cost savings)
- Springer Nature ML publication
- F-1 CPT/OPT authorized

TARGET ROLE: {title} at {company}

CONNECTIONS AT {company}:{conn_details if conn_details else ' None found'}

JD SNIPPET: {jd_snippet[:1000]}

═══ GENERATE EXACTLY 3 MESSAGES ═══

MESSAGE 1 — LINKEDIN CONNECTION REQUEST (if no existing connection) or LINKEDIN DM (if connected)
- HARD LIMIT: 300 characters for connection request, 500 characters for DM
- Must reference their SPECIFIC role at {company}
- Must mention one concrete thing about YOUR background relevant to THEIR work

MESSAGE 2 — COLD EMAIL (to recruiter or engineer)
- Subject line included
- 150-200 words MAX
- Hook: reference something specific about {company}'s product/tech
- Body: 2 sentences about your fit (with metrics)
- Ask: "Would a 15-minute chat be possible?"
- Sign-off: include LinkedIn profile link

MESSAGE 3 — REFERRAL ASK (for existing connection)
- 100-150 words
- Reference relationship/shared background
- Soft ask: "Would you be open to submitting a quick referral?"
- Include [JOB_LINK_PLACEHOLDER]

Return ONLY valid JSON:
{{"linkedin_message": "...", "cold_email": {{"subject": "...", "body": "..."}}, "referral_ask": "..."}}"""


def build_interview_prep_prompt(job: dict, role_category: str, company_research: str = "") -> str:
    """Generate interview prep questions and talking points."""
    jd = (job.get("description") or "")[:6000]
    title = job.get("title", "")
    company = job.get("company", "")

    research_section = ""
    if company_research:
        research_section = f"\nCOMPANY RESEARCH:\n{company_research}\n"

    return f"""You are a senior technical interview coach who has prepared 5,000+ candidates for FAANG interviews. Generate comprehensive interview prep for this specific role.

CANDIDATE: Your Name — MSCS ASU (4.11 GPA), 2yr SWE at Example Bank
KEY EXPERIENCE: 100+ TPS APIs, 83% onboarding reduction, AWS migration (zero data loss, 50% cost cut), React RBAC dashboard, Springer ML publication, multi-agent AI, distributed systems

ROLE: {title} at {company}
CATEGORY: {role_category}
{research_section}
JOB DESCRIPTION:
{jd[:4000]}

Generate the following in JSON format:

{{
  "behavioral_questions": [
    {{"question": "...", "recommended_star_story": "STAR-1/2/3/4 from vault", "key_points": ["..."]}}
  ],
  "technical_questions": [
    {{"question": "...", "topic_area": "...", "preparation_tips": "..."}}
  ],
  "company_talking_points": ["..."],
  "questions_to_ask": ["..."],
  "key_themes_to_emphasize": ["..."]
}}

RULES:
- 5 behavioral questions mapped to candidate's STAR stories
- 5 technical questions based on JD tech stack and role level (intern)
- 3-4 company-specific talking points (reference real products/tech)
- 3 smart questions to ask the interviewer
- 3-5 key themes from JD to weave into every answer

Return ONLY valid JSON."""


def build_follow_up_prompt(job: dict, connections: list) -> str:
    """Generate follow-up email templates."""
    title = job.get("title", "")
    company = job.get("company", "")

    conn_name = connections[0]["name"] if connections else "the hiring team"

    return f"""Generate 2 follow-up email templates for a job application.

CANDIDATE: Your Name, MSCS ASU
ROLE: {title} at {company}
CONNECTION/CONTACT: {conn_name}

Generate JSON:
{{
  "one_week_followup": {{
    "subject": "Following Up — {title} Application",
    "body": "..."
  }},
  "post_interview_thankyou": {{
    "subject": "Thank You — {title} Interview",
    "body": "..."
  }}
}}

RULES:
- 1-week follow-up: 80-120 words, reference original application, add one new value point
- Post-interview thank-you: 100-150 words, reference specific discussion topics, reaffirm interest
- Professional but warm tone
- Sign as: Your Name

Return ONLY valid JSON."""


def build_ats_audit_prompt(resume_text: str, jd: str) -> str:
    """Audit resume against JD for keyword coverage."""
    return f"""You are an ATS (Applicant Tracking System) expert. Analyze keyword coverage between this resume and job description.

RESUME:
{resume_text[:5000]}

JOB DESCRIPTION:
{jd[:5000]}

Perform this analysis:
1. Extract the top 20 most important keywords/phrases from the JD (technical skills, tools, methodologies)
2. Check which ones appear in the resume (exact match or close synonym)
3. Calculate coverage percentage
4. Identify the top 5 missing keywords that SHOULD be in the resume

Return ONLY valid JSON:
{{
  "jd_keywords": ["keyword1", "keyword2", ...],
  "matched_keywords": ["keyword1", "keyword3", ...],
  "missing_keywords": ["keyword2", ...],
  "coverage_pct": 85,
  "suggestions": ["Add X to skills section", "Mention Y in work experience bullets"]
}}"""


def build_multi_score_prompt(job: dict) -> str:
    """Multi-dimensional scoring."""
    jd = (job.get("description") or "")[:8000]
    company = job.get("company", "")
    title = job.get("title", "")
    conns = get_connections(company)
    conn_ctx = ""
    if conns:
        names = ", ".join(f"{c['name']} ({c['role']})" for c in conns)
        conn_ctx = f"\nCONNECTIONS: {names} — referral viable"

    return f"""You are a senior technical recruiter. Perform multi-dimensional analysis of this internship for Your Name.

CANDIDATE: MSCS ASU GPA 4.11 (Dec 2026) | 2yr SWE Example Bank (100+ TPS APIs, Spring Boot/Redis/AWS, React RBAC dashboard, 83% onboarding reduction, 50% cost cut) | Springer ML publication | F-1 CPT/OPT authorized
STACK: Java, Python, Spring Boot, React, Next.js, FastAPI, AWS, Docker, PostgreSQL, MongoDB, Redis, Kafka, PyTorch, TensorFlow, LLMs, RAG, microservices, REST APIs
{conn_ctx}

JOB: {title} at {company} ({job.get('location', 'USA')})
{('DESCRIPTION:' + chr(10) + jd) if jd else 'No description available.'}

VISA: "must be authorized" / "cannot sponsor" = NOT a blocker (CPT/OPT = authorized). Only fail on "US citizen only" or "active security clearance".

Score each dimension 0-100 and provide an overall score:

Return ONLY JSON:
{{
  "overall_score": 0,
  "technical_match": {{"score": 0, "matched_skills": ["..."], "missing_skills": ["..."]}},
  "experience_relevance": {{"score": 0, "reasoning": "..."}},
  "education_fit": {{"score": 0, "reasoning": "..."}},
  "culture_alignment": {{"score": 0, "reasoning": "..."}},
  "gap_analysis": ["gap1", "gap2"],
  "recommendation": "STRONG_APPLY/APPLY/MAYBE/SKIP",
  "summary": "2-3 sentences",
  "cover_letter_emphasis": ["what to highlight in cover letter based on gaps"]
}}"""


# ═══════════════════════════════════════════════════════════════════════
# SCORE PROMPT (for re-scoring if needed — legacy compat)
# ═══════════════════════════════════════════════════════════════════════
def build_score_prompt(job: dict) -> str:
    jd = (job.get("description") or "")[:8000]
    company = job.get("company", "")
    title = job.get("title", "")
    conns = get_connections(company)
    conn_ctx = ""
    if conns:
        names = ", ".join(f"{c['name']} ({c['role']})" for c in conns)
        conn_ctx = f"\nCONNECTIONS: {names} — referral viable"

    return f"""You are a senior technical recruiter. Analyze this internship for Your Name. Score 0-100.

CANDIDATE: MSCS ASU GPA 4.11 (Dec 2026) | 2yr SWE Example Bank (100+ TPS APIs, Spring Boot/Redis/AWS, 83% onboarding reduction, 50% cost cut) | Springer ML publication | F-1 CPT/OPT authorized
STACK: Java, Python, Spring Boot, React, FastAPI, AWS, Docker, PostgreSQL, MongoDB, Redis, Kafka, PyTorch, TensorFlow, LLMs, RAG, microservices, REST APIs
{conn_ctx}

JOB: {title} at {company} ({job.get('location', 'USA')})
{('DESCRIPTION:' + chr(10) + jd) if jd else 'No description available.'}

VISA: "must be authorized" / "cannot sponsor" = NOT a blocker (CPT/OPT = authorized). Only fail on "US citizen only" or "active security clearance".

SCORING: 85-100=Perfect | 70-84=Strong | 55-69=Decent | 40-54=Weak | 0-39=Poor

Return ONLY JSON: {{"score":0,"summary":"2 sentences","recommendation":"APPLY/MAYBE/SKIP","apply_rationale":"1 sentence"}}"""


# ═══════════════════════════════════════════════════════════════════════
# DEDUPLICATION
# ═══════════════════════════════════════════════════════════════════════
def load_existing_docs() -> set:
    """Load job keys from previously generated docs to avoid regeneration."""
    existing_keys = set()
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE) as f:
                data = json.load(f)
            for source_data in data.get("sources", {}).values():
                for role_docs in source_data.values():
                    for doc in role_docs:
                        if doc.get("job_key") and "error" not in doc:
                            existing_keys.add(doc["job_key"])
        except Exception:
            pass
    return existing_keys


# ═══════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════
def fetch_jobs(days: int, from_file: bool) -> list:
    """Fetch jobs from batch file or API."""
    if from_file:
        print(f"  Loading from {BATCH_FILE}...")
        with open(BATCH_FILE) as f:
            data = json.load(f)
        jobs = data.get("jobs", data) if isinstance(data, dict) else data
    else:
        url = f"{N8N_BASE}/webhook/jobs-api?days={days}"
        print(f"  Fetching from {url}...")
        r = requests.get(url, timeout=120)
        r.raise_for_status()
        data = r.json()
        jobs = data.get("jobs", data) if isinstance(data, dict) else data
    return jobs


def get_job_score(job: dict) -> int:
    """Get score from job data (handles nested _analysis)."""
    if job.get("_score"):
        return int(job["_score"])
    a = job.get("_analysis", {})
    if a.get("score"):
        return int(a["score"])
    if job.get("score"):
        return int(job["score"])
    return 0


def generate_docs_for_job(job: dict, role_cat: str, idx: int, total: int) -> dict:
    """Generate all documents for a single job."""
    title = job.get("title", "Unknown")
    company = job.get("company", "Unknown")
    score = get_job_score(job)
    connections = get_connections(company)
    job_key = f"{title.strip().lower()}||{company.strip().lower()}"
    jd = job.get("description") or ""

    result = {
        "job_key": job_key,
        "title": title,
        "company": company,
        "location": job.get("location", ""),
        "url": job.get("link") or job.get("url", ""),
        "posted_at": job.get("postedAt", ""),
        "score": score,
        "role_category": role_cat,
        "source": classify_source(job),
        "connections": connections,
        "has_connections": len(connections) > 0,
        "generated_at": datetime.now().isoformat(),
    }

    # 0. Company Research ("Invisible Trick")
    company_research = ""
    print(f"    [{idx}/{total}] Company research...", end=" ", flush=True)
    try:
        company_research = research_company(company, title, jd)
        result["company_research"] = company_research
        print(f"OK ({len(company_research)} chars)")
    except Exception as e:
        print(f"SKIP: {e}")
        result["company_research"] = ""
    time.sleep(THROTTLE_SEC)

    # 1. Generate Resume (Text)
    print(f"    [{idx}/{total}] Resume (text)...", end=" ", flush=True)
    try:
        resume_text = call_gemini(build_resume_text_prompt(job, role_cat, company_research), max_tokens=16000, expect_json=False)
        result["resume_text"] = resume_text
        print(f"OK ({len(resume_text)} chars)")
    except Exception as e:
        result["resume_text"] = f"ERROR: {e}"
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # 2. Generate Resume (LaTeX)
    print(f"    [{idx}/{total}] Resume (LaTeX)...", end=" ", flush=True)
    try:
        latex_body = call_gemini(build_resume_latex_prompt(job, role_cat, company_research), max_tokens=16000, expect_json=False)
        # Strip any markdown code fences
        latex_body = re.sub(r'^```(?:latex|tex)?\s*', '', latex_body)
        latex_body = re.sub(r'\s*```$', '', latex_body)
        # If it already includes \begin{document}, use as-is; otherwise wrap
        if r'\begin{document}' in latex_body:
            result["resume_latex"] = LATEX_PREAMBLE.split(r'\begin{document}')[0] + latex_body
        else:
            result["resume_latex"] = LATEX_PREAMBLE + "\n" + latex_body + "\n" + LATEX_FOOTER
        print(f"OK ({len(result['resume_latex'])} chars)")
    except Exception as e:
        result["resume_latex"] = f"% ERROR: {e}"
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # 3. ATS Keyword Audit
    print(f"    [{idx}/{total}] ATS audit...", end=" ", flush=True)
    try:
        if result.get("resume_text") and not result["resume_text"].startswith("ERROR"):
            ats_result = call_gemini(build_ats_audit_prompt(result["resume_text"], jd), max_tokens=4096, expect_json=True)
            result["ats_audit"] = ats_result
            coverage = ats_result.get("coverage_pct", 0)
            missing = len(ats_result.get("missing_keywords", []))
            print(f"OK (coverage: {coverage}%, {missing} missing)")
        else:
            print("SKIP (no resume)")
    except Exception as e:
        result["ats_audit"] = {"error": str(e)}
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # 4. Generate Cover Letter
    print(f"    [{idx}/{total}] Cover letter...", end=" ", flush=True)
    try:
        cover_letter = call_gemini(
            build_cover_letter_prompt(job, role_cat, connections, company_research),
            max_tokens=8192, expect_json=False
        )
        result["cover_letter"] = cover_letter
        print(f"OK ({len(cover_letter)} chars)")
    except Exception as e:
        result["cover_letter"] = f"ERROR: {e}"
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # 5. Generate Outreach Messages
    print(f"    [{idx}/{total}] Outreach...", end=" ", flush=True)
    try:
        outreach = call_gemini(build_outreach_prompt(job, connections), max_tokens=8192, expect_json=True)
        result["outreach"] = outreach
        conn_flag = " [connected]" if connections else ""
        print(f"OK{conn_flag}")
    except Exception as e:
        result["outreach"] = {"error": str(e)}
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # 6. Generate Follow-Up Templates
    print(f"    [{idx}/{total}] Follow-ups...", end=" ", flush=True)
    try:
        follow_up = call_gemini(build_follow_up_prompt(job, connections), max_tokens=4096, expect_json=True)
        result["follow_up"] = follow_up
        print("OK")
    except Exception as e:
        result["follow_up"] = {"error": str(e)}
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # 7. Interview Prep (only for score >= 60)
    if score >= 60:
        print(f"    [{idx}/{total}] Interview prep...", end=" ", flush=True)
        try:
            interview_prep = call_gemini(build_interview_prep_prompt(job, role_cat, company_research), max_tokens=8192, expect_json=True)
            result["interview_prep"] = interview_prep
            q_count = len(interview_prep.get("behavioral_questions", [])) + len(interview_prep.get("technical_questions", []))
            print(f"OK ({q_count} questions)")
        except Exception as e:
            result["interview_prep"] = {"error": str(e)}
            print(f"FAIL: {e}")
        time.sleep(THROTTLE_SEC)

    # 8. Multi-dimensional scoring
    print(f"    [{idx}/{total}] Multi-score...", end=" ", flush=True)
    try:
        multi_score = call_gemini(build_multi_score_prompt(job), max_tokens=4096, expect_json=True)
        result["multi_score"] = multi_score
        tech = multi_score.get("technical_match", {}).get("score", "?")
        exp = multi_score.get("experience_relevance", {}).get("score", "?")
        print(f"OK (tech:{tech} exp:{exp})")
    except Exception as e:
        result["multi_score"] = {"error": str(e)}
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    return result


# ═══════════════════════════════════════════════════════════════════════
# CONCURRENT JOB PROCESSOR — DAG-based intra-job parallelism
# ═══════════════════════════════════════════════════════════════════════
def generate_docs_for_job_concurrent(job: dict, role_cat: str, idx: int, total: int) -> dict:
    """Generate all documents using DAG parallelism within each job.

    DAG structure (after company research):
        Resume Text → ATS Audit   (track 1, sequential pair)
        Resume LaTeX              (track 2, parallel)
        Cover Letter              (track 3, parallel)
        Outreach                  (track 4, parallel)
        Follow-ups                (track 5, parallel)
        Interview Prep (≥60)      (track 6, parallel)
        Multi-score               (track 7, parallel)
    """
    title = job.get("title", "Unknown")
    company = job.get("company", "Unknown")
    score = get_job_score(job)
    connections = get_connections(company)
    jd = job.get("description") or ""
    job_key = f"{title.strip().lower()}||{company.strip().lower()}"

    result = {
        "job_key": job_key, "title": title, "company": company,
        "location": job.get("location", ""),
        "url": job.get("link") or job.get("url", ""),
        "posted_at": job.get("postedAt", ""),
        "score": score, "role_category": role_cat,
        "source": classify_source(job),
        "connections": connections, "has_connections": len(connections) > 0,
        "generated_at": datetime.now().isoformat(),
    }
    doc_errors = []

    # ── Stage 1: Company Research (gate — must finish before doc gen) ──
    _tprint(f"      [{idx}/{total}] Researching {company[:25]}...")
    try:
        # Wrap research_company with semaphore + retry (it calls Gemini internally)
        for _attempt in range(RETRY_MAX):
            try:
                if _api_semaphore:
                    _api_semaphore.acquire()
                try:
                    company_research = research_company(company, title, jd)
                finally:
                    if _api_semaphore:
                        _api_semaphore.release()
                break
            except Exception as _e:
                if _attempt < RETRY_MAX - 1:
                    time.sleep(RETRY_BASE_SEC * (2 ** _attempt))
                else:
                    raise _e
        result["company_research"] = company_research
    except Exception as e:
        company_research = ""
        result["company_research"] = ""
        doc_errors.append(("company_research", e))

    if _shutdown.is_set():
        return result

    # ── Stage 2: Parallel doc generation (7 tracks via DAG) ──
    _tprint(f"      [{idx}/{total}] Generating docs for {company[:25]} (7 parallel tracks)...")

    def _track_resume_pipeline():
        """Track 1: Resume text → ATS audit (sequential dependency)."""
        try:
            txt = call_gemini_safe(
                build_resume_text_prompt(job, role_cat, company_research),
                max_tokens=16000, expect_json=False)
            result["resume_text"] = txt
        except Exception as e:
            result["resume_text"] = f"ERROR: {e}"
            doc_errors.append(("resume_text", e))
            return
        # ATS audit depends on resume text
        try:
            ats = call_gemini_safe(
                build_ats_audit_prompt(txt, jd), max_tokens=4096, expect_json=True)
            result["ats_audit"] = ats
        except Exception as e:
            result["ats_audit"] = {"error": str(e)}
            doc_errors.append(("ats_audit", e))

    def _track_latex():
        """Track 2: Resume LaTeX (independent)."""
        try:
            body = call_gemini_safe(
                build_resume_latex_prompt(job, role_cat, company_research),
                max_tokens=16000, expect_json=False)
            body = re.sub(r'^```(?:latex|tex)?\s*', '', body)
            body = re.sub(r'\s*```$', '', body)
            if r'\begin{document}' in body:
                result["resume_latex"] = LATEX_PREAMBLE.split(r'\begin{document}')[0] + body
            else:
                result["resume_latex"] = LATEX_PREAMBLE + "\n" + body + "\n" + LATEX_FOOTER
        except Exception as e:
            result["resume_latex"] = f"% ERROR: {e}"
            doc_errors.append(("resume_latex", e))

    def _track_cover_letter():
        """Track 3: Cover letter (independent)."""
        try:
            cl = call_gemini_safe(
                build_cover_letter_prompt(job, role_cat, connections, company_research),
                max_tokens=8192, expect_json=False)
            result["cover_letter"] = cl
        except Exception as e:
            result["cover_letter"] = f"ERROR: {e}"
            doc_errors.append(("cover_letter", e))

    def _track_outreach():
        """Track 4: Outreach messages (independent)."""
        try:
            result["outreach"] = call_gemini_safe(
                build_outreach_prompt(job, connections),
                max_tokens=8192, expect_json=True)
        except Exception as e:
            result["outreach"] = {"error": str(e)}
            doc_errors.append(("outreach", e))

    def _track_follow_ups():
        """Track 5: Follow-up templates (independent)."""
        try:
            result["follow_up"] = call_gemini_safe(
                build_follow_up_prompt(job, connections),
                max_tokens=4096, expect_json=True)
        except Exception as e:
            result["follow_up"] = {"error": str(e)}
            doc_errors.append(("follow_up", e))

    def _track_interview_prep():
        """Track 6: Interview prep (independent, only if score >= 60)."""
        if score < 60:
            return
        try:
            result["interview_prep"] = call_gemini_safe(
                build_interview_prep_prompt(job, role_cat, company_research),
                max_tokens=8192, expect_json=True)
        except Exception as e:
            result["interview_prep"] = {"error": str(e)}
            doc_errors.append(("interview_prep", e))

    def _track_multi_score():
        """Track 7: Multi-dimensional scoring (independent)."""
        try:
            result["multi_score"] = call_gemini_safe(
                build_multi_score_prompt(job), max_tokens=4096, expect_json=True)
        except Exception as e:
            result["multi_score"] = {"error": str(e)}
            doc_errors.append(("multi_score", e))

    # Submit all parallel tracks
    tracks = [
        _track_resume_pipeline,   # resume text → ATS audit (2 API calls, sequential)
        _track_latex,             # 1 API call
        _track_cover_letter,      # 1 API call
        _track_outreach,          # 1 API call
        _track_follow_ups,        # 1 API call
        _track_interview_prep,    # 1 API call (if score >= 60)
        _track_multi_score,       # 1 API call
    ]

    with concurrent.futures.ThreadPoolExecutor(max_workers=len(tracks)) as executor:
        futures = {executor.submit(fn): fn.__name__ for fn in tracks}
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception as e:
                doc_errors.append((futures[future], e))

    # Count successful docs
    ok_docs = sum(1 for k in ["company_research", "resume_text", "resume_latex",
                               "ats_audit", "cover_letter", "outreach", "follow_up",
                               "interview_prep", "multi_score"]
                  if result.get(k) and not (isinstance(result[k], str) and result[k].startswith("ERROR"))
                  and not (isinstance(result[k], dict) and "error" in result[k]))

    _tprint(f"      [{idx}/{total}] {company[:25]}: {ok_docs} docs OK, {len(doc_errors)} errors")
    return result


def run_pipeline_concurrent(organized, total_qualified, args, existing_keys):
    """Run the full pipeline with concurrent worker pool + DAG parallelism.

    Architecture:
      - N workers process jobs from a priority queue (highest score first)
      - Each worker uses DAG parallelism within each job (7 parallel tracks)
      - Global semaphore limits concurrent Gemini API calls
      - Results saved immediately as each job completes (crash-safe)
      - Graceful shutdown on SIGINT saves progress
    """
    _init_concurrent(args.max_api)

    # Build priority queue: (negative_score, tiebreaker_idx, source, role, job)
    job_queue = []
    tie_idx = 0
    for source in ["linkedin", "github", "linkedin_manual"]:
        for role, role_jobs in organized[source].items():
            for job in role_jobs:
                score = get_job_score(job)
                job_queue.append((-score, tie_idx, source, role, job))
                tie_idx += 1
    job_queue.sort()  # highest score first (negative score = highest priority)

    completed = []       # [(source, role, doc, error_or_None)]
    completed_lock = threading.Lock()
    job_counter = [0]
    counter_lock = threading.Lock()

    def process_one(neg_score, tie_idx, source, role, job):
        """Process a single job (runs in a worker thread)."""
        if _shutdown.is_set():
            return

        with counter_lock:
            job_counter[0] += 1
            idx = job_counter[0]

        title = job.get("title", "?")
        company = job.get("company", "?")
        score = get_job_score(job)
        conns = get_connections(company)
        conn_flag = " [conn]" if conns else ""

        _tprint(f"\n  ┌── [{idx}/{total_qualified}] {title[:50]} @ {company}{conn_flag} (score: {score})")

        try:
            doc = generate_docs_for_job_concurrent(job, role, idx, total_qualified)

            # Save files immediately (crash-safe)
            safe_name = re.sub(r'[^\w\-]', '_', f"{company}_{title}")[:80]
            job_dir = os.path.join(OUTPUT_DIR, source, role, safe_name)
            _save_job_files(doc, job_dir)

            _tprint(f"  └── [{idx}/{total_qualified}] {company[:25]}: saved to {safe_name}/")

            with completed_lock:
                completed.append((source, role, doc, None))

        except Exception as e:
            _tprint(f"  └── [{idx}/{total_qualified}] {company[:25]}: FATAL: {e}")
            with completed_lock:
                completed.append((source, role, {
                    "title": title, "company": company, "score": score,
                    "error": str(e), "role_category": role
                }, e))

    # Run worker pool
    workers = min(args.workers, len(job_queue)) if job_queue else 0
    if workers == 0:
        _tprint("\n  No jobs to process. All jobs already have complete docs.")
        return completed
    _tprint(f"\n  {'='*60}")
    _tprint(f"  CONCURRENT PIPELINE v3")
    _tprint(f"  Workers: {workers} | API concurrency: {args.max_api} | Jobs: {len(job_queue)}")
    _tprint(f"  DAG: 7 parallel tracks per job (company research → 7 docs)")
    _tprint(f"  Estimated speedup: ~{min(workers * 3, 10)}x vs sequential")
    _tprint(f"  {'='*60}\n")

    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as executor:
        futures = []
        for item in job_queue:
            if _shutdown.is_set():
                break
            futures.append(executor.submit(process_one, *item))

        # Wait for all jobs to complete
        for future in concurrent.futures.as_completed(futures):
            try:
                future.result()
            except Exception:
                pass

    # Aggregate results
    all_results = {
        "generated_at": datetime.now().isoformat(),
        "pipeline_version": "3.0-concurrent",
        "config": {
            "days": args.days, "min_score": args.min_score,
            "model": GEMINI_MODEL, "workers": workers,
            "max_api": args.max_api
        },
        "summary": {"total_jobs": 0, "qualified": total_qualified, "generated": 0, "errors": 0},
        "sources": {}
    }

    for source, role, doc, err in completed:
        all_results["sources"].setdefault(source, {}).setdefault(role, []).append(doc)
        if err:
            all_results["summary"]["errors"] += 1
        else:
            all_results["summary"]["generated"] += 1

    # Merge with existing output (dedup-aware)
    if existing_keys and os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE) as f:
                prev = json.load(f)
            for source in all_results["sources"]:
                if source not in prev.get("sources", {}):
                    prev.setdefault("sources", {})[source] = all_results["sources"][source]
                else:
                    for role in all_results["sources"][source]:
                        if role not in prev["sources"][source]:
                            prev["sources"][source][role] = all_results["sources"][source][role]
                        else:
                            existing_in_role = {d.get("job_key") for d in prev["sources"][source][role]}
                            for d in all_results["sources"][source][role]:
                                if d.get("job_key") not in existing_in_role:
                                    prev["sources"][source][role].append(d)
            prev["generated_at"] = datetime.now().isoformat()
            prev["pipeline_version"] = "3.0-concurrent"
            prev["summary"]["generated"] += all_results["summary"]["generated"]
            prev["summary"]["errors"] += all_results["summary"]["errors"]
            all_results = prev
        except Exception:
            pass

    # Save master output
    with open(OUTPUT_FILE, "w") as f:
        json.dump(all_results, f, indent=2, default=str)

    return all_results


def manual_jd_input():
    """Interactive mode: paste JD and get tailored docs immediately."""
    print("\n" + "=" * 70)
    print("  MANUAL JD INPUT MODE")
    print("  Paste job details, get tailored resume + cover letter instantly")
    print("=" * 70 + "\n")

    print("Enter company name: ", end="", flush=True)
    company = input().strip()
    print("Enter job title: ", end="", flush=True)
    title = input().strip()
    print("Enter location (or press Enter for 'USA'): ", end="", flush=True)
    location = input().strip() or "USA"

    print("\nPaste the FULL job description (type END on a new line when done):")
    jd_lines = []
    while True:
        line = input()
        if line.strip() == "END":
            break
        jd_lines.append(line)
    jd = "\n".join(jd_lines)

    print(f"\nOptionally paste your existing resume text (type END on a new line, or just type END to skip):")
    resume_lines = []
    while True:
        line = input()
        if line.strip() == "END":
            break
        resume_lines.append(line)
    existing_resume = "\n".join(resume_lines)

    # Build job dict
    job = {
        "title": title,
        "company": company,
        "location": location,
        "description": jd,
        "link": "",
        "postedAt": datetime.now().isoformat(),
    }

    role_cat = classify_role(title, jd)
    connections = get_connections(company)
    score = 0

    print(f"\n  Role category: {role_cat}")
    print(f"  Connections: {len(connections)} found")
    print(f"  JD length: {len(jd)} chars")
    if existing_resume:
        print(f"  Existing resume: {len(existing_resume)} chars (will use as additional context)")
    print()

    # Company research
    print("  [1/6] Researching company...", end=" ", flush=True)
    try:
        company_research = research_company(company, title, jd)
        print(f"OK ({len(company_research)} chars)")
    except Exception as e:
        company_research = ""
        print(f"SKIP: {e}")
    time.sleep(THROTTLE_SEC)

    # Multi-score
    print("  [2/6] Scoring match...", end=" ", flush=True)
    try:
        multi_score = call_gemini(build_multi_score_prompt(job), max_tokens=4096, expect_json=True)
        score = multi_score.get("overall_score", 0)
        print(f"Score: {score}/100 — {multi_score.get('recommendation', '?')}")
        gaps = multi_score.get("gap_analysis", [])
        if gaps:
            print(f"  Gaps: {', '.join(gaps[:3])}")
    except Exception as e:
        multi_score = {}
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # Resume text
    print("  [3/6] Generating resume (text)...", end=" ", flush=True)
    try:
        resume_text = call_gemini(build_resume_text_prompt(job, role_cat, company_research), max_tokens=16000, expect_json=False)
        print(f"OK ({len(resume_text)} chars)")
    except Exception as e:
        resume_text = f"ERROR: {e}"
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # Resume LaTeX
    print("  [4/6] Generating resume (LaTeX)...", end=" ", flush=True)
    try:
        latex_body = call_gemini(build_resume_latex_prompt(job, role_cat, company_research), max_tokens=16000, expect_json=False)
        latex_body = re.sub(r'^```(?:latex|tex)?\s*', '', latex_body)
        latex_body = re.sub(r'\s*```$', '', latex_body)
        if r'\begin{document}' in latex_body:
            resume_latex = LATEX_PREAMBLE.split(r'\begin{document}')[0] + latex_body
        else:
            resume_latex = LATEX_PREAMBLE + "\n" + latex_body + "\n" + LATEX_FOOTER
        print(f"OK ({len(resume_latex)} chars)")
    except Exception as e:
        resume_latex = f"% ERROR: {e}"
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # Cover letter
    print("  [5/6] Generating cover letter...", end=" ", flush=True)
    try:
        cover_letter = call_gemini(
            build_cover_letter_prompt(job, role_cat, connections, company_research),
            max_tokens=8192, expect_json=False
        )
        print(f"OK ({len(cover_letter)} chars)")
    except Exception as e:
        cover_letter = f"ERROR: {e}"
        print(f"FAIL: {e}")
    time.sleep(THROTTLE_SEC)

    # ATS audit
    print("  [6/6] ATS keyword audit...", end=" ", flush=True)
    ats_audit = {}
    try:
        if resume_text and not resume_text.startswith("ERROR"):
            ats_audit = call_gemini(build_ats_audit_prompt(resume_text, jd), max_tokens=4096, expect_json=True)
            print(f"Coverage: {ats_audit.get('coverage_pct', '?')}%")
        else:
            print("SKIP")
    except Exception as e:
        print(f"FAIL: {e}")

    # Save output
    safe_name = re.sub(r'[^\w\-]', '_', f"{company}_{title}")[:80]
    job_dir = os.path.join(OUTPUT_DIR, "manual", safe_name)
    os.makedirs(job_dir, exist_ok=True)

    with open(os.path.join(job_dir, "resume.txt"), "w") as f:
        f.write(resume_text)
    with open(os.path.join(job_dir, "resume.tex"), "w") as f:
        f.write(resume_latex)
    with open(os.path.join(job_dir, "cover_letter.txt"), "w") as f:
        f.write(cover_letter)
    if ats_audit:
        with open(os.path.join(job_dir, "ats_audit.json"), "w") as f:
            json.dump(ats_audit, f, indent=2)
    if multi_score:
        with open(os.path.join(job_dir, "multi_score.json"), "w") as f:
            json.dump(multi_score, f, indent=2)

    print(f"\n{'='*70}")
    print(f"  MANUAL GENERATION COMPLETE")
    print(f"{'='*70}")
    print(f"  Company:     {company}")
    print(f"  Role:        {title} ({role_cat})")
    print(f"  Match Score: {score}/100")
    if ats_audit:
        print(f"  ATS Coverage:{ats_audit.get('coverage_pct', '?')}%")
        missing = ats_audit.get("missing_keywords", [])
        if missing:
            print(f"  Missing KWs: {', '.join(missing[:5])}")
    print(f"  Output:      {job_dir}/")
    print(f"  Files:       resume.txt, resume.tex, cover_letter.txt, ats_audit.json")
    print(f"{'='*70}\n")

    # Print cover letter preview
    print("--- COVER LETTER PREVIEW ---")
    print(cover_letter[:500])
    if len(cover_letter) > 500:
        print("...\n")

    return {
        "company": company, "title": title, "role_category": role_cat,
        "score": score, "resume_text": resume_text, "resume_latex": resume_latex,
        "cover_letter": cover_letter, "ats_audit": ats_audit, "multi_score": multi_score,
        "output_dir": job_dir
    }


def main():
    parser = argparse.ArgumentParser(description="Generate tailored job documents pipeline v2")
    parser.add_argument("--days", type=int, default=7, help="Days to look back (default: 7)")
    parser.add_argument("--min-score", type=int, default=30, help="Minimum score to generate docs (default: 30)")
    parser.add_argument("--top", type=int, default=0, help="Only process top N jobs (default: all)")
    parser.add_argument("--from-file", action="store_true", help="Use local batch_analysis_results.json")
    parser.add_argument("--dry-run", action="store_true", help="Classify and list only, no generation")
    parser.add_argument("--rescore", action="store_true", help="Re-score jobs via Gemini before generating")
    parser.add_argument("--retry-failures", action="store_true", help="Only re-process previously failed items")
    parser.add_argument("--no-dedup", action="store_true", help="Skip deduplication check")
    parser.add_argument("--manual", action="store_true", help="Manual JD input mode")
    parser.add_argument("--workers", type=int, default=MAX_WORKERS, help=f"Concurrent job workers (default: {MAX_WORKERS})")
    parser.add_argument("--max-api", type=int, default=MAX_API_CALLS, help=f"Max concurrent API calls (default: {MAX_API_CALLS})")
    parser.add_argument("--sequential", action="store_true", help="Use sequential processing (v2 mode, no concurrency)")
    parser.add_argument("--jobs-file", type=str, help="Load jobs from a local JSON file instead of API")
    args = parser.parse_args()

    # Manual mode
    if args.manual:
        manual_jd_input()
        return

    start_time = datetime.now()
    print(f"\n{'='*70}")
    print(f"  JOB DOCUMENT GENERATION PIPELINE v2")
    print(f"  {start_time.strftime('%Y-%m-%d %H:%M:%S')} | min_score={args.min_score} | days={args.days}")
    print(f"{'='*70}\n")

    # ── Step 1: Fetch Jobs ──
    print("[1/6] Fetching jobs...")
    if args.jobs_file:
        print(f"  Loading from {args.jobs_file}...")
        with open(args.jobs_file) as f:
            jobs = json.load(f)
        if isinstance(jobs, dict):
            jobs = jobs.get("jobs", list(jobs.values()))
        print(f"  -> {len(jobs)} jobs loaded from file\n")
    else:
        jobs = fetch_jobs(args.days, args.from_file)
        print(f"  -> {len(jobs)} jobs loaded\n")

    # ── Step 2: Score if needed ──
    if args.rescore:
        print("[2/6] Re-scoring jobs via Gemini...")
        for i, job in enumerate(jobs, 1):
            title = job.get("title", "?")
            company = job.get("company", "?")
            print(f"  [{i:02d}/{len(jobs)}] {title[:40]} @ {company[:20]}...", end=" ", flush=True)
            try:
                result = call_gemini(build_score_prompt(job), max_tokens=4096, expect_json=True)
                job["_score"] = result.get("score", 0)
                job["_analysis"] = result
                print(f"score={result.get('score', 0)}")
            except Exception as e:
                print(f"ERROR: {e}")
                job["_score"] = 0
            time.sleep(THROTTLE_SEC)
        print()
    else:
        print("[2/6] Using existing scores (pass --rescore to re-score)\n")

    # ── Step 3: Deduplication check ──
    existing_keys = set()
    if not args.no_dedup and not args.retry_failures:
        print("[3/6] Checking for previously generated docs...")
        existing_keys = load_existing_docs()
        if existing_keys:
            print(f"  -> {len(existing_keys)} previously generated docs found (will skip)")
        else:
            print("  -> No previous docs found")
    elif args.retry_failures:
        print("[3/6] Retry mode — loading previous failures...")
        if os.path.exists(OUTPUT_FILE):
            try:
                with open(OUTPUT_FILE) as f:
                    prev = json.load(f)
                # Collect successful keys to skip (only fully complete docs)
                _core_fields = ["company_research", "resume_text", "resume_latex",
                                "cover_letter", "outreach", "follow_up", "multi_score", "ats_audit"]
                _partial_count = 0
                for source_data in prev.get("sources", {}).values():
                    for role_docs in source_data.values():
                        for doc in role_docs:
                            if doc.get("job_key") and "error" not in doc:
                                # Check if all core doc fields are present
                                _missing = [f for f in _core_fields if not doc.get(f)]
                                if not _missing:
                                    existing_keys.add(doc["job_key"])
                                else:
                                    _partial_count += 1
                print(f"  -> Will skip {len(existing_keys)} successful docs, retry {_partial_count} partial docs")
            except Exception:
                print("  -> Could not load previous output")
    else:
        print("[3/6] Dedup disabled\n")

    # ── Step 4: Classify & Organize ──
    print("[4/6] Classifying jobs by source and role...")

    # Filter by score
    qualified = [j for j in jobs if get_job_score(j) >= args.min_score]
    qualified.sort(key=lambda j: get_job_score(j), reverse=True)
    if args.top > 0:
        qualified = qualified[:args.top]

    # Filter out already-generated (dedup)
    if existing_keys:
        before = len(qualified)
        qualified = [j for j in qualified if f"{j.get('title', '').strip().lower()}||{j.get('company', '').strip().lower()}" not in existing_keys]
        skipped_dedup = before - len(qualified)
        if skipped_dedup:
            print(f"  -> Skipped {skipped_dedup} already-generated jobs")

    # Classify
    ROLE_CATS = {"SDE": [], "ML/AI": [], "Frontend": [], "Fullstack": [], "Data": [], "DevOps": [], "Other": []}
    organized = {
        "linkedin": {k: list(v) for k, v in ROLE_CATS.items()},
        "github": {k: list(v) for k, v in ROLE_CATS.items()},
        "linkedin_manual": {k: list(v) for k, v in ROLE_CATS.items()},
    }

    for job in qualified:
        source = classify_source(job)
        role = classify_role(job.get("title", ""), job.get("description", ""))
        if role not in organized[source]:
            role = "Other"
        organized[source][role].append(job)

    # Print classification summary
    print(f"\n  {'SOURCE':<12} {'ROLE':<12} {'COUNT':>5} {'AVG SCORE':>10}")
    print(f"  {'-'*12} {'-'*12} {'-'*5} {'-'*10}")
    total_qualified = 0
    for source in ["linkedin", "github", "linkedin_manual"]:
        for role, role_jobs in organized[source].items():
            if role_jobs:
                avg = sum(get_job_score(j) for j in role_jobs) / len(role_jobs)
                print(f"  {source:<12} {role:<12} {len(role_jobs):>5} {avg:>10.1f}")
                total_qualified += len(role_jobs)

    print(f"\n  Total qualifying (score >= {args.min_score}): {total_qualified} / {len(jobs)}")
    skipped = len(jobs) - total_qualified
    print(f"  Skipped: {skipped}\n")

    # ── Print detailed job listing ──
    print(f"  {'='*70}")
    for source in ["linkedin", "github", "linkedin_manual"]:
        source_jobs = sum(len(v) for v in organized[source].values())
        if source_jobs == 0:
            continue
        print(f"\n  {source.upper()} JOBS ({source_jobs})")
        print(f"  {'-'*66}")
        for role, role_jobs in organized[source].items():
            if not role_jobs:
                continue
            print(f"\n    {role} ({len(role_jobs)} jobs)")
            for j in role_jobs:
                score = get_job_score(j)
                conns = get_connections(j.get("company", ""))
                flags = ""
                if conns:
                    flags += " [conn]"
                if j.get("_enriched"):
                    flags += " [enriched]"
                print(f"      {score:>3}  {j.get('title', '')[:45]:<45} {j.get('company', '')[:20]:<20}{flags}")

    print(f"\n  {'='*70}\n")

    if args.dry_run:
        print("  [DRY RUN] Skipping document generation.\n")
        return

    # ── Step 5: Generate Documents ──
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if args.sequential:
        # ── Sequential mode (v2 compatibility) ──
        print(f"[5/6] Generating documents SEQUENTIALLY for {total_qualified} jobs...\n")
        print(f"  Per job: 9 doc types | API calls: ~{total_qualified * 9} | throttle: {THROTTLE_SEC}s\n")

        all_results = {
            "generated_at": datetime.now().isoformat(),
            "pipeline_version": "2.0",
            "config": {"days": args.days, "min_score": args.min_score, "model": GEMINI_MODEL},
            "summary": {"total_jobs": len(jobs), "qualified": total_qualified, "generated": 0, "errors": 0},
            "sources": {}
        }

        job_idx = 0
        for source in ["linkedin", "github", "linkedin_manual"]:
            source_data = {}
            for role, role_jobs in organized[source].items():
                if not role_jobs:
                    continue
                role_results = []
                for job in role_jobs:
                    job_idx += 1
                    title = job.get("title", "Unknown")
                    company = job.get("company", "Unknown")
                    score = get_job_score(job)
                    conns = get_connections(company)
                    conn_flag = " [conn]" if conns else ""

                    print(f"\n  --- [{job_idx}/{total_qualified}] {title[:50]} @ {company}{conn_flag} (score: {score})")

                    try:
                        doc = generate_docs_for_job(job, role, job_idx, total_qualified)
                        role_results.append(doc)
                        all_results["summary"]["generated"] += 1

                        safe_name = re.sub(r'[^\w\-]', '_', f"{company}_{title}")[:80]
                        job_dir = os.path.join(OUTPUT_DIR, source, role, safe_name)
                        _save_job_files(doc, job_dir)
                        print(f"  -> Saved to {job_dir}/")

                    except Exception as e:
                        print(f"  -> ERROR: {e}")
                        traceback.print_exc()
                        all_results["summary"]["errors"] += 1
                        role_results.append({
                            "title": title, "company": company, "score": score,
                            "error": str(e), "role_category": role
                        })

                if role_results:
                    source_data[role] = role_results

            if source_data:
                all_results["sources"][source] = source_data

        # Merge with existing output if dedup was used
        if existing_keys and os.path.exists(OUTPUT_FILE):
            try:
                with open(OUTPUT_FILE) as f:
                    prev = json.load(f)
                for source in all_results["sources"]:
                    if source not in prev.get("sources", {}):
                        prev.setdefault("sources", {})[source] = all_results["sources"][source]
                    else:
                        for role in all_results["sources"][source]:
                            if role not in prev["sources"][source]:
                                prev["sources"][source][role] = all_results["sources"][source][role]
                            else:
                                prev["sources"][source][role].extend(all_results["sources"][source][role])
                prev["generated_at"] = datetime.now().isoformat()
                prev["pipeline_version"] = "2.0"
                prev["summary"]["generated"] += all_results["summary"]["generated"]
                prev["summary"]["errors"] += all_results["summary"]["errors"]
                all_results = prev
            except Exception:
                pass

        with open(OUTPUT_FILE, "w") as f:
            json.dump(all_results, f, indent=2, default=str)

    else:
        # ── Concurrent mode (v3 — default) ──
        print(f"[5/6] Generating documents CONCURRENTLY for {total_qualified} jobs...\n")
        all_results = run_pipeline_concurrent(organized, total_qualified, args, existing_keys)

    elapsed = (datetime.now() - start_time).total_seconds()

    # ── Final Summary ──
    print(f"\n{'='*70}")
    print(f"  PIPELINE v2 COMPLETE")
    print(f"{'='*70}")
    print(f"  Generated: {all_results['summary']['generated']} / {total_qualified} jobs")
    print(f"  Errors:    {all_results['summary']['errors']}")
    print(f"  Time:      {elapsed:.0f}s ({elapsed/60:.1f} min)")
    print(f"  Output:    {OUTPUT_DIR}/")
    print(f"  Master:    {OUTPUT_FILE}")
    print(f"{'='*70}")

    # Per-source/role summary
    for source in ["linkedin", "github", "linkedin_manual"]:
        if source not in all_results["sources"]:
            continue
        source_total = sum(len(v) for v in all_results["sources"][source].values())
        print(f"\n  {source.upper()} ({source_total} jobs)")
        for role, docs in all_results["sources"][source].items():
            ok = sum(1 for d in docs if "error" not in d)
            err = sum(1 for d in docs if "error" in d)
            print(f"    {role}: {ok} generated, {err} errors")

    print(f"\n  Documents per job: resume.txt, resume.tex, cover_letter.txt, outreach.json,")
    print(f"                     follow_up.json, interview_prep.json, ats_audit.json,")
    print(f"                     multi_score.json, company_research.txt, metadata.json")
    print(f"  Structure: {OUTPUT_DIR}/[source]/[role]/[company_title]/\n")


if __name__ == "__main__":
    main()
