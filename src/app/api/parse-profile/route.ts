import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { resume, context, jobDescription } = body;

    if (!resume && !context && !jobDescription) {
      return NextResponse.json({ error: "Provide resume, context, or job description" }, { status: 400 });
    }

    // If job description is provided, extract setup fields from it
    if (jobDescription && !resume && !context) {
      const jdPrompt = `You are a job description analysis expert. Extract structured information from this job description to help a candidate prepare for their interview.

JOB DESCRIPTION:
"""
${jobDescription.substring(0, 8000)}
"""

Extract and return ONLY valid JSON (no markdown, no code fences):
{
  "targetCompany": "Company name from the JD (e.g., Google, Amazon, Meta, Microsoft, Apple, Netflix, or the actual company name)",
  "targetRole": "The role title normalized to one of: Software Engineer, Frontend Engineer, Backend Engineer, Full Stack, ML/AI Engineer, Data Scientist, DevOps/SRE, Mobile Developer, Product Manager, Data Engineer, Security Engineer, QA Engineer",
  "yearsExperience": <number of years of experience required, e.g., 0, 2, 5, 10>,
  "roundType": "Best guess interview round type from: Phone Screen, Technical Round, System Design, Behavioral / Bar Raiser, Onsite Loop, Take-Home, Final Round, General Prep",
  "keySkills": "Comma-separated list of key technical skills and qualifications mentioned in the JD"
}`;

      const text = await callGemini(jdPrompt);
      const profile = extractJSON(text);
      return NextResponse.json({ profile });
    }

    const prompt = `You are a profile extraction expert. Extract structured profile information from the provided resume and/or context.

${resume ? `RESUME TEXT:\n"""\n${resume.substring(0, 8000)}\n"""` : ""}

${context ? `USER CONTEXT (LLM-generated):\n"""\n${context.substring(0, 8000)}\n"""` : ""}

Extract and return ONLY valid JSON (no markdown, no code fences):
{
  "name": "Full name",
  "background": "1-2 sentence summary of who they are (education, current role, career stage)",
  "targetRole": "Best guess at target role based on experience (e.g., Software Engineer, ML Engineer, Product Manager)",
  "targetCompany": "General",
  "experience": "Concise summary of key work experience — company names, roles, durations, and 3-5 most impressive achievements with metrics if available",
  "skills": "Comma-separated list of technical and soft skills",
  "resumeHighlights": {
    "years_of_experience": 0,
    "education": "Degree, university, GPA if available",
    "top_projects": ["project name — 1 line description"],
    "key_metrics": ["quantified achievements from resume"],
    "strongest_areas": ["areas they'd be strongest in interviews"],
    "gaps_to_address": ["areas they should prepare more for"]
  }
}`;

    const text = await callGemini(prompt);
    const profile = extractJSON(text);
    return NextResponse.json({ profile });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Parse profile error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
