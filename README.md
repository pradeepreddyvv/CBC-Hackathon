# InterviewCoach AI

**AI-Powered Mock Interview Platform with 3D Scene & Structured STAR Feedback**

> HackASU 2026 — Claude Builder Club | Track 3: Economic Empowerment & Education

---

## What It Does

InterviewCoach helps job seekers practice interviews with AI in an immersive 3D office environment. Upload your resume, pick a target company, and the system generates personalized questions based on real interview data scraped from Reddit, LeetCode, Glassdoor, and GeeksForGeeks. Answer via voice, get real-time transcription, and receive deeply structured STAR-framework feedback with sentence-level analysis — all tracked over time so you can see exactly where you're improving.

### Key Features

- **3D Mock Interview Scene** — Three.js office with interviewer & candidate characters, speech bubbles via 3D→2D projection, speaker glow lighting
- **Voice Pipeline** — Speechmatics real-time STT for transcription, Web Speech API for TTS feedback delivery
- **Resume Upload & Auto-Fill** — Upload PDF/DOCX/TXT, Gemini multimodal API extracts text and fills your profile
- **Internet Research** — Searches Reddit, LeetCode, Glassdoor, GFG for real interview experiences at your target company
- **Personalized Question Generation** — AI generates questions based on your profile, company, and research data
- **STAR Framework Scoring** — Situation, Task, Action, Result scored individually (0-100)
- **Sentence-Level Analysis** — Every sentence rated as strong/okay/weak with rewrites
- **Delivery Analysis** — Filler words, hedging phrases, power words, active voice %, pacing
- **Follow-Up Questions** — AI generates contextual follow-ups based on your answers
- **Adaptive Sessions** — Targets your weak areas with progressively harder questions
- **Company-Specific Intelligence** — Built-in profiles for Amazon (LPs), Google, Meta, Microsoft, Apple, Netflix
- **Full Analysis in History** — Complete per-question analysis (STAR scores, sentence analysis, delivery, coaching tips, ideal answer) stored in DB and retrievable from History tab
- **Progress Tracking** — Score trends, weak area tracking with improving/stable/declining trends
- **Light/Dark Theme** — Toggle between light and dark themes with CSS custom properties & localStorage persistence
- **Cloud Persistence** — All data synced to InsForge PostgreSQL
- **Google OAuth** — Auto-detecting redirect URIs for localhost + Vercel production

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js)                    │
│                                                          │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────┐  │
│  │ Login /  │  │  Dashboard   │  │  3D Interview     │  │
│  │ Onboard  │  │  + History   │  │  Scene (Three.js) │  │
│  └────┬─────┘  └──────┬───────┘  └────────┬──────────┘  │
│       │               │                    │             │
│       │    ┌──────────────────────┐        │             │
│       │    │ Speech Pipeline      │        │             │
│       │    │ STT: Speechmatics RT │        │             │
│       │    │ TTS: Web Speech API  │        │             │
│       │    └──────────────────────┘        │             │
└───────┼───────────┼───────────────────────┼─────────────┘
        │           │                       │
        ▼           ▼                       ▼
