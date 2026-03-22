import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";
import { buildFeedbackPrompt, buildSessionSummaryPrompt, buildCandidateContext } from "@/lib/prompts";
import { getCompanyPromptContext } from "@/lib/company-patterns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;
    const company = body.company || "General";
    const candidateCountry = body.country || body.profile?.country || "";

    const candidateContext = buildCandidateContext({
      name: body.profile?.name || "Candidate",
      background: body.profile?.background || "Software engineer",
      targetRole: body.role || "Software Engineer",
      targetCompany: company,
      experience: body.profile?.experience || "Not provided",
      skills: body.profile?.skills || "Not provided",
    });

    const countryContext = candidateCountry
      ? `\nCandidate is based in ${candidateCountry}. Consider ${candidateCountry}-specific interview norms, communication styles, and cultural expectations when providing feedback.`
      : "";

    // Append company-specific interview intelligence
    const fullContext = candidateContext + "\n" + getCompanyPromptContext(company) + countryContext;

    if (action === "session_summary") {
      const prompt = buildSessionSummaryPrompt({
        company,
        role: body.role || "Software Engineer",
        candidateContext: fullContext,
        answers: body.answers || [],
        sessionNumber: body.sessionNumber || 1,
      });

      const text = await callGemini(prompt);
      const summary = extractJSON(text);
      return NextResponse.json({ summary });
    }

    // Per-question feedback
    const { question, answer, category, questionType, role, answerDurationSec, modelAnswer, previousAttempts } = body;

    if (!question || !answer) {
      return NextResponse.json({ error: "question and answer are required" }, { status: 400 });
    }

    const prompt = buildFeedbackPrompt({
      question,
      answer,
      category: category || "general",
      questionType: questionType || "behavioral",
      company,
      role: role || "Software Engineer",
      candidateContext: fullContext,
      answerDurationSec: answerDurationSec || 60,
      modelAnswer,
      previousAttempts,
    });

    const text = await callGemini(prompt);
    const feedback = extractJSON(text);
    return NextResponse.json({ feedback });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Feedback API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
