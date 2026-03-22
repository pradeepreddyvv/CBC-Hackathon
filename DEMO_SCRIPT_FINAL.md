# InterviewCoach AI — FINAL Demo Script (2:30)

> This is a SHOT LIST, not a speech. Record 3-5 clips and edit together.

---

## PRE-RECORDING SETUP (do this BEFORE you hit record)

- [ ] App running on Vercel or localhost
- [ ] Already logged in, profile filled, questions generated
- [ ] AppNav visible at top — tabs: Practice, 3D Mock, Progress, History
- [ ] 3D Mock Interview tab open and ready
- [ ] Browser at 100% zoom, fullscreen, dark mode (toggle in AppNav)
- [ ] Mic permissions granted, test TTS works
- [ ] Practice your "bad answer" once (say "um" twice, skip the Result in STAR)
- [ ] Phone/webcam ready for face shots (good lighting, clean background)

---

## CLIP 1: FACE + HOOK (0:00–0:12)

**Setup:** Camera on your face. Clean background. Look into the lens.

**Say (naturally, not reading):**
> "I watched my friend prepare for her Amazon interview with nothing but a Google Doc. She knew the answers — she just froze because she'd never said them out loud. So I built an AI that interviews you."

**Cut to:** Screen recording of 3D scene (characters sitting at interview table)

**Total: 12 seconds. No intro. No "hi my name is." Story → product.**

---

## CLIP 2: THE 3D INTERVIEW (0:12–1:30) — ONE CONTINUOUS TAKE

This is 80% of your demo. Practice it twice, then record.

### Shot 2a: Start + Question (0:12–0:30)

**SCREEN:** 3D Mock Interview tab — full-width 3D scene on the left, dark interview office with table, two chairs, ambient lighting. Two characters sit across from each other at the table. Interviewer (left, glasses + tie) faces candidate (right). Controls bar at bottom with "Start Interview (5 Questions)" button. Ethics notice text visible at bottom: "AI-generated feedback — not a substitute for human mentorship."

**[Click "Start Interview (5 Questions)."]**

> "3D interview office, built with Three.js. Two characters sitting at a table — the interviewer has glasses and a tie, even does hand gestures while talking. Questions are scraped from Reddit and Glassdoor by TinyFish."

**SCREEN:** Interviewer character's mouth animates open/close. Right hand rises in periodic gesture (sinusoidal). Speech bubble appears above interviewer's head showing the question text. Question counter shows "Q1 / 5" in top area.

**[TTS plays the question. LET IT PLAY for 5 seconds — don't talk over the first question, let judges hear the TTS voice and see the character's mouth moving and hands gesturing.]**

> "Now I answer with my voice — Speechmatics transcribes in real-time."

### Shot 2b: Your Answer (0:30–0:45)

**SCREEN:** Controls bar now shows green "Start Recording Your Answer" button with gradient glow. Question text visible in the overlay panel at bottom center with "Q:" prefix.

**[Click "Start Recording Your Answer." Give a DELIBERATELY BAD 10-second answer:]**

Example bad answer:
> "Um, so at my last job I was working on this project where we had to, like, migrate some stuff to the cloud. I worked with the team and um, we got it done. It went pretty well I think."

**SCREEN:** Recording indicator appears — red pulsing dot + timer counting up (00:05, 00:06...). Live transcript streams in below the question. Word count updates in real-time ("23 words"). Candidate character's mouth animates and hands gesture periodically. Speech bubble appears above candidate showing recent words. "Stop Recording" button pulses red.

**[Stop recording. Transcript appears in the review panel.]**

**SCREEN:** Review mode — bottom overlay shows "Your Answer:" label in purple, full transcript text below it. Two buttons: "Feedback" dropdown and "Next Question". The transcript is scrollable if long.

> "Let's see what the AI thinks of that."

### Shot 2c: Feedback (0:45–1:15)

**[Click "Feedback" → "This Question"]**

**SCREEN:** Feedback dropdown opens showing two options: "This Question" and "Full Session". Click "This Question".

**[PAUSE — let the loading happen. Talk over it:]**

**SCREEN:** Right sidebar slides in (350px wide, dark glass background). Loading state shows: "Analyzing your answer..." with pulsing yellow text. Below it: "Gemini is analyzing, then Claude will humanize the feedback".

