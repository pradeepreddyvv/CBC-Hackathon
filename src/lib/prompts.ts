// ============================================================
// CLAUDE PROMPTS — General-purpose interview coaching
// Sentence-level + question-level + session-level feedback
// ============================================================

export function buildCandidateContext(profile: {
  name: string;
  background: string;
  targetRole: string;
  targetCompany: string;
  experience: string;
  skills: string;
}) {
  return `CANDIDATE PROFILE:
- Name: ${profile.name}
- Background: ${profile.background}
- Target: ${profile.targetCompany} — ${profile.targetRole}
- Experience: ${profile.experience}
- Key Skills: ${profile.skills}`;
}

// ============================================================
// FEEDBACK PROMPT — Per-question with sentence-level analysis
// ============================================================
export function buildFeedbackPrompt(params: {
  question: string;
  answer: string;
  category: string;
  questionType: string;
  company: string;
  role: string;
  candidateContext: string;
  answerDurationSec: number;
  modelAnswer?: string;
  previousAttempts?: Array<{ score: number; weakAreas: string[] }>;
}) {
  const { question, answer, category, questionType, company, role, candidateContext, answerDurationSec, modelAnswer, previousAttempts } = params;

  const prevContext = previousAttempts?.length
    ? `\n\nPREVIOUS ATTEMPTS ON THIS QUESTION:
${previousAttempts.map((a, i) => `Attempt ${i + 1}: Score ${a.score}, Weak areas: ${a.weakAreas.join(", ")}`).join("\n")}
Note: Evaluate improvement from previous attempts. Acknowledge progress where it exists.`
    : "";

  const modelRef = modelAnswer
    ? `\n\nMODEL ANSWER (reference — do NOT penalize deviation, use for comparison):
${modelAnswer.substring(0, 2000)}`
    : "";

  return `You are a world-class interview coach at ${company} evaluating a ${role} candidate.
You have 15+ years conducting interviews at FAANG. You give ACTIONABLE, SPECIFIC feedback — never generic.

${candidateContext}

INTERVIEW QUESTION: ${question}
CATEGORY: ${category} | TYPE: ${questionType}
TARGET: ${company} — ${role}
ANSWER DURATION: ${answerDurationSec} seconds${modelRef}${prevContext}

CANDIDATE'S ANSWER (transcribed from voice or typed):
"""
${answer}
"""

═══ EVALUATION FRAMEWORK ═══

A. SENTENCE-LEVEL ANALYSIS
Break the answer into key sentences/phrases. For EACH important sentence:
- Rate it: "strong" | "okay" | "weak"
- Explain WHY in 1 line
- Suggest a REWRITE if it's "okay" or "weak"
- Tag: confidence_indicator | filler_word | vague_language | strong_metric | good_ownership | passive_voice | missing_context

B. STAR FRAMEWORK SCORES (0-100 each):
- Situation: Clear context? Specific team/company/timeline? Quantified scope?
- Task: Specific responsibility? Ownership level? Why it mattered?
- Action: THEIR actions (not "we")? Technical depth? Decision rationale?
- Result: Quantified impact? Business outcome? Lessons learned?

C. COMMUNICATION DIMENSIONS (0-100 each):
- clarity: How clear and structured was the communication?
- confidence: Language patterns suggesting confidence vs uncertainty (hedging words, definitive statements)?
- conciseness: Did they stay focused or ramble? Filler words count.
- storytelling: Did the answer flow logically? Was it engaging?
- technical_accuracy: For technical Qs — were claims accurate and deep?

D. VOICE/DELIVERY INDICATORS (inferred from text patterns):
- Filler words detected (um, uh, like, so, basically, you know, I mean, kind of, sort of)
- Hedging language (I think, maybe, probably, I guess, sort of)
- Power words used (built, designed, led, delivered, achieved, shipped, drove)
- Passive vs active voice ratio
- Answer pacing: too_short (<30s) | good (45-120s) | too_long (>150s)

E. WEAK AREAS (tag from taxonomy):
["situation_context", "task_clarity", "action_specificity", "result_quantification",
 "technical_depth", "system_design", "trade_offs", "communication_clarity",
 "conciseness", "confidence", "leadership_signals", "customer_focus",
 "data_driven", "ownership", "bias_for_action"]

F. COACHING:
- The ONE thing that would improve this answer the most
- A rewritten version of their weakest sentence
- Follow-up question an interviewer would ask
- If they were to redo this answer in 90 seconds, what's the ideal structure?

Return ONLY valid JSON (no markdown, no code fences):
{
  "overall_score": 0,
  "star_scores": { "situation": 0, "task": 0, "action": 0, "result": 0 },
  "dimension_scores": { "clarity": 0, "confidence": 0, "conciseness": 0, "storytelling": 0, "technical_accuracy": 0 },
  "sentence_analysis": [
    {
      "sentence": "exact sentence from their answer",
      "rating": "strong|okay|weak",
      "reason": "why this rating",
      "rewrite": "improved version (null if strong)",
      "tags": ["tag1"]
    }
  ],
  "delivery_analysis": {
    "filler_words": ["list of filler words found with count"],
    "hedging_phrases": ["hedging language found"],
    "power_words": ["strong words they used"],
    "active_voice_pct": 0,
    "pacing": "too_short|good|too_long",
    "pacing_note": "specific note about timing"
  },
  "strengths": ["2-4 specific strengths — quote exact phrases"],
  "improvements": ["2-4 actionable improvements — be SPECIFIC"],
  "coaching_tip": "the ONE thing to change",
  "weakest_sentence_rewrite": { "original": "", "improved": "" },
  "follow_up_question": "",
  "ideal_90sec_structure": "",
  "weak_areas": ["from taxonomy"],
  "recommendation": "Strong|Good|Needs Work|Redo",
  "encouragement": "genuine encouraging note about what they did well"
}`;
}