┌─────────────────────────────────────────────────────────┐
│                   API ROUTES (Next.js)                   │
│                                                          │
│  /api/auth/google/*     Google OAuth (auto-detect host)  │
│  /api/parse-resume      PDF→text via Gemini multimodal   │
│  /api/generate-questions Gemini: role+resume→questions   │
│  /api/analyze-answer    Gemini: STAR analysis + scoring  │
│  /api/cloud-*           DB CRUD (sessions, answers,      │
│                         weak areas, embeddings)          │
│  /api/match-question    Semantic similarity search       │
└──────────────┬──────────────────────────┬───────────────┘
               │                          │
               ▼                          ▼
┌──────────────────────┐   ┌──────────────────────────────┐
│   InsForge Gateway   │   │   InsForge PostgreSQL DB     │
│   (Gemini API proxy) │   │                              │
│                      │   │  users, sessions, answers    │
│  Models:             │   │  weak_areas,                 │
│  gemini-2.5-flash    │   │  question/answer/ideal       │
│                      │   │  _embeddings                 │
└──────────────────────┘   └──────────────────────────────┘
```

### Data Flow

```
User registers/logs in (Email/Password or Google OAuth)
        |
        v
Onboarding Wizard (5 steps)
  1. Profile (name, resume upload, skills, target roles)
  2. Interview Type (behavioral / technical / system design / mixed)
  3. Company & Role (company, years exp, round type, JD)
  4. Internet Research (AI searches Reddit/LeetCode/Glassdoor/GFG)
  5. Question Generation (5 personalized questions)
        |
        v
Interview Session
  - Display question (text + TTS voice)
  - Record answer (Speechmatics real-time STT)
  - AI generates structured STAR feedback
  - 3D scene shows interviewer/candidate with speech bubbles
  - Full analysis saved to DB per question
  - Session summary with readiness score
        |
        v
Progress Dashboard
  - Score trends over time
  - Weak area tracking (15 competencies)
  - Communication habits analysis
  - Cross-session AI analysis
        |
        v
History Tab
  - Per-question full analysis retrieval
  - STAR scores, sentence analysis, delivery metrics
  - Coaching tips, ideal answer structure
  - Weak area trends (improving/stable/declining)
```

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | Next.js 14 (App Router) | React framework with SSR |
| **3D Scene** | Three.js | Immersive interview office environment |
| **Styling** | Tailwind CSS v3 | Light/dark theme UI with custom animations |
| **Language** | TypeScript | Type safety |
| **AI Gateway** | InsForge Model Gateway | Unified AI model routing |
| **AI Model** | Gemini 2.5 Flash Lite | Question generation, STAR analysis, research |
| **AI Model** | Claude Haiku (Anthropic) | Humanized conversational interview feedback |
| **Database** | InsForge PostgreSQL 15 | Users, sessions, answers, weak areas |
| **Vector DB** | pgvector on PostgreSQL | Semantic question search (3072d embeddings) |
| **Auth** | JWT (jose) + bcryptjs | Email/password + Google OAuth |
| **Voice STT** | Speechmatics Realtime API | Real-time speech-to-text transcription |
| **Voice TTS** | Web Speech API | Browser-native text-to-speech |
| **PDF Parsing** | Gemini Multimodal API | Resume PDF text extraction (serverless-compatible) |
| **DOCX Parsing** | jszip | Resume DOCX extraction |

### Hackathon Sponsor Integrations

- **InsForge** — PostgreSQL database, AI Model Gateway, vector database (pgvector)

---

## Project Structure

```
src/
├── app/
│   ├── api/
│   │   ├── auth/           # Auth endpoints (login, register, Google OAuth, me, logout, profile)
│   │   ├── adaptive/       # AI session generation & progress analysis
│   │   ├── db/             # PostgreSQL database operations
│   │   ├── feedback/       # Per-question STAR feedback + session summary
│   │   ├── parse-profile/  # AI profile extraction from resume/context
│   │   ├── parse-resume/   # PDF (Gemini multimodal) / DOCX / TXT parsing
│   │   ├── research/       # Company interview research via AI
│   │   ├── cloud-save-answer/ # Save individual answer with full analysis to DB
│   │   ├── cloud-save-session/ # Save session summary to DB
│   │   └── vector/         # Vector similarity search (pgvector)
│   ├── login/              # Login/register page
│   ├── onboarding/         # 5-step setup wizard
│   ├── page.tsx            # Main interview dashboard (Interview, 3D Mock, Progress, History tabs)
│   ├── layout.tsx          # Root layout with AuthProvider + theme script
│   └── globals.css         # Tailwind + custom animations + light/dark theme variables
├── components/
│   ├── InterviewArtifactScene.tsx  # 3D Three.js interview scene (office, characters, speech bubbles)
│   ├── VoiceRecorder.tsx   # Voice input with Speechmatics real-time STT
│   ├── FeedbackCard.tsx    # Rich feedback visualization
│   └── ProgressDashboard.tsx # Stats, trends, weak areas
└── lib/
    ├── auth.ts             # JWT, password hashing, DB auth functions
    ├── auth-context.tsx    # React Context for client-side auth state
    ├── db.ts               # PostgreSQL queries (users, sessions, answers, weak_areas)
    ├── store.ts            # localStorage persistence layer
    ├── gemini.ts           # InsForge AI gateway client
    ├── prompts.ts          # All prompt templates (feedback, summary, adaptive, progress)
    ├── questions.ts        # 15-question bank + weak area taxonomy
    ├── company-patterns.ts # Company-specific interview intelligence (8 companies)
    └── cloud-sync.ts       # Client-side cloud sync wrapper
```

---

## Database Schema

### users
| Column | Type | Description |
|--------|------|-------------|
| id | text (UUID) | Primary key |
| email | text | Unique, lowercase |
| password_hash | text | bcrypt hash |
| google_id | text | Google OAuth ID |
| name | text | Display name |
| avatar_url | text | Profile picture |
| background | text | Career summary |
| target_role | text | Primary target role |
| target_company | text | Target company |
| experience | text | Work history |
| skills | text | Comma-separated skills |
| resume_text | text | Full resume content |
| llm_context | text | AI-generated context |
| target_roles | text[] | Multiple target roles |
| interview_type | text | behavioral/technical/system_design/mixed |
| onboarded | boolean | Completed setup |

### sessions
| Column | Type | Description |
|--------|------|-------------|
| id | text | Session ID |
| user_id | text | Foreign key to users |
| company | text | Company practiced for |
| role | text | Role practiced for |
| answer_count | int | Questions answered |
| avg_score | int | Average score |
| weak_areas | text[] | Areas identified |
| session_number | int | Sequential number |
| session_summary | jsonb | AI-generated summary |

### answers
| Column | Type | Description |
|--------|------|-------------|
| id | text | Answer ID |
| session_id | text | Foreign key to sessions |
| user_id | text | Foreign key to users |
| question_text | text | The question asked |
| answer_text | text | User's full answer |
| feedback | jsonb | Complete analysis (STAR scores, sentence analysis, delivery, coaching) |
| duration_sec | int | Answer duration |

### weak_areas
| Column | Type | Description |
|--------|------|-------------|
| user_id | text | Foreign key to users |
| area | text | Competency area |
| total_occurrences | int | Times flagged |
| score_history | int[] | Score progression |
| avg_score | int | Current average |
| trend | text | improving/stable/declining |

---

## AI Feedback Structure

Each answer receives a deeply structured `FeedbackResult`:

```json
{
  "overall_score": 78,
  "star_scores": { "situation": 70, "task": 80, "action": 85, "result": 60 },
  "dimension_scores": { "clarity": 80, "confidence": 75, "conciseness": 70, "storytelling": 85, "technical_accuracy": 90 },
  "sentence_analysis": [
    { "sentence": "...", "rating": "strong", "reason": "...", "rewrite": "...", "tags": ["quantified", "ownership"] }
  ],
  "delivery_analysis": {
    "filler_words": ["um", "like"],
    "hedging_phrases": ["I think"],
    "power_words": ["spearheaded", "delivered"],
    "active_voice_pct": 85,
    "pacing": "good"
  },
  "strengths": ["Clear ownership language", "Quantified results"],
  "improvements": ["Add more context to the Situation"],
  "coaching_tip": "Lead with the business impact before the technical details",
  "follow_up_question": "Can you elaborate on the technical challenges you faced?",
  "ideal_answer_structure": { "situation": "...", "task": "...", "action": "...", "result": "..." },
  "weak_areas": ["situation_context", "result_quantification"]
}
```

### 15 Tracked Competencies

| Area | Description |
|------|-------------|
| situation_context | Setting clear context |
| task_clarity | Defining your specific task |
| action_specificity | Detailing what YOU did |
| result_quantification | Quantifying outcomes |
| technical_depth | Technical knowledge depth |
| system_design | Architecture thinking |
| trade_offs | Analyzing trade-offs |
| communication_clarity | Clear communication |
| conciseness | Being concise |
| confidence | Speaking with confidence |
| leadership_signals | Leadership evidence |
| customer_focus | Customer-centric thinking |
| data_driven | Using data to decide |
| ownership | Taking ownership |
| bias_for_action | Showing initiative |

---

## 3D Interview Scene

The 3D mock interview uses Three.js to render an immersive office environment:

- **Office** — Dark-themed room with bookshelf, plant, window with emissive glass, ceiling light panel, rug
- **Characters** — Box-based interviewer and candidate with MeshLambertMaterial, suits, collars, sitting pose
- **Furniture** — Table with laptop, notepad, pen, water glass; ergonomic chairs
- **Lighting** — Ambient + directional key/fill/rim lights, PCFSoftShadowMap, FogExp2
- **Speech Bubbles** — HTML overlays positioned via 3D-to-2D head projection (getWorldPosition → project → screen coords)
- **Speaker Glow** — PointLight that follows the active speaker
- **Camera** — Positioned at (0, 2.55, 4.8) with subtle breathing animation

---

## Company Intelligence

Built-in interview profiles for 8 companies:

| Company | Focus | Behavioral Weight |
|---------|-------|-------------------|
| Amazon | 16 Leadership Principles, ownership, metrics | 50% |
| Google | Googliness, cognitive ability, structured | 30% |
| Meta | Impact, scale, move fast, builder mindset | 35% |
| Microsoft | Growth mindset, collaboration, inclusivity | 40% |
| Apple | Craftsmanship, attention to detail | 35% |
| Netflix | Freedom & responsibility, candid feedback | 40% |
| Startup | Ship fast, full-stack, resourcefulness | 30% |
| General | STAR framework, problem-solving | 40% |

---

## Setup & Run

### Prerequisites
- Node.js 18+
- InsForge account with PostgreSQL + Model Gateway enabled

### Installation

```bash
git clone https://github.com/metalgenesis123321/CBC-Hackathon.git
cd interview-coach
npm install
```

### Environment Variables

Create `.env.local`:

```env
# AI Model (via InsForge Gateway)
AI_MODEL=google/gemini-2.5-flash-lite

# Gemini API Key (for vector embeddings only)
GEMINI_API_KEY=your_gemini_api_key

# InsForge Backend
INSFORGE_PROJECT_URL=https://your-project.us-east.insforge.app
INSFORGE_API_KEY=your_insforge_api_key
INSFORGE_ANON_KEY=your_anon_key
INSFORGE_DB_URL=postgresql://postgres:password@your-project.us-east.database.insforge.app:5432/insforge?sslmode=require

# Google OAuth
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret

# Auth
JWT_SECRET=your_jwt_secret

# Speechmatics (for real-time STT)
SPEECHMATICS_API_KEY=your_speechmatics_api_key
```

### Run Locally

```bash
npm run dev
# Open http://localhost:3000
```

### Deploy to Vercel

```bash
vercel --prod
```

Import the GitHub repo in Vercel, add all environment variables above, and ensure the Google Cloud Console has your Vercel domain added as an authorized OAuth redirect URI (`https://your-domain.vercel.app/api/auth/google/callback`).

### Build

```bash
npm run build
npm start
```

---

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/register` | Register with email/password |
| POST | `/api/auth/login` | Login with email/password |
| GET | `/api/auth/google` | Initiate Google OAuth (auto-detects redirect URI) |
| GET | `/api/auth/google/callback` | Google OAuth callback (auto-detects origin) |
| GET | `/api/auth/me` | Get current authenticated user |
| POST | `/api/auth/profile` | Update user profile |
| POST | `/api/auth/logout` | Clear auth cookie |

### AI & Interview
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/feedback` | Get STAR feedback for an answer |
| POST | `/api/adaptive` | Generate adaptive session or analyze progress |
| POST | `/api/research` | Search interview experiences online |
| POST | `/api/parse-resume` | Extract text from PDF (Gemini multimodal) / DOCX / TXT |
| POST | `/api/parse-profile` | AI-extract profile from resume text |

### Data
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/db` | Database operations (sessions, answers, stats) |
| POST | `/api/cloud-save-answer` | Save answer with full analysis to DB |
| POST | `/api/cloud-save-session` | Save session summary to DB |
| POST | `/api/vector` | Vector similarity search operations |

---

## Team

Built for HackASU 2026 Claude Builder Club Hackathon

**Track:** Economic Empowerment & Education

---

## License

MIT