> "Gemini scores the STAR structure. Claude Haiku — the interviewer's brain — turns that into spoken, natural feedback."

**SCREEN:** Sidebar populates with feedback. Top section: yellow-bordered "INTERVIEWER SAYS (speaking...):" block — words highlight one by one in sync with TTS (current word: bold + yellow background, spoken words: white, unspoken: dim gray). Interviewer character's mouth animates, right hand rises in periodic gestures. Speech bubble above interviewer shows 8-word chunks of the feedback.

**[LET THE TTS PLAY for 5-7 seconds. Don't talk. Let judges hear Claude's feedback voice and see the interviewer's animated gestures + word highlighting. This is your most visually impressive moment.]**

**SCREEN:** Below the spoken feedback: purple "Replay Your Answer" button with play icon (shows "45s · 128 words"), then score ring (large circular gauge showing "52" in the center, color-coded). Badges for "Readiness" and "Hiring Recommendation" next to it.

**[Then point at sidebar:]**
> "52 out of 100. It caught my filler words, flagged that I didn't quantify results, and rated every STAR dimension."

**SCREEN:** Scroll down the sidebar — STAR dimension bars (Situation, Task, Action, Result — each with colored progress bar + score). Then "Strengths" section (green bullets) and "Areas to Improve" (yellow bullets). Then "Coaching Plan" section with "Powered by Claude" badge — specific rewrite examples and improvement steps.

**[Scroll sidebar quickly — STAR scores → strengths vs. improvements → coaching plan with "Powered by Claude" badge]**

### Shot 2d: Ask About Feedback (1:15–1:30)

> "And I can have a conversation about the feedback — by typing or using my voice."

**SCREEN:** Bottom of sidebar shows "Ask about this feedback" text input with a microphone button (🎤) next to it. Cursor in the text field.

**[Click the mic button (🎤), say: "How should I improve my answer structure?" — OR type it. Show Claude's response + tip appearing. Interviewer character speaks the response.]**

**SCREEN:** Claude's response appears in the Q&A section below — user question in blue, Claude's answer in white with a "Tip:" callout box. Interviewer character speaks the response with mouth animation and gestures. Word highlighting activates again in the sidebar.

**[If coaching plan is visible, point at it:]**
> "Claude generates a personalized coaching plan with specific examples of how to fix my weakest answer."

---

## CLIP 3: QUICK MONTAGE (1:30–2:00) — SCREEN RECORDING WITH VOICEOVER

**Record your screen scrolling through these. Edit to 3-4 seconds each. Talk fast.**

| Screen Description | Say | Seconds |
|---|---|---|
| **AppNav bar** — sticky top bar with tabs: Practice (active, cyan), 3D Mock, Progress, History. Right side: dark/light toggle switch, user avatar circle, "Sign Out" link. Dark theme active. | "Clean navigation — Practice, 3D Mock, Progress, History, dark/light toggle" | 3s |
| **Onboarding Step 1** — left sidebar shows 3-step progress (Profile, Interview Type, Company & Role). Right panel: "Quick Fill from Resume" card with file upload dropzone + paste area, then "Your Details" card with Name, Country, Background, Experience, Skills fields, Target Roles pills. Click "Auto-Fill from Resume" button. Fields populate. | "Upload your resume, Gemini extracts your profile" | 3s |
| **Onboarding Step 3** — Company pills row (Google, Amazon, Meta, Microsoft, Apple, Netflix, Startup, Other). Amazon highlighted in cyan. Below: Experience Level grid (0-2, 2-5, 5-10, 10+), Interview Round pills, Job Description textarea. | "Company-specific intelligence — Amazon Leadership Principles, Google Googliness" | 4s |
| **Practice tab home** — Hero tile shows "Amazon · Software Engineer" (clickable, navigates to profile). Below: two-column grid — left "Amazon Interview Intel" card with interview style description, right "What They Look For" card with tagged pills. Bottom: "Tips from Candidates" full-width card. | "Real interview data scraped from 5 websites by TinyFish" | 3s |
| **Practice tab mid-session** — Left column: question card with voice recorder waveform, answer text. Right sidebar: FeedbackCard with sentence-by-sentence analysis — each sentence colored green/yellow/red with rating badge, reason, and rewrite suggestion. | "Every answer gets sentence-by-sentence analysis" | 3s |
| **Progress tab** — Dashboard with score trend line chart, session history cards, weak area breakdown with colored bars (improving/stable/declining labels), communication habits section (filler words count, active voice %, pacing distribution). | "Weak areas tracked across sessions — the AI adapts to target them" | 4s |

> Total voiceover: "The system researches your target company, generates personalized questions, tracks your weak areas, and adapts the difficulty. Every interview makes you better."

---

## CLIP 4: FACE + CLOSE (2:00–2:15)

**Setup:** Camera on face again. Same angle as Clip 1.

> "Dual-model architecture — Gemini is the analyst, Claude is the interviewer. InsForge routes both models and runs our database. TinyFish scrapes real interview data. Speechmatics handles voice transcription. Every sponsor API is core to the product."

---

## CLIP 5: FACE + IMPACT CLOSE (2:15–2:25)

**[Still on face. Lean in slightly. Slower pace.]**

> "Interview coaching shouldn't cost three hundred dollars. We made it free — for anyone with a browser and a microphone."

**[Hold eye contact with camera for 1 second. Cut to black.]**

---

## EDITING CHECKLIST

- [ ] Total runtime: 2:20–2:30 (HARD LIMIT)
- [ ] No clip longer than 30 seconds without a cut
- [ ] Speed up any loading screen to 2x
- [ ] Add subtle lo-fi background music (lower volume when you're speaking)
- [ ] Add text overlay on first frame: "InterviewCoach AI — HackASU 2026"
- [ ] Add text overlay on last frame: GitHub URL + deployed link
- [ ] Export 1080p, upload as UNLISTED on YouTube

---

## IF SOMETHING BREAKS DURING RECORDING

| Problem | Fix |
|---------|-----|
| TTS doesn't speak | Talk over it: "The interviewer speaks the feedback naturally..." show the text |
| STT doesn't capture | Pre-type an answer, say "real-time transcription captures your answer" |
| 3D scene lags | Pre-record the 3D segment at lower resolution, splice it in |
| Feedback API times out | Pre-record a successful feedback flow, splice it in |
| Hand gestures look stiff | They're periodic and subtle — that's intentional, don't mention it |
| Voice Q&A mic fails | Just type the question instead, both options are shown |
| Replay audio missing | Say "you can replay your recorded answer here" and point at the button |
| Word highlighting not syncing | Still looks good — the text is there, highlighting is a bonus |

**Golden rule: NEVER stop recording to fix something. Just narrate around it and edit later.**

---

## WHAT JUDGES WILL REMEMBER (in order of impact)

1. The 3D scene with characters **sitting and gesturing** — nobody else has this
2. Your bad answer getting a 52 — they'll laugh, it's relatable
3. **Word-by-word highlighting** in sidebar as interviewer speaks — feels like a real coaching session
4. Interviewer speaking feedback with hand gestures — feels alive
5. **Replay Your Answer** audio button — lets you hear yourself back
6. Voice mic (🎤) for asking about feedback — shows voice-first design
7. "Powered by Claude" coaching plan — proves deep integration
8. "Delete My Data" on profile — shows ethics consideration
9. "Interview coaching shouldn't cost $300" — emotional close

---

## KEY FEATURES TO MENTION (if judges ask)

- **Dual-model AI**: Gemini = analyst (STAR scoring, sentence analysis), Claude = interviewer (feedback voice, follow-ups, coaching)
- **5 sponsor integrations**: InsForge (DB + AI gateway), TinyFish (web scraping), Speechmatics (STT), Gemini, Claude
- **3D characters**: Sitting posture, mouth animation, periodic hand gestures, speech bubbles
- **Word highlighting**: Feedback text highlights word-by-word in sync with TTS in the sidebar panel
- **Replay audio**: Listen back to your recorded answer from the feedback panel
- **Ethical design**: Pre-interview notice, AI-Generated badge, Delete My Data button, no audio stored
- **Adaptive learning**: Tracks weak areas, generates harder questions targeting them
- **Voice-first**: Record answers by voice, ask about feedback by voice
- **Profile auto-fill**: Resume parsing + DB sync — data persists across sessions and pages