// ============================================================
// SESSION SUMMARY — End-of-interview aggregate feedback
// ============================================================
export function buildSessionSummaryPrompt(params: {
  company: string;
  role: string;
  candidateContext: string;
  answers: Array<{
    question: string;
    answer: string;
    score: number;
    weakAreas: string[];
    starScores: { situation: number; task: number; action: number; result: number };
    dimensionScores: Record<string, number>;
    deliveryAnalysis: {
      filler_words: string[];
      hedging_phrases: string[];
      power_words: string[];
      active_voice_pct: number;
      pacing: string;
    };
  }>;
  sessionNumber: number;
}) {
  const { company, role, candidateContext, answers, sessionNumber } = params;

  const answersDetail = answers.map((a, i) => `
Q${i + 1}: ${a.question}
Score: ${a.score}/100 | STAR: S=${a.starScores.situation} T=${a.starScores.task} A=${a.starScores.action} R=${a.starScores.result}
Weak: ${a.weakAreas.join(", ")}
Fillers: ${a.deliveryAnalysis.filler_words.join(", ") || "none"}
Hedging: ${a.deliveryAnalysis.hedging_phrases.join(", ") || "none"}
Power words: ${a.deliveryAnalysis.power_words.join(", ") || "none"}
Active voice: ${a.deliveryAnalysis.active_voice_pct}%
Pacing: ${a.deliveryAnalysis.pacing}`).join("\n---");

  return `You are a senior interview coach delivering an end-of-session debrief after a ${company} ${role} mock interview.
Be encouraging but honest. This is session #${sessionNumber} — acknowledge their journey.

${candidateContext}

═══ SESSION ${sessionNumber} RESULTS ═══
${answersDetail}

Provide a comprehensive session debrief:

1. OVERALL PERFORMANCE: How would this candidate perform in a real ${company} interview today?
2. PATTERN ANALYSIS: What recurring patterns do you see across ALL answers (not just individual)?
3. COMMUNICATION HABITS:
   - Aggregate filler word frequency — is this a problem or normal?
   - Hedging patterns — are they undermining their credibility?
   - Active vs passive voice trend — do they take ownership in language?
   - Pacing consistency — do they rush some answers and ramble on others?
4. STAR FRAMEWORK PATTERNS: Which STAR component is consistently weakest?
5. TOP 3 PRIORITIES: If they could only work on 3 things before their next session, what should they be?
6. STRENGTH TO LEAN INTO: What's their superpower that they should do MORE of?
7. ${company}-SPECIFIC ADVICE: Based on ${company}'s interview culture, what adjustments should they make?
8. MOCK INTERVIEW READINESS: On a scale of 1-10, how ready are they for a real interview?

Return ONLY valid JSON:
{
  "session_score": 0,
  "readiness_rating": 0,
  "readiness_label": "Not Ready|Getting There|Almost Ready|Interview Ready",
  "overall_assessment": "2-3 sentence honest assessment",
  "pattern_analysis": {
    "recurring_strengths": ["patterns seen across multiple answers"],
    "recurring_weaknesses": ["patterns seen across multiple answers"],
    "communication_habits": {
      "filler_summary": "assessment of filler word usage",
      "hedging_summary": "assessment of hedging language",
      "ownership_language": "assessment of active vs passive voice",
      "pacing_summary": "assessment of answer timing"
    }
  },
  "star_breakdown": {
    "strongest": "situation|task|action|result",
    "weakest": "situation|task|action|result",
    "advice": "specific advice for improving weakest STAR component"
  },
  "top_3_priorities": [
    { "area": "name", "why": "why this matters", "how": "specific drill or exercise" }
  ],
  "superpower": "their biggest strength to lean into",
  "company_specific_tips": ["2-3 tips specific to ${company}"],
  "next_session_focus": ["areas to focus on next time"],
  "encouragement": "genuine, specific encouragement referencing something they actually did well"
}`;
}

