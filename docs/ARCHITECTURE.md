# Architecture Overview

## System Architecture

```
+------------------------------------------------------------------+
|                        BROWSER (Client)                          |
|                                                                  |
|  +------------------+  +----------------+  +-----------------+   |
|  |   Login Page     |  | Onboarding     |  | Practice        |   |
|  |   /login         |  | Wizard         |  | Dashboard       |   |
|  |                  |  | /onboarding    |  | / (main page)   |   |
|  | - Email/Pass     |  |                |  |                 |   |
|  | - Google OAuth   |  | Step 1: Profile|  | Tab: Practice   |   |
|  +------------------+  | Step 2: Type   |  | Tab: Progress   |   |
|                        | Step 3: Company |  | Tab: History    |   |
|                        | Step 4: Research|  |                 |   |
|                        | Step 5: Qs     |  | - VoiceRecorder |   |
|                        +----------------+  | - FeedbackCard  |   |
|                                            | - ProgressDash  |   |
|  +-------------------------------------------+--------------+   |
|  |                  AuthProvider (React Context)              |   |
|  |  user state | login() | register() | logout() | refresh() |   |
|  +------------------------------------------------------------+  |
|                                                                  |
|  +----------------------------+  +----------------------------+  |
|  |    localStorage (store.ts) |  |  Cloud Sync (cloud-sync.ts)|  |
|  |    Primary data store      |  |  Async dual-write to DB    |  |
|  +----------------------------+  +----------------------------+  |
+------------------------------------------------------------------+
                              |
                         HTTPS / API
                              |
+------------------------------------------------------------------+
|                     NEXT.JS API ROUTES                           |
|                                                                  |
|  Auth Layer (lib/auth.ts)                                        |
|  +------------------------------------------------------------+ |
|  | JWT (jose) | bcryptjs | httpOnly cookies | getAuthFromReq() | |
|  +------------------------------------------------------------+ |
|                                                                  |
|  +------------------+  +------------------+  +----------------+  |
|  | /api/auth/*      |  | /api/feedback    |  | /api/adaptive  |  |
|  | register, login  |  | Per-Q feedback   |  | Session gen    |  |
|  | google, me       |  | Session summary  |  | Progress       |  |
|  | profile, logout  |  +------------------+  +----------------+  |
|  +------------------+                                            |
|                                                                  |
|  +------------------+  +------------------+  +----------------+  |
|  | /api/research    |  | /api/parse-resume|  | /api/vector    |  |
|  | Interview intel  |  | PDF/DOCX/TXT     |  | Similarity     |  |
|  | from web sources |  | text extraction  |  | search         |  |
|  +------------------+  +------------------+  +----------------+  |
|                                                                  |
|  Shared Libraries:                                               |
|  +------------------------------------------------------------+ |
|  | gemini.ts    | prompts.ts | questions.ts | company-patterns | |
|  | AI client    | Templates  | Q bank       | 8 company intel  | |
|  +------------------------------------------------------------+ |
+------------------------------------------------------------------+
                    |                           |
                    v                           v
+---------------------------+   +---------------------------+
|   InsForge Model Gateway  |   |   InsForge PostgreSQL 15  |
|                           |   |                           |
|   POST /api/ai/chat/      |   |   Schema: public          |
|        completion         |   |                           |
|                           |   |   +-------+ +----------+ |
|   Model:                  |   |   | users | | sessions | |
|   google/gemini-2.5-      |   |   +-------+ +----------+ |
|   flash-lite              |   |   +---------+ +--------+ |
|                           |   |   | answers | | weak   | |
|   $0.10/M input tokens    |   |   +---------+ | areas  | |
|   $0.40/M output tokens   |   |               +--------+ |
+---------------------------+   |                           |
                                |   pgvector extension:     |
                                |   +--------------------+  |
                                |   | question_embeddings|  |
                                |   | answer_embeddings  |  |
                                |   | ideal_answers      |  |
                                |   +--------------------+  |
                                +---------------------------+
```

## Authentication Flow

```
                    +-------------------+
                    |   User visits /   |
                    +--------+----------+
                             |
                    +--------v----------+
                    | AuthProvider checks|
                    | /api/auth/me      |
                    +--------+----------+
                             |
                   +---------+---------+
                   |                   |
              Not authed          Authenticated
                   |                   |
          +--------v--------+    +-----v-----+
          | Redirect /login |    | onboarded?|
          +--------+--------+    +-----+-----+
                   |                   |
          +--------v--------+    +----+----+
          | Email/Pass  OR  |    No      Yes
          | Google OAuth    |    |         |
          +--------+--------+  +-v------+ |
                   |           |/onboard| |
          +--------v--------+ +--------+ |
          | Server creates  |            |
          | JWT (7 day)     |      +-----v-----+
          | Sets httpOnly   |      | Dashboard |
          | cookie          |      | /         |
          +-----------------+      +-----------+
```

