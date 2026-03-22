# InterviewCoach AI — Demo Script (3-4 min YouTube Video)

> **HackASU 2026 | Claude Builder Club | Track 3: Economic Empowerment & Education**

---

## Pre-Recording Checklist
- [ ] App running locally or deployed on Vercel
- [ ] Profile already set up with a sample resume
- [ ] Browser mic permissions granted
- [ ] Screen recording software ready (OBS / QuickTime / Loom)
- [ ] Browser zoom at 100%, dark mode on

---

## SCENE 1: Hook & Problem (0:00 – 0:30)

**[Show landing page / title slide]**

> "Job interviews are the single biggest barrier between talent and opportunity. You could be the best engineer in the world, but if you can't articulate your experience in a 45-minute interview, you won't get the job."
>
> "Mock interviews with friends don't give you real feedback. Professional coaching costs $200+ per session. And most people just... wing it."
>
> "We built InterviewCoach AI — a free, AI-powered mock interview platform that gives you the same quality feedback as a senior FAANG interviewer, in an immersive 3D environment."

---

## SCENE 2: Profile & Setup (0:30 – 1:00)

**[Navigate to Profile page]**

> "First, you set up your profile. Upload your resume — our AI extracts your skills, experience, and background automatically using Gemini's multimodal API."

**[Show resume upload → auto-fill animation]**

> "Pick your target company — we have built-in intelligence for Amazon, Google, Meta, Microsoft, and more. Each company has different interview patterns. Amazon focuses on Leadership Principles, Google on structured problem-solving."

**[Click company pills, show role selection]**

> "Select your role, experience level, and interview type. You can even paste a job description and we'll tailor questions specifically to it."

---

## SCENE 3: Research Phase (1:00 – 1:30)

**[Navigate to Onboarding → Research step, or show research results]**

> "Before generating questions, our system scrapes real interview experiences from Reddit, LeetCode Discuss, Glassdoor, and GeeksForGeeks using TinyFish's AI browser automation."
>
> "This means your practice questions are based on what actual candidates were asked — not generic textbook questions."

**[Show research results with source badges]**

---

## SCENE 4: 3D Mock Interview (1:30 – 3:00) ⭐ KEY DEMO

**[Click "3D Mock Interview" tab]**

> "This is where the magic happens. You enter an immersive 3D interview office — built with Three.js. There's your interviewer on the left, you're on the right."

**[Show 3D scene loading — interviewer and candidate characters visible]**

> "The interviewer asks you a question via text-to-speech. You can see it in the speech bubble."

**[Let TTS play a question, show speech bubble]**

> "Now I answer using my voice. Our system uses Speechmatics real-time speech-to-text for accurate transcription."

**[Record a sample answer — ~15 seconds. Something like: "At my previous company, I led a team of 5 engineers to migrate our monolithic API to microservices. The main challenge was maintaining zero downtime during the transition. I designed a strangler fig pattern where we gradually routed traffic to new services. The result was a 40% reduction in deployment time and 99.99% uptime throughout the migration."]**

> "Watch what happens when I submit. The AI analyzes my answer using the STAR framework — Situation, Task, Action, Result — and generates detailed feedback."

**[Show feedback appearing in speech bubble with word-by-word highlighting as TTS speaks]**

> "The interviewer speaks the feedback naturally, and you can see each word highlighted as it's spoken — just like following along with subtitles."

> "After getting feedback, I can ask follow-up questions about the feedback — like a real conversation with an interviewer."

**[Type a follow-up question about the feedback, show response]**

---

## SCENE 5: Deep Analysis (3:00 – 3:30)

**[Navigate to History tab, click on a completed answer]**

> "Every answer gets deep analysis: STAR scores for each dimension, sentence-by-sentence rating, delivery analysis tracking filler words and confidence, and specific coaching tips."

**[Scroll through analysis showing STAR scores, sentence analysis, delivery metrics]**

> "The system also tracks your weak areas across sessions. If you consistently struggle with 'quantifying results,' it generates harder questions targeting that specific area."

---

## SCENE 6: Tech & Impact (3:30 – 4:00)

**[Show architecture slide or speak over logo]**

> "Under the hood, we use Claude Haiku for humanized conversational feedback, Gemini Flash for deep STAR analysis and question generation, Speechmatics for real-time transcription, Three.js for the 3D scene, and InsForge for our PostgreSQL database and AI gateway."
>
> "This is Track 3 — Economic Empowerment & Education. Quality interview prep shouldn't cost $200 a session. With InterviewCoach AI, anyone with a browser and a microphone can practice with the same rigor as a $500/hour career coach."
>
> "Thank you."

---

## Tips for Recording
1. **Energy**: Be enthusiastic but natural. This is a product demo, not a lecture.
2. **Pace**: Don't rush. Let the UI breathe — viewers need time to see what's happening.
3. **Voice answer**: Practice your sample answer beforehand so it sounds natural.
4. **Editing**: Cut out any loading screens longer than 3 seconds. Add speed-up (2x) for research phase.
5. **Music**: Add subtle background music (royalty-free lo-fi or tech ambient).
6. **Screen**: Use 1920x1080 resolution, browser in full screen.

---

## Backup: If Something Breaks
- If TTS doesn't work: "The text-to-speech delivers feedback naturally..." and show the text
- If STT fails: "Real-time transcription captures your answer..." and type manually
- If 3D scene is slow: Pre-record the 3D scene segment separately
- If API times out: Use pre-recorded clips of the research/feedback phases
