# INTERVIEW COACH — FULL PROJECT CONTEXT TRANSFER

Use this file to bootstrap a new Claude session. Paste this entire file as your first message.

---

## PROJECT LOCATION
`/Users/PradeepReddy/Documents/claude_hackathon/interview-coach`

## TECH STACK
- **Framework**: Next.js 14 (App Router) + React 18 + TypeScript
- **Styling**: Tailwind CSS v3 (custom dark theme)
- **Auth**: JWT (jose) + bcryptjs + Google OAuth
- **AI**: Gemini 2.5 Flash Lite via InsForge Model Gateway + Claude Haiku (humanized feedback)
- **Database**: InsForge PostgreSQL 15 + pgvector
- **Voice**: Web Speech API (TTS) + Speechmatics Realtime API (STT) + MediaRecorder
- **3D**: Three.js (dynamic import, ssr: false)
- **File Parsing**: pdf-parse + jszip (resume extraction)
- **Web Scraping**: TinyFish Agent API (Reddit, LeetCode, Glassdoor, GFG)

---

## ALL SOURCE FILES

### Pages & Layout
- `src/app/page.tsx` — Main dashboard with tabs: "practice" | "progress" | "history" | "3d-interview". Session management, voice/text input, feedback display, progress tracking, 3D interview tab
- `src/app/layout.tsx` — Root layout wrapping AuthProvider
- `src/app/login/page.tsx` — Login/register with email/password + Google OAuth
- `src/app/onboarding/page.tsx` — 5-step setup wizard (profile, interview type, company, research, question gen)

### API Routes
- `src/app/api/auth/login/route.ts` — Email/password auth → JWT cookie
- `src/app/api/auth/register/route.ts` — User registration
- `src/app/api/auth/google/route.ts` — Google OAuth initiation
- `src/app/api/auth/google/callback/route.ts` — Google OAuth callback
- `src/app/api/auth/me/route.ts` — Get authenticated user
- `src/app/api/auth/profile/route.ts` — Update user profile
- `src/app/api/auth/logout/route.ts` — Clear auth cookie
- `src/app/api/feedback/route.ts` — Per-question STAR feedback + session summary (Gemini)
- `src/app/api/adaptive/route.ts` — Adaptive session generation + progress analysis
- `src/app/api/research/route.ts` — Scrape interview experiences (TinyFish → Reddit, LeetCode, Glassdoor, GFG)
- `src/app/api/parse-resume/route.ts` — Extract text from PDF/DOCX/TXT
- `src/app/api/parse-profile/route.ts` — AI-extract profile from resume text
- `src/app/api/db/route.ts` — PostgreSQL CRUD (sessions, answers, weak areas, stats)
- `src/app/api/vector/route.ts` — Vector similarity search (pgvector embeddings)
- `src/app/api/mock-feedback/route.ts` — 3D mock interview feedback: 3 actions (analyze_question, analyze_session, adaptive_questions). Gemini for deep analysis + Claude Haiku for humanized interviewer-style feedback. Falls back to Gemini if Haiku unavailable.
- `src/app/api/speechmatics/temp-key/route.ts` — Generate temporary Speechmatics API key (POST to `https://mp.speechmatics.com/v1/api_keys?type=rt`, 300s TTL)

### Components
- `src/components/VoiceRecorder.tsx` — Web Speech API voice input + MediaRecorder for audio playback
- `src/components/FeedbackCard.tsx` — Rich STAR feedback visualization with tabs, sentence analysis, delivery metrics
- `src/components/ProgressDashboard.tsx` — Score trends, weak area tracking, communication habits
- `src/components/InterviewArtifactScene.tsx` — **3D mock interview scene** (Three.js, ~1368 lines). Contains full interview flow: TTS question reading, Speechmatics STT recording, feedback system, DB storage, adaptive follow-up questions

