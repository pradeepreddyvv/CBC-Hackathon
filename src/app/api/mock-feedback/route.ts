import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";
import { buildCandidateContext } from "@/lib/prompts";
import { getCompanyPromptContext } from "@/lib/company-patterns";

// ── InsForge gateway for Claude Haiku ───────────────────────────
const INSFORGE_URL = process.env.INSFORGE_PROJECT_URL || "";
const INSFORGE_KEY = process.env.INSFORGE_API_KEY || "";

async function callClaudeHaiku(prompt: string, systemPrompt?: string): Promise<string> {
  const messages: { role: string; content: string }[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${INSFORGE_URL}/api/ai/chat/completion`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${INSFORGE_KEY}`,
    },
    body: JSON.stringify({
      model: "anthropic/claude-haiku",
      messages,
      max_tokens: 4096,
      temperature: 0.8,
    }),
  });
  if (!res.ok) {
    // Fallback to Gemini if Claude Haiku not available
    console.warn("[mock-feedback] Claude Haiku unavailable, falling back to Gemini");
    return callGemini(prompt);
  }
  const data = await res.json();
  return data.text || "";
}

// ── Claude interviewer persona ──────────────────────────────────
function interviewerPersona(company: string, role: string) {
  return `You are a senior technical interviewer at ${company} conducting a mock interview for a ${role} position. You have 15+ years of experience and have conducted hundreds of interviews.

Your personality:
- Warm but direct — you give honest feedback because you want the candidate to succeed
- You ask probing follow-up questions to test depth, not to trick candidates
- You notice communication patterns (filler words, hedging, confidence)
- You care about authentic answers, not rehearsed scripts
- When a candidate gives a vague answer, you dig deeper specifically into what THEY did

Always respond as this interviewer persona. Never break character. Speak in second person ("you mentioned...", "I noticed you...").`;
}

// ── Per-question Gemini analysis prompt ─────────────────────────
function buildQuestionAnalysisPrompt(params: {
  question: string;
  answer: string;
  company: string;
  role: string;
  context: string;
  questionIndex: number;
  durationSec: number;
}) {
  return `You are a senior technical interviewer at ${params.company} evaluating a ${params.role} candidate.

${params.context}

QUESTION ${params.questionIndex + 1}: "${params.question}"

CANDIDATE'S ANSWER (spoken, ${params.durationSec}s):
"${params.answer}"

Provide a thorough analysis. Return ONLY valid JSON (no markdown, no code fences):
{
  "overall_score": <0-100>,
  "star_scores": {
    "situation": <0-100>,
    "task": <0-100>,
    "action": <0-100>,
    "result": <0-100>
  },
  "dimension_scores": {
    "relevance": <0-100>,
    "depth": <0-100>,
    "structure": <0-100>,
    "communication": <0-100>,
    "confidence": <0-100>,
    "technical_accuracy": <0-100>
  },
  "strengths": ["strength1", "strength2", "strength3"],
  "improvements": ["area1", "area2", "area3"],
  "weak_areas": ["topic1", "topic2"],
  "key_missing_points": ["what they should have mentioned"],
  "delivery_analysis": {
    "pace": "too fast|good|too slow",
    "clarity": "clear|needs work",
    "filler_words": "none|some|excessive",
    "answer_length": "too short|good|too long"
  },
  "ideal_answer_outline": "Brief outline of what an ideal answer would cover",
  "follow_up_questions": ["follow-up Q1 based on their answer", "follow-up Q2"]
}`;
}

