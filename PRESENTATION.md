# InterviewCoach AI — Presentation Slides

> Copy these into Google Slides / Canva / PowerPoint. Each `---` is a new slide.

---

## Slide 1: Title

**InterviewCoach AI**

*AI-Powered Mock Interview Platform with 3D Scene & STAR Feedback*

HackASU 2026 | Claude Builder Club
Track 3: Economic Empowerment & Education

---

## Slide 2: The Problem

**Interview prep is broken.**

- Mock interviews with friends → no structured feedback
- Professional coaching → $200-500/session
- Online question banks → no personalization, no practice speaking
- 73% of job seekers say interviews are their #1 anxiety source

**Talent is universal. Access to quality prep is not.**

---

## Slide 3: Our Solution

**InterviewCoach AI** — Free, AI-powered mock interview practice

- Immersive 3D interview office (Three.js)
- Voice-based: speak your answers naturally
- Real-time transcription (Speechmatics STT)
- STAR framework analysis (Situation, Task, Action, Result)
- Company-specific questions from real interview data
- Conversational AI feedback (Claude Haiku)
- Progress tracking across sessions

---

## Slide 4: How It Works

```
1. Upload Resume → AI extracts your profile
2. Pick Company + Role → Research real interview data
3. Enter 3D Interview → Answer questions by voice
4. Get STAR Feedback → Sentence-level analysis
5. Ask Follow-ups → Chat with your AI interviewer
6. Track Progress → See weak areas improve over time
```

---

## Slide 5: Live Demo

**[Insert YouTube video link or do live demo]**

Key moments to highlight:
- 3D interview scene with characters
- Voice recording + real-time transcription
- Word-by-word feedback highlighting
- Ask-about-feedback conversation
- History analysis view

---

## Slide 6: Technical Architecture

```
Frontend: Next.js 14 + Three.js + TypeScript
AI Analysis: Gemini 2.5 Flash (STAR scoring, questions)
AI Feedback: Claude Haiku (conversational humanization)
Voice STT: Speechmatics Real-time API
Voice TTS: Web Speech API
Database: InsForge PostgreSQL + pgvector
Auth: JWT + Google OAuth
Research: TinyFish browser automation (Reddit, LeetCode, Glassdoor)
```

---

## Slide 7: AI Pipeline (Claude Integration)

**Claude Haiku** powers the human-like interview feedback:

1. Gemini analyzes answer → structured STAR scores
2. Claude Haiku receives analysis → generates natural spoken feedback
3. "You mentioned leading the migration — that's great ownership. I'd love to hear more about how you measured the impact..."
4. Candidate can ask follow-up questions → Claude responds conversationally

**Why Claude?** Most natural conversational AI — feels like talking to a real interviewer, not reading a report.

---

## Slide 8: Impact & Ethics

**Who benefits:**
- First-generation college students with no network for mock interviews
- Career changers who can't afford coaching
- Non-native English speakers practicing delivery
- Anyone preparing for FAANG/top-tier interviews

**Ethical considerations:**
- AI feedback supplements, never replaces, human mentorship
- No candidate data sold or shared
- Transparent about AI limitations
- Encourages authentic answers, not scripted responses

---

## Slide 9: What's Next

- Mobile app (React Native)
- Video analysis (eye contact, body language)
- Peer matching for mock interview pairs
- Company partnership program (verified question banks)
- Multi-language support

---

## Slide 10: Thank You

**InterviewCoach AI**

GitHub: github.com/metalgenesis123321/CBC-Hackathon
Demo: [deployed Vercel link]

*Quality interview prep shouldn't be a privilege.*

HackASU 2026 | Claude Builder Club | Track 3

---

## Design Notes for Slides

- **Color scheme**: Dark theme (#0f1117 background, #6c63ff accent, #00d4aa secondary)
- **Font**: Inter or SF Pro for headings, monospace for code
- **Screenshots**: Include screenshots of 3D scene, feedback view, history analysis
- **Keep text minimal**: Use speaker notes for details, slides should be visual
- **Slide count**: 8-10 slides max for a 3-4 minute presentation