### Library Files
- `src/lib/auth.ts` — JWT + bcryptjs auth, DB user functions (hashPassword, verifyPassword, createToken, verifyToken, findUserByEmail, createUserWithEmail, findOrCreateGoogleUser, getUserById, updateUserProfile)
- `src/lib/auth-context.tsx` — React Context for client auth state (AuthProvider, useAuth hook)
- `src/lib/db.ts` — InsForge PostgreSQL queries (dbSaveSession, dbGetSessions, dbSaveAnswer, dbGetAnswers, dbUpdateWeakAreas, dbGetWeakAreas, dbGetStats)
- `src/lib/store.ts` — localStorage persistence with interfaces (FeedbackResult, AnswerRecord, SessionRecord, WeakAreaProfile, UserProfile, LearningProfile)
- `src/lib/gemini.ts` — InsForge Model Gateway client (callGemini, extractJSON)
- `src/lib/prompts.ts` — All prompt templates (buildCandidateContext, buildFeedbackPrompt, buildSessionSummaryPrompt, buildAdaptiveQuestionPrompt, buildProgressAnalysisPrompt)
- `src/lib/questions.ts` — 15-question bank (10 behavioral, 5 technical) + WEAK_AREA_LABELS (15 competencies)
- `src/lib/company-patterns.ts` — Company-specific interview patterns (Amazon, Google, Meta, Microsoft, Apple, Netflix, Startup, General)
- `src/lib/cloud-sync.ts` — Dual-write wrapper: localStorage + PostgreSQL (cloudSaveSession, cloudSaveAnswer, cloudGetStats, cloudGetWeakAreas)
- `src/lib/speechmatics.ts` — Speechmatics Realtime STT client (WebSocket at `wss://eu.rt.speechmatics.com/v2`, pcm_f32le audio, temp key auth)

---

## DATABASE SCHEMA (PostgreSQL via InsForge)

### users
- `id` (text PK), `email` (text UNIQUE), `password_hash`, `google_id`, `name`, `avatar_url`, `background`, `target_role`, `target_company`, `experience`, `skills`, `resume_text`, `llm_context`, `target_roles` (text[]), `interview_type`, `country`, `onboarded` (boolean), `created_at`, `updated_at`

### sessions
- `id` (text PK), `user_id` (FK→users), `company`, `role`, `answer_count` (int), `avg_score` (int), `weak_areas` (text[]), `session_number` (int), `session_summary` (jsonb), `generated_questions` (jsonb), `interview_type`, `round_type`, `research_context` (jsonb), `session_config` (jsonb), `started_at`, `completed_at`

### answers
- `id` (text PK), `session_id` (FK→sessions), `user_id` (FK→users), `question_id`, `question_text`, `category`, `type`, `answer_text`, `transcript`, `feedback` (jsonb), `duration_sec` (int), `created_at`

### weak_areas
- `user_id` (FK), `area` (text), `total_occurrences` (int), `score_history` (int[]), `avg_score` (int), `trend` (text), `last_seen`

### embeddings (pgvector)
- `id`, `user_id`, `answer_id`, `embedding` (vector 3072-d)

---

## ENVIRONMENT VARIABLES (.env.local)
```
GEMINI_API_KEY=<for vector embeddings>
AI_MODEL=google/gemini-2.5-flash-lite
INSFORGE_PROJECT_URL=<InsForge backend URL>
INSFORGE_API_KEY=<InsForge API key>
INSFORGE_ANON_KEY=<Anonymous JWT>
INSFORGE_DB_URL=postgresql://postgres:password@<host>:<port>/insforge?sslmode=require
GOOGLE_CLIENT_ID=<Google OAuth>
GOOGLE_CLIENT_SECRET=<Google OAuth>
JWT_SECRET=interview-coach-jwt-secret-hackasu-2026
TINYFISH_API_KEY=<web scraper>
NEXT_PUBLIC_SPEECHMATICS_API_KEY=<Speechmatics STT>
```

---

## KEY ARCHITECTURE PATTERNS

1. **Dual Persistence**: localStorage (client) + PostgreSQL (cloud) — cloud-sync.ts handles both
2. **Adaptive Learning**: AI analyzes weak areas across sessions → generates targeted questions
3. **STAR + Dimensions**: Feedback covers STAR scores + relevance, depth, structure, communication, confidence, technical_accuracy
4. **Sentence-Level Analysis**: Every sentence rated with specific rewrites
5. **Company Intelligence**: 8 built-in company patterns affecting question gen and feedback
6. **Communication Tracking**: Filler words, hedging, active voice %, pacing across sessions
7. **15 Competencies Tracked**: situation_context, task_clarity, action_specificity, result_quantification, technical_depth, system_design, trade_offs, communication_clarity, conciseness, confidence, leadership_signals, customer_focus, data_driven, ownership, bias_for_action
8. **FK Constraint**: sessions row must exist BEFORE answers (FK on session_id). 3D mock uses `onInterviewStart` callback to create session first, with `sessionIdRef` (useRef) to avoid stale closures

