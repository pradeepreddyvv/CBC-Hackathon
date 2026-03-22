import { NextRequest, NextResponse } from "next/server";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

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

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_KEY}`;

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
      }),
    });

    if (!res.ok) {
      // Fallback without search grounding
      const fallbackRes = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.3 },
        }),
      });
      const fallbackData = await fallbackRes.json();
      const text = fallbackData.candidates?.[0]?.content?.parts?.[0]?.text || "";
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        return NextResponse.json({ research: JSON.parse(match[0]) });
      }
      return NextResponse.json({ research: null, error: "Failed to parse research" });
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string; thought?: boolean }) => p.text && !p.thought)
      ?.map((p: { text: string }) => p.text)
      ?.join("") || "";

    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      return NextResponse.json({ research: JSON.parse(match[0]) });
    }

    return NextResponse.json({ research: null, error: "No research data found" });
  } catch (error) {
    console.error("Research error:", error);
    return NextResponse.json({ error: "Research failed" }, { status: 500 });
  }
}