## AI Feedback Pipeline

```
User answers question (voice/text)
        |
        v
POST /api/feedback
        |
        v
buildFeedbackPrompt() -----> Company context (company-patterns.ts)
        |                     Candidate profile
        |                     Previous attempts
        v
callGemini(prompt) ----------> InsForge Gateway
        |                      POST /api/ai/chat/completion
        |                      Model: google/gemini-2.5-flash-lite
        v
extractJSON(response)
        |
        v
FeedbackResult {
  overall_score: 78,
  star_scores: { S: 70, T: 80, A: 85, R: 60 },
  dimension_scores: { clarity, confidence, conciseness, storytelling, technical },
  sentence_analysis: [{ sentence, rating, reason, rewrite, tags }],
  delivery_analysis: { fillers, hedging, power_words, active_voice%, pacing },
  strengths: [...],
  improvements: [...],
  coaching_tip: "...",
  follow_up_question: "...",
  weak_areas: [...]
}
        |
        v
+--- Display in FeedbackCard component
|    (score rings, STAR bars, sentence highlights, delivery stats)
|
+--- Save to localStorage (store.ts)
|
+--- Sync to InsForge PostgreSQL (cloud-sync.ts)
|
+--- Embed answer in vector DB (fire-and-forget)
```

## Adaptive Question Generation

```
User's weak areas (from past sessions)
+ User profile (role, company, skills)
+ Completed questions (avoid repeats)
+ Communication habits (fillers, hedging, pacing)
        |
        v
POST /api/adaptive { action: "generate_session" }
        |
        v
buildAdaptiveQuestionPrompt()
        |
        v
InsForge Gateway (Gemini 2.5 Flash Lite)
        |
        v
SessionPlan {
  session_plan: {
    focus_message: "This session targets your weak Result Quantification...",
    primary_weakness: "result_quantification",
    expected_improvement: "..."
  },
  questions: [
    {
      id, text, type, category,
      targets_weakness: ["result_quantification"],
      difficulty: "medium",
      hint: "...",
      company_context: "Amazon LP: Deliver Results",
      time_target_sec: 120
    }
  ]
}
```

## Data Persistence (Dual-Write)

```
User action (answer question, complete session)
        |
        +---> localStorage (immediate, offline-capable)
        |     store.ts: recordAnswer(), recordSession()
        |
        +---> InsForge PostgreSQL (async, cloud backup)
              cloud-sync.ts: cloudSaveAnswer(), cloudSaveSession()
              -> POST /api/db { action: "save_answer" }
              -> db.ts: dbSaveAnswer(), dbUpdateWeakAreas()
```

## Vector Search Architecture

```
Question/Answer Embedding Flow:
        |
        v
POST /api/vector { action: "embed_answer" }
        |
        v
Gemini Embedding API (gemini-embedding-001)
  -> 3072-dimensional vector
        |
        v
INSERT INTO answer_embeddings (embedding vector(3072))
        |
        v
Similarity Search:
  SELECT *, 1 - (embedding <=> query_embedding) AS similarity
  FROM question_embeddings
  ORDER BY embedding <=> query_embedding
  LIMIT 5
```

## Onboarding Flow Detail

```
Step 1: Profile
  - Upload resume (PDF/DOCX/TXT) -> /api/parse-resume -> text
  - Paste resume text manually
  - Paste LLM-generated context
  - Auto-fill via /api/parse-profile (AI extracts name, skills, etc.)
  - Manual fields: name, background, experience, skills
  - Multi-select target roles

Step 2: Interview Type
  - Behavioral (STAR stories, leadership)
  - Technical (coding, algorithms)
  - System Design (architecture, scalability)
  - Mixed (recommended)

Step 3: Company & Role
  - Company presets (Google, Amazon, Meta, etc.) or custom
  - Years of experience (0-2, 2-5, 5-10, 10+)
  - Round type (Phone Screen, Technical, System Design, etc.)
  - Key skills for the role
  - Job description (optional, for tailored questions)

Step 4: Internet Research
  - AI searches Reddit, LeetCode, Glassdoor, GFG
  - Returns: interview format, common questions, difficulty, tips
  - Displayed as cards with sources

Step 5: Generated Questions
  - 5 personalized questions based on:
    - User profile
    - Company interview patterns
    - Research results
    - Interview type
    - Job description
  - Each question tagged with type, category, difficulty
  - "Start Practicing" saves config and redirects to /
```