---

## 3D MOCK INTERVIEW (InterviewArtifactScene.tsx) — DETAILED

### Types
```typescript
type InterviewMode = "intro" | "asking" | "recording" | "reviewing" | "feedback";

interface AnswerRecord3D {
  questionIndex: number; question: string; answer: string;
  audioUrl?: string; durationSec: number;
  analysis?: Record<string, any>; humanizedFeedback?: string;
}

interface Props {
  questions?: string[];
  onAnswerRecorded?: (questionIndex: number, answer: string, audioUrl?: string) => void;
  onSessionComplete?: (answers: AnswerRecord3D[], sessionAnalysis: Record<string, any>) => void;
  onInterviewStart?: () => void;
  companyName?: string;
  profile?: { name: string; background: string; targetRole: string; targetCompany: string; experience: string; skills: string; country?: string };
  userId?: string; sessionId?: string; role?: string;
}
```

### State Variables
- `currentQIdx`, `mode` (InterviewMode), `isRecording`, `recordingSeconds`, `transcript`
- `interviewerTalking`, `candidateTalking`, `bubbleText`, `activeSpeaker`, `showQuestionText`
- `allAnswers` (AnswerRecord3D[]), `feedbackLoading`, `feedbackData`, `feedbackMode`, `showFeedbackMenu`, `feedbackSpeaking`
- `adaptiveQs` (string[]), `allQuestions` (string[]), `followUpFlags` (boolean[]), `autoFeedbackDone`

### Key Functions
- `askQuestion(qIdx)` — TTS via SpeechSynthesis, word-by-word bubble update, transitions to "recording" mode on end
- `startRecording()` — getUserMedia + MediaRecorder + Speechmatics STT (with browser SpeechRecognition fallback)
- `stopRecording()` — Stops all recording, saves AnswerRecord3D, calls onAnswerRecorded callback
- `requestFeedback("single" | "session")` — Calls /api/mock-feedback, speaks humanized feedback via TTS, fetches adaptive follow-up questions
- `startInterview()` — Resets state, calls onInterviewStart (creates DB session), asks first question
- `nextQuestion()` — Advances to next question or triggers session analysis if done

### Interview Flow
1. Start → onInterviewStart (creates session in DB)
2. Question 1 → TTS asks → User records answer → Save to DB
3. Optional: Feedback button → "This Question" or "All Questions"
4. Follow-up question (adaptive, based on weak areas) → User answers
5. Question 2 → Follow-up → Question 3 (final)
6. Auto session analysis at end

### 3D Scene (CURRENT — needs rewrite)
- `buildChar(scene, isLeft)` — Primitive character with cylinder body, sphere head, box shoes, glasses+tie for interviewer
- `makeBubble(scene, side)` — Canvas-based 3D text bubbles
- Scene: dark background (0x1a1a2e), grid floor, wall, table with legs, microphone, two chairs
- Camera at (0, 2.8, 9) looking at (0, 1.8, 0) with drift animation
- Animations: mouth open/close, head bob/nod, side tilt, arm gesture, eye blink

### 3D Scene (PENDING REWRITE — user provided new code)
Replace with professional interview room:
- `buildPerson(skinColor, suitColor, hairColor)` — Box/sphere character with suit, collar, hands, sitting pose
- `buildChair()` — Office chair with armrests and metal legs
- `buildTable()` — Desk with laptop, notepad, pen, water glass
- `buildOffice(scene)` — Room with floor, walls, ceiling, window (emissive glass), ceiling light panel, bookshelf with books, potted plant, rug
- Professional lighting: DirectionalLight key (warm, shadows), fill (blue), rim, PointLight glow for active speaker
- HTML-based SpeechBubble component positioned via 3D-to-2D projection
- FeedbackPanel with ScoreRing SVG component
- Camera at (0, 2.55, 4.8)
- PCFSoftShadowMap, FogExp2

**IMPORTANT**: Keep ALL backend features (TTS, Speechmatics STT, feedback system, DB callbacks, adaptive questions, follow-up flags, all Props and state) — only replace the 3D visuals.

