# InterviewCoach AI — Slides (make 6 slides only, use Google Slides or Canva)

> Dark theme. Minimal text. Big screenshots. Every slide should be readable in 3 seconds.

---

## Slide 1: TITLE (5 seconds)

**InterviewCoach AI**
*Your AI Interviewer. Real Feedback. 3D Experience.*

HackASU 2026 | Track 3: Economic Empowerment & Education
Team: [Your names]

[Background: screenshot of 3D interview scene]

---

## Slide 2: THE PROBLEM (10 seconds max)

**Interview coaching costs $200-500/session.**
**73% of candidates get no structured feedback before their real interview.**

[Two columns:]
Left: "Without InterviewCoach" — generic ChatGPT response, bullet points, no scoring
Right: "With InterviewCoach" — 3D scene, STAR scores, sentence analysis, spoken feedback

---

## Slide 3: HOW IT WORKS (15 seconds — 4 icons in a row)

1. **Upload Resume** → AI extracts your profile (Gemini multimodal)
2. **Research** → Scrapes Reddit, LeetCode, Glassdoor for real questions (TinyFish)
3. **3D Interview** → Voice-based mock interview with AI interviewer (Three.js + Speechmatics)
4. **STAR Feedback** → Sentence-level analysis + spoken feedback (Gemini + Claude Haiku)

---

## Slide 4: ARCHITECTURE (10 seconds — simple diagram)

```
┌─────────────┐     ┌──────────────────┐     ┌──────────────────────┐
│  TinyFish   │────>│  Gemini Flash    │     │  Claude Haiku        │
│  Web Scrape │     │  THE ANALYST     │     │  THE INTERVIEWER     │
│  5 sources  │     │                  │     │                      │
│             │     │  • STAR scoring  │────>│  • Spoken feedback   │
│             │     │  • Sentence      │     │  • Follow-up Qs      │
│             │     │    analysis      │     │  • Feedback Q&A      │
│             │     │  • Research      │     │  • Coaching plans    │
│             │     │  • Resume parse  │     │  • Adaptive Qs       │
└─────────────┘     └────────┬─────────┘     └──────────┬───────────┘
                             │                          │
                      ┌──────┴──────────────────────────┘
                      │
               ┌──────┴──────┐
               │  InsForge   │  Routes BOTH models
               │  PostgreSQL │  + pgvector embeddings
               └─────────────┘
```

**Sponsors: InsForge (DB + AI Gateway for Gemini & Claude), TinyFish (Web Scraping)**
**Also: Speechmatics (STT), Three.js (3D), Anthropic Claude Haiku**

---

## Slide 5: ETHICAL DESIGN (10 seconds)

- AI feedback supplements human mentorship, doesn't replace it
- No audio stored on servers — transcription is real-time only
- Designed to help candidates find their authentic voice, not memorize scripts
- Transparent scoring — users see exactly why they got each score

---

## Slide 6: IMPACT (5 seconds)

**Interview coaching shouldn't be a privilege.**

- Free for anyone with a browser + microphone
- Company-specific intelligence for 8+ companies
- Tracks improvement across sessions
- Built for first-gen students, career changers, and non-native speakers

GitHub: github.com/metalgenesis123321/CBC-Hackathon
Live: [your Vercel URL]

---

## Design Tips

- **Font**: Inter Bold for headings, Inter Regular for body. Nothing else.
- **Colors**: Background #0f1117, Accent #6c63ff (purple), Secondary #00d4aa (teal), Text #f8fafc
- **Screenshots**: Use ACTUAL screenshots from the app, not mockups
- **Slide count**: 6 slides MAX. More slides = less impact.
- **No bullet point slides**: If you have more than 3 bullets, you have too many words