// ── Full session analysis prompt ────────────────────────────────
function buildSessionAnalysisPrompt(params: {
  company: string;
  role: string;
  context: string;
  questionsAndAnswers: { question: string; answer: string; durationSec: number; questionAnalysis?: Record<string, unknown> }[];
}) {
  const qaBlock = params.questionsAndAnswers.map((qa, i) => {
    let block = `Q${i + 1}: "${qa.question}"\nA${i + 1} (${qa.durationSec}s): "${qa.answer}"`;
    if (qa.questionAnalysis) {
      block += `\nAnalysis: ${JSON.stringify(qa.questionAnalysis)}`;
    }
    return block;
  }).join("\n\n");

  return `You are a senior hiring panel lead at ${params.company} evaluating a ${params.role} candidate's full interview session.

${params.context}

=== INTERVIEW TRANSCRIPT ===
${qaBlock}

Provide comprehensive session analysis. Return ONLY valid JSON (no markdown, no code fences):
{
  "session_score": <0-100>,
  "readiness_rating": <1-10>,
  "readiness_label": "Not Ready|Getting There|Almost Ready|Ready|Strong Candidate",
  "overall_assessment": "2-3 sentence overall assessment",
  "pattern_analysis": {
    "recurring_strengths": ["patterns of strength across answers"],
    "recurring_weaknesses": ["patterns of weakness"],
    "consistency": "consistent|mixed|inconsistent",
    "improvement_trend": "improving|stable|declining"
  },
  "per_question_summary": [
    {"question_number": 1, "score": <0-100>, "one_liner": "brief assessment"}
  ],
  "top_3_focus_areas": ["highest priority improvement area 1", "area 2", "area 3"],
  "strengths_to_leverage": ["what they're doing well to keep doing"],
  "hiring_recommendation": "Strong Hire|Hire|Lean Hire|Lean No Hire|No Hire",
  "next_steps": ["specific actionable next steps for the candidate"],
  "adaptive_question_topics": ["topics for follow-up questions based on weak areas"]
}`;
}

// ── Claude Haiku humanization prompt ────────────────────────────
function buildHumanizationPrompt(params: {
  mode: "single" | "session";
  company: string;
  role: string;
  question?: string;
  answer?: string;
  analysis: Record<string, unknown>;
}) {
  const analysisStr = JSON.stringify(params.analysis, null, 2);

  if (params.mode === "single") {
    return `You are a friendly but honest interviewer at ${params.company} giving verbal feedback to a ${params.role} candidate after they answered a question.

The question was: "${params.question}"
Their answer was: "${params.answer}"

Here is the detailed AI analysis of their answer:
${analysisStr}

Now give feedback AS IF you are the interviewer speaking directly to the candidate in a face-to-face interview. Be:
- Conversational and warm (use "you", first person)
- Specific (reference actual parts of their answer)
- Balanced (start with something positive, then constructive feedback)
- Actionable (give concrete tips they can use right now)
- Brief (3-5 sentences max, like a real interviewer would say between questions)

Do NOT use bullet points or structured format. Speak naturally as an interviewer would.
Return ONLY valid JSON: { "spoken_feedback": "your conversational feedback here", "tone": "encouraging|neutral|concerned" }`;
  }

  return `You are a senior interviewer at ${params.company} wrapping up a mock interview with a ${params.role} candidate. You need to give them overall feedback on the entire session.

Here is the detailed AI analysis of the full session:
${analysisStr}

Give your closing feedback AS IF you are the interviewer speaking directly to the candidate at the end of the interview. Be:
- Professional but warm
- Honest about their readiness level
- Specific about what stood out (good and bad)
- Motivating — end with encouragement
- Natural (5-8 sentences, like a real debrief)

Do NOT use bullet points. Speak naturally.
Return ONLY valid JSON: { "spoken_feedback": "your conversational feedback here", "tone": "encouraging|neutral|concerned", "closing_advice": "one key thing to focus on" }`;
}

// ── Targeted follow-up question generation ─────────────────────
function buildTargetedFollowUpPrompt(params: {
  company: string;
  role: string;
  context: string;
  question: string;
  answer: string;
  previousQA: { question: string; answer: string }[];
}) {
  const prevBlock = params.previousQA.length > 0
    ? `\nPrevious Q&A in this interview:\n${params.previousQA.map((qa, i) => `Q${i + 1}: "${qa.question}"\nA${i + 1}: "${qa.answer}"`).join("\n\n")}\n`
    : "";

  return `You are a senior interviewer at ${params.company} for a ${params.role} position.

${params.context}
${prevBlock}
The candidate just answered:
QUESTION: "${params.question}"
ANSWER: "${params.answer}"

Based on their answer, generate ONE natural follow-up question that:
- Digs deeper into a specific detail they mentioned (or should have mentioned)
- Tests whether they truly experienced this or are making it up
- Probes a gap, vague area, or interesting claim in their answer
- Feels like a natural continuation a real interviewer would ask

The follow-up should feel conversational, not robotic. A real interviewer would say something like "You mentioned X — can you tell me more about..." or "What specifically happened when..." or "How did you measure the impact of..."

Return ONLY valid JSON (no markdown, no code fences):
{
  "followup_question": "the follow-up question text",
  "reason": "why this follow-up is being asked (what gap or claim it probes)"
}`;
}