---

## page.tsx 3D MOCK WIRING

The main page.tsx wires the 3D mock component like this:
```tsx
const InterviewArtifactScene = dynamic(() => import("@/components/InterviewArtifactScene"), { ssr: false });

// Uses sessionIdRef to avoid stale closures
const sessionIdRef = useRef("");

// In the 3D tab:
<InterviewArtifactScene
  questions={sessionQuestions.map(q => q.text)}
  companyName={company}
  role={targetRole}
  profile={{ name, background, targetRole, targetCompany: company, experience, skills, country }}
  userId={user?.id}
  sessionId={sessionId}
  onInterviewStart={() => {
    // Creates session in DB BEFORE any answers are saved (FK constraint)
    const sid = `session_${Date.now()}`;
    setSessionId(sid);
    sessionIdRef.current = sid;
    cloudSaveSession({ id: sid, company, role: targetRole, ... });
  }}
  onAnswerRecorded={(qIdx, answer, audioUrl) => {
    // Saves answer to DB using sessionIdRef.current (not sessionId state)
    cloudSaveAnswer({ sessionId: sessionIdRef.current, ... });
  }}
  onSessionComplete={(answers, sessionAnalysis) => {
    // Saves session summary + weak areas to DB
    cloudSaveSession({ id: sessionIdRef.current, sessionSummary: sessionAnalysis, ... });
  }}
/>
```

---

## PENDING TASK

**Rewrite InterviewArtifactScene.tsx** with the new professional 3D scene:
- Replace `buildChar()` → `buildPerson()`, `buildChair()`, `buildTable()`, `buildOffice()`
- Replace canvas `makeBubble()` → HTML-positioned SpeechBubble components
- Update camera: `camera.position.set(0, 2.55, 4.8)`
- Add professional lighting (key + fill + rim + speaker glow PointLight)
- Add PCFSoftShadowMap, FogExp2
- Keep ALL: TTS/STT, recording, feedback system, DB callbacks, adaptive questions, follow-up flags, all Props and state

The user's exact words: "use these characters add light to this with sun, with professional interview room, and some details from this and use all the backend and features which are there now already in code, use this new code for characters and interview room"

---

## MOCK FEEDBACK API (src/app/api/mock-feedback/route.ts)

3 actions:
1. `analyze_question` — Gemini deep analysis (STAR scores, dimension scores, delivery analysis, weak areas, ideal answer outline, follow-up questions)
2. `analyze_session` — Full session analysis (session score, readiness rating/label, pattern analysis, per-question summary, hiring recommendation, next steps)
3. `adaptive_questions` — Generate follow-up questions targeting weak areas

Each uses: Gemini for analysis → Claude Haiku for humanization (with Gemini fallback)

```typescript
async function callClaudeHaiku(prompt: string): Promise<string> {
  const res = await fetch(`${INSFORGE_URL}/api/ai/chat/completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${INSFORGE_KEY}` },
    body: JSON.stringify({ model: "anthropic/claude-haiku", messages: [{ role: "user", content: prompt }], max_tokens: 4096, temperature: 0.8 }),
  });
  if (!res.ok) { return callGemini(prompt); } // fallback
  const data = await res.json();
  return data.text || "";
}
```

---

## TAILWIND THEME COLORS
- bg: #0f1117, surface: #1a1d27, card: #21253a, border: #2e3350
- accent: #6c63ff (purple), accent2: #00d4aa (teal)
- warn: #f59e0b, danger: #ef4444, muted: #8892a4

---

## PACKAGE.JSON DEPENDENCIES
```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.80.0",
    "@types/node": "^25.5.0", "@types/react": "^19.2.14", "@types/react-dom": "^19.2.3", "@types/three": "^0.183.1",
    "autoprefixer": "^10.4.27", "bcryptjs": "^3.0.3", "jose": "^6.2.2", "jszip": "^3.10.1",
    "next": "^14.2.35", "pdf-parse": "^1.1.1", "pg": "^8.20.0", "postcss": "^8.5.8",
    "react": "^18.3.1", "react-dom": "^18.3.1", "tailwindcss": "^3.4.19", "three": "^0.183.2", "typescript": "^5.9.3"
  },
  "devDependencies": { "@types/bcryptjs": "^2.4.6", "@types/pg": "^8.20.0" }
}
```