// ============================================================
// ADAPTIVE SESSION GENERATION — Targets weak spots
// ============================================================
export function buildAdaptiveQuestionPrompt(params: {
  company: string;
  role: string;
  candidateContext: string;
  weakAreas: Array<{ area: string; score: number; frequency: number }>;
  completedQuestions: string[];
  sessionNumber: number;
  communicationHabits?: {
    fillerFrequency: string;
    hedgingFrequency: string;
    pacingIssue: string;
  };
}) {
  const { company, role, candidateContext, weakAreas, completedQuestions, sessionNumber, communicationHabits } = params;

  const weakAreasText = weakAreas
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map(w => `- ${w.area}: avg score ${w.score}/100, seen ${w.frequency} times`)
    .join("\n");

  const doneText = completedQuestions.length
    ? `\nALREADY ASKED (do NOT repeat):\n${completedQuestions.slice(-20).map(q => `- ${q}`).join("\n")}`
    : "";

  const commHabits = communicationHabits
    ? `\nCOMMUNICATION PATTERNS TO ADDRESS:
- Filler words: ${communicationHabits.fillerFrequency}
- Hedging: ${communicationHabits.hedgingFrequency}
- Pacing: ${communicationHabits.pacingIssue}`
    : "";

  return `You are a senior interview coach designing personalized practice session #${sessionNumber}.

${candidateContext}

TARGET: ${company} — ${role}

WEAK AREAS FROM PREVIOUS SESSIONS:
${weakAreasText || "No previous data — generate a balanced introductory session."}
${commHabits}
${doneText}

DESIGN INSTRUCTIONS:
1. Generate exactly 5 questions targeting the candidate's WEAKEST areas
2. Each question MUST force the candidate to demonstrate a skill they're weak at
3. Mix: 2-3 behavioral, 1-2 technical, 0-1 system design
4. Tailor to ${company}'s interview style
5. Order from most critical weakness to least
6. Include specific hints referencing the candidate's experience
7. If they have communication issues (fillers, hedging, pacing), include 1 question designed as a "delivery challenge" — a question that's intentionally short/clear to practice concise delivery

Return ONLY valid JSON:
{
  "session_plan": {
    "focus_message": "1-2 sentence summary of what this session targets",
    "primary_weakness": "The #1 area being drilled",
    "expected_improvement": "What success looks like after this session",
    "delivery_challenge": "If applicable, which question is the delivery challenge and why"
  },
  "questions": [
    {
      "id": "q_1",
      "text": "The interview question",
      "type": "behavioral|technical|system_design",
      "category": "Topic category",
      "targets_weakness": ["which weak_areas this targets"],
      "difficulty": "easy|medium|hard",
      "hint": "Specific hints for this candidate",
      "company_context": "Why ${company} asks this",
      "time_target_sec": 90,
      "delivery_note": "Optional note about delivery focus for this Q"
    }
  ]
}`;
}

// ============================================================
// PROGRESS ANALYSIS — Cross-session trend analysis
// ============================================================
export function buildProgressAnalysisPrompt(params: {
  candidateContext: string;
  sessions: Array<{
    date: string;
    company: string;
    scores: number[];
    weakAreas: string[];
  }>;
  overallWeakAreas: Array<{ area: string; trend: number[]; currentScore: number }>;
}) {
  const { candidateContext, sessions, overallWeakAreas } = params;

  return `You are a learning analytics expert analyzing interview prep progress.

${candidateContext}

SESSION HISTORY (${sessions.length} sessions):
${sessions.map((s, i) => `Session ${i + 1} (${s.date}, ${s.company}): Avg score ${Math.round(s.scores.reduce((a, b) => a + b, 0) / Math.max(s.scores.length, 1))}, Weak: ${s.weakAreas.join(", ")}`).join("\n")}

SKILL TREND DATA:
${overallWeakAreas.map(w => `- ${w.area}: scores over time [${w.trend.join(", ")}] → current: ${w.currentScore}`).join("\n")}

Return ONLY valid JSON:
{
  "overall_trend": "improving|plateau|declining",
  "readiness_score": 0,
  "readiness_label": "Not Ready|Getting There|Almost Ready|Interview Ready",
  "top_improvements": ["areas that improved most"],
  "persistent_weaknesses": ["areas still weak"],
  "next_session_focus": ["top 3 areas to drill"],
  "coaching_insights": ["2-3 personalized observations"],
  "estimated_sessions_to_ready": 0,
  "milestone_message": "encouraging message about specific progress"
}`;
}
