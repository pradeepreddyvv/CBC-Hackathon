import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";
import { buildAdaptiveQuestionPrompt, buildProgressAnalysisPrompt, buildCandidateContext } from "@/lib/prompts";
import { getCompanyPromptContext } from "@/lib/company-patterns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, company, role, profile, weakAreas, completedQuestions, sessionNumber, sessions, overallWeakAreas, communicationHabits, country } = body;
    const co = company || "General";
    const candidateCountry = country || profile?.country || "";

    const candidateContext = buildCandidateContext({
      name: profile?.name || "Candidate",
      background: profile?.background || "Software engineer",
      targetRole: role || "Software Engineer",
      targetCompany: co,
      experience: profile?.experience || "Not provided",
      skills: profile?.skills || "Not provided",
    });

    const countryContext = candidateCountry
      ? `\nCandidate Location: ${candidateCountry}. Tailor questions to be relevant to ${candidateCountry}-based interviews at ${co}. Consider regional interview practices, local office culture, and country-specific behavioral expectations.`
      : "";

    const fullContext = candidateContext + "\n" + getCompanyPromptContext(co) + countryContext;

    if (action === "generate_session") {
      const prompt = buildAdaptiveQuestionPrompt({
        company: co,
        role: role || "Software Engineer",
        candidateContext: fullContext,
        weakAreas: weakAreas || [],
        completedQuestions: completedQuestions || [],
        sessionNumber: sessionNumber || 1,
        communicationHabits,
      });

      const text = await callGemini(prompt);
      const session = extractJSON(text);
      return NextResponse.json({ session });
    }

    if (action === "analyze_progress") {
      const prompt = buildProgressAnalysisPrompt({
        candidateContext: fullContext,
        sessions: sessions || [],
        overallWeakAreas: overallWeakAreas || [],
      });

      const text = await callGemini(prompt);
      const analysis = extractJSON(text);
      return NextResponse.json({ analysis });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Adaptive API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
