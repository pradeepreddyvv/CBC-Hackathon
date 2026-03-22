import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const { company, role, interviewType, roundType, skills, yearsExperience } = await req.json();

    const prompt = `Search for recent interview experiences and information about interviewing at ${company} for ${role} positions (${yearsExperience} years experience level).

Focus on these sources:
- Reddit (r/cscareerquestions, r/leetcode, r/interviews, r/experienceddevs)
- LeetCode discussion posts about ${company} interviews
- Glassdoor interview reviews for ${company} ${role}
- GeeksForGeeks interview experiences for ${company}
- Blind/Fishbowl discussions about ${company} interviews

Specifically look for:
1. Interview format and rounds for ${roundType || "general"} at ${company}
2. Common questions asked (${interviewType || "mixed"} type)
3. Key skills tested: ${skills || "general programming"}
4. Difficulty level as reported by candidates
5. Tips from candidates who received offers
6. Common reasons for rejection
7. Timeline (how long the process takes)

Return ONLY valid JSON (no markdown, no code fences):
{
  "interview_format": "Description of the typical interview process",
  "rounds": ["list of rounds in order"],
  "common_questions": ["10-15 most commonly reported questions"],
  "difficulty": "Easy|Medium|Hard",
  "difficulty_details": "specific details about difficulty",
  "tips": ["5-7 actionable tips from successful candidates"],
  "rejection_reasons": ["common reasons candidates fail"],
  "timeline": "typical timeline from application to offer",
  "key_topics": ["most important topics to study"],
  "sources": ["Reddit r/cscareerquestions", "LeetCode Discuss", "Glassdoor", "GeeksForGeeks"]
}`;

    const text = await callGemini(prompt);
    const research = extractJSON(text);
    return NextResponse.json({ research });
  } catch (error) {
    console.error("Research error:", error);
    return NextResponse.json({ error: "Research failed" }, { status: 500 });
  }
}
