import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";
import { buildCandidateContext } from "@/lib/prompts";
import { getCompanyPromptContext } from "@/lib/company-patterns";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const transcript = String(body.transcript || "").trim();
    const turns = Array.isArray(body.turns) ? body.turns : [];
    const company = body.company || "General";
    const role = body.role || "Software Engineer";

    if (!transcript) {
      return NextResponse.json({ error: "transcript is required" }, { status: 400 });
    }

    const candidateContext = buildCandidateContext({
      name: body.profile?.name || "Candidate",
      background: body.profile?.background || "Software engineer",
      targetRole: role,
      targetCompany: company,
      experience: body.profile?.experience || "Not provided",
      skills: body.profile?.skills || "Not provided",
    });

    const prompt = `You are an expert interview coach.

Analyze the interview transcript below. There are two speakers: interviewer and candidate.
Infer who the candidate is based on who gives longer, experience-based answers.

${candidateContext}

Company context:
${getCompanyPromptContext(company)}

TURN-BY-TURN (if available):
${JSON.stringify(turns).slice(0, 35000)}

FULL TRANSCRIPT:
"""
${transcript.slice(0, 45000)}
"""

Return ONLY valid JSON in this exact shape:
{
  "overall_score": 0,
  "communication_score": 0,
  "content_score": 0,
  "confidence_score": 0,
  "summary": "2-4 sentence summary",
  "strengths": ["string"],
  "improvements": ["string"],
  "question_by_question": [
    {
      "question": "interviewer question summary",
      "answer_quality": "strong|okay|weak",
      "coaching_note": "one concrete improvement"
    }
  ],
  "next_practice_questions": ["string", "string", "string"]
}`;

    const text = await callGemini(prompt);
    const feedback = extractJSON(text);
    return NextResponse.json({ feedback });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Interview feedback API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