// ── Adaptive question generation based on weak areas ────────────
function buildAdaptiveFollowUpPrompt(params: {
  company: string;
  role: string;
  context: string;
  weakAreas: string[];
  previousQuestions: string[];
  count: number;
}) {
  return `You are a senior interviewer at ${params.company} for a ${params.role} position.

${params.context}

The candidate showed weakness in these areas: ${params.weakAreas.join(", ")}

Previous questions asked (do NOT repeat):
${params.previousQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

Generate ${params.count} NEW interview questions that specifically target the candidate's weak areas.
Each question should probe deeper into the areas where they struggled.

Return ONLY valid JSON (no markdown):
{
  "questions": [
    {
      "id": "adaptive_1",
      "text": "the question text",
      "type": "behavioral|technical|situational",
      "category": "the weak area it targets",
      "targets_weakness": ["weak_area_1"],
      "difficulty": "medium|hard",
      "hint": "brief hint for the candidate",
      "why_asked": "brief explanation of why this probes their weakness"
    }
  ]
}`;
}

// ── Main route ──────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, company, role, profile, country } = body;

    const candidateContext = buildCandidateContext({
      name: profile?.name || "Candidate",
      background: profile?.background || "",
      targetRole: role || "Software Engineer",
      targetCompany: company || "General",
      experience: profile?.experience || "",
      skills: profile?.skills || "",
    });

    const countryCtx = country ? `\nCandidate is based in ${country}.` : "";
    const fullContext = candidateContext + "\n" + getCompanyPromptContext(company || "General") + countryCtx;

    // ── Action: Analyze single question ─────────────────────────
    if (action === "analyze_question") {
      const { question, answer, questionIndex, durationSec } = body;
      if (!question || !answer) {
        return NextResponse.json({ error: "question and answer required" }, { status: 400 });
      }

      // Step 1: Gemini deep analysis
      const analysisPrompt = buildQuestionAnalysisPrompt({
        question, answer, company: company || "General", role: role || "Software Engineer",
        context: fullContext, questionIndex: questionIndex || 0, durationSec: durationSec || 60,
      });
      const analysisText = await callGemini(analysisPrompt);
      const analysis = extractJSON(analysisText);

      // Step 2: Claude Haiku humanization
      const humanPrompt = buildHumanizationPrompt({
        mode: "single", company: company || "General", role: role || "Software Engineer",
        question, answer, analysis,
      });
      const humanText = await callClaudeHaiku(humanPrompt);
      let humanized: Record<string, unknown>;
      try {
        humanized = extractJSON(humanText);
      } catch {
        humanized = { spoken_feedback: humanText, tone: "neutral" };
      }

      return NextResponse.json({ analysis, humanized });
    }

    // ── Action: Analyze full session ────────────────────────────
    if (action === "analyze_session") {
      const { questionsAndAnswers } = body;
      if (!questionsAndAnswers?.length) {
        return NextResponse.json({ error: "questionsAndAnswers required" }, { status: 400 });
      }

      // Step 1: Gemini session analysis
      const sessionPrompt = buildSessionAnalysisPrompt({
        company: company || "General", role: role || "Software Engineer",
        context: fullContext, questionsAndAnswers,
      });
      const sessionText = await callGemini(sessionPrompt);
      const sessionAnalysis = extractJSON(sessionText);

      // Step 2: Claude Haiku humanization
      const humanPrompt = buildHumanizationPrompt({
        mode: "session", company: company || "General", role: role || "Software Engineer",
        analysis: sessionAnalysis,
      });
      const humanText = await callClaudeHaiku(humanPrompt);
      let humanized: Record<string, unknown>;
      try {
        humanized = extractJSON(humanText);
      } catch {
        humanized = { spoken_feedback: humanText, tone: "neutral" };
      }

      return NextResponse.json({ analysis: sessionAnalysis, humanized });
    }

    // ── Action: Generate targeted follow-up question (Claude) ───
    if (action === "generate_followup") {
      const { question, answer, previousQA } = body;
      if (!question || !answer) {
        return NextResponse.json({ error: "question and answer required" }, { status: 400 });
      }

      const prompt = buildTargetedFollowUpPrompt({
        company: company || "General",
        role: role || "Software Engineer",
        context: fullContext,
        question,
        answer,
        previousQA: previousQA || [],
      });
      // Claude generates follow-ups — better conversational probing
      const text = await callClaudeHaiku(prompt, interviewerPersona(company || "General", role || "Software Engineer"));
      const result = extractJSON(text);
      return NextResponse.json(result);
    }

    // ── Action: Generate adaptive follow-up questions (Claude) ──
    if (action === "adaptive_questions") {
      const { weakAreas, previousQuestions, count } = body;
      const prompt = buildAdaptiveFollowUpPrompt({
        company: company || "General", role: role || "Software Engineer",
        context: fullContext,
        weakAreas: weakAreas || [],
        previousQuestions: previousQuestions || [],
        count: count || 3,
      });
      // Claude targets weak areas with natural, probing questions
      const text = await callClaudeHaiku(prompt, interviewerPersona(company || "General", role || "Software Engineer"));
      const result = extractJSON(text);
      return NextResponse.json(result);
    }

    // ── Action: Ask question about feedback (Claude) ───────────
    if (action === "ask_about_feedback") {
      const { candidateQuestion, feedbackContext, question, answer } = body;
      if (!candidateQuestion || !feedbackContext) {
        return NextResponse.json({ error: "candidateQuestion and feedbackContext required" }, { status: 400 });
      }

      const prompt = `You just gave the candidate feedback on their interview answer. Now they have a follow-up question.

Original interview question: "${question || ""}"
Candidate's answer: "${answer || ""}"

Your feedback was:
${JSON.stringify(feedbackContext, null, 2)}

The candidate asks: "${candidateQuestion}"

Respond naturally — be helpful, specific, and encouraging. Give actionable advice. Keep your response concise (2-4 sentences). Speak directly to the candidate in second person.

Return ONLY valid JSON (no markdown):
{
  "response": "Your conversational response to the candidate's question",
  "tip": "One specific actionable tip based on their question"
}`;

      // Claude handles all conversational feedback — this IS the interviewer talking
      const text = await callClaudeHaiku(prompt, interviewerPersona(company || "General", role || "Software Engineer"));
      const result = extractJSON(text);
      return NextResponse.json(result);
    }

    // ── Action: Interviewer coaching summary (Claude) ─────────
    if (action === "coaching_summary") {
      const { answers, weakAreas, sessionScore } = body;

      const answersBlock = (answers || []).map((a: { question: string; answer: string; score?: number }, i: number) =>
        `Q${i + 1}: "${a.question}"\nAnswer: "${a.answer}"${a.score ? ` (Score: ${a.score})` : ""}`
      ).join("\n\n");

      const prompt = `You just finished a mock interview session. Here is the full transcript:

${answersBlock}

Session score: ${sessionScore || "N/A"}/100
Weak areas identified: ${(weakAreas || []).join(", ") || "None"}

Give the candidate a personalized coaching plan for their next session. Be specific — reference their actual answers. Tell them:
1. The ONE thing that would improve their score the most
2. A specific example of how to restructure their weakest answer
3. What they're already doing well that they should keep doing

Speak as the interviewer wrapping up the session. Be warm but direct. 4-6 sentences.

Return ONLY valid JSON (no markdown):
{
  "coaching_plan": "Your personalized coaching advice",
  "priority_skill": "The single most important skill to practice",
  "example_rewrite": "A brief example of how to improve their weakest answer",
  "encouragement": "One encouraging closing statement"
}`;

      const text = await callClaudeHaiku(prompt, interviewerPersona(company || "General", role || "Software Engineer"));
      const result = extractJSON(text);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Invalid action. Use: analyze_question, analyze_session, generate_followup, adaptive_questions, ask_about_feedback, coaching_summary" }, { status: 400 });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[mock-feedback] Error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
