import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";

const TINYFISH_API_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY || "";

// ── Scrape targets ──────────────────────────────────────────────

function getScrapeTargets(company: string, role: string) {
  const cq = encodeURIComponent(`${company} ${role} interview`);
  const cl = company.toLowerCase().replace(/\s+/g, "-");

  return [
    {
      source: "Reddit r/cscareerquestions",
      url: `https://www.reddit.com/r/cscareerquestions/search/?q=${cq}&sort=relevance&t=year`,
      goal: `Find the top 5 posts about ${company} ${role} interview experiences. For each post extract: title, interview process details (rounds, questions, difficulty, tips). Return as JSON array with fields: title, content_summary, questions_mentioned, tips.`,
    },
    {
      source: "Reddit r/leetcode",
      url: `https://www.reddit.com/r/leetcode/search/?q=${cq}&sort=relevance&t=year`,
      goal: `Find the top 5 posts about ${company} coding interview questions. Extract: title, leetcode problems mentioned, difficulty, round type, tips. Return as JSON array with fields: title, problems_mentioned, difficulty, round_type, tips.`,
    },
    {
      source: "LeetCode Discuss",
      url: `https://leetcode.com/discuss/interview-experience?currentPage=1&orderBy=most_relevant&query=${encodeURIComponent(company)}`,
      goal: `Find top 5 interview experience posts for ${company}. Extract: title, role, rounds, coding questions, behavioral questions, outcome, tips. Return as JSON array.`,
    },
    {
      source: "Glassdoor",
      url: `https://www.glassdoor.com/Interview/${cl}-interview-questions-SRCH_KE0,${company.length}.htm`,
      goal: `Find interview reviews for ${company} ${role}. Extract top 8 interview questions, process description, difficulty rating, tips. Return as JSON with fields: interview_process, common_questions, difficulty, tips.`,
    },
    {
      source: "GeeksForGeeks",
      url: `https://www.geeksforgeeks.org/tag/${cl}-interview-experience/`,
      goal: `Find top 5 interview experience articles for ${company}. Extract: title, role, rounds, questions asked, difficulty, result. Return as JSON array.`,
    },
  ];
}

// ── TinyFish SSE scraper ────────────────────────────────────────

async function scrapeSingleSource(
  source: { source: string; url: string; goal: string },
  apiKey: string,
  signal?: AbortSignal
): Promise<{ source: string; data: string | null; error: string | null }> {
  try {
    const res = await fetch(TINYFISH_API_URL, {
      method: "POST",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: source.url, goal: source.goal }),
      signal,
    });

    if (!res.ok) {
      return { source: source.source, data: null, error: `HTTP ${res.status}` };
    }

    // Read SSE stream
    const reader = res.body?.getReader();
    if (!reader) {
      return { source: source.source, data: null, error: "No response body" };
    }

    const decoder = new TextDecoder();
    let textAccum = "";
    let resultData: string | null = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n");

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();
        if (!dataStr) continue;

        try {
          const event = JSON.parse(dataStr);
          if (event.type === "COMPLETE" && event.status === "COMPLETED") {
            resultData = typeof event.result === "string"
              ? event.result
              : JSON.stringify(event.result);
            break;
          }
          if (event.type === "ERROR") {
            return { source: source.source, data: null, error: event.message || "TinyFish error" };
          }
          if (event.type === "TEXT") {
            textAccum += event.text || "";
          }
        } catch {
          // skip malformed JSON
        }
      }
      if (resultData) break;
    }

    return {
      source: source.source,
      data: resultData || textAccum || null,
      error: resultData || textAccum ? null : "No data returned",
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { source: source.source, data: null, error: msg };
  }
}

async function scrapeAllSources(company: string, role: string, apiKey: string) {
  const targets = getScrapeTargets(company, role);

  // Scrape all sources concurrently with a 90s timeout
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);

  try {
    const results = await Promise.allSettled(
      targets.map((t) => scrapeSingleSource(t, apiKey, controller.signal))
    );

    return results.map((r, i) => {
      if (r.status === "fulfilled") return r.value;
      return { source: targets[i].source, data: null, error: String(r.reason) };
    });
  } finally {
    clearTimeout(timeout);
  }
}

// ── Format scraped data as context ──────────────────────────────

function formatScrapedContext(
  results: { source: string; data: string | null; error: string | null }[]
): string {
  const parts: string[] = [];

  for (const r of results) {
    if (!r.data) continue;
    parts.push(`\n--- Source: ${r.source} ---`);
    // Limit each source to 1500 chars to keep prompt reasonable
    parts.push(r.data.slice(0, 1500));
  }

  return parts.length > 0
    ? `=== REAL INTERVIEW DATA SCRAPED FROM THE WEB ===\n${parts.join("\n")}`
    : "";
}

// ── Main route ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const { company, role, interviewType, roundType, skills, yearsExperience } =
      await req.json();

    // Step 1: Scrape real data via TinyFish (if API key available)
    let scrapedContext = "";
    if (TINYFISH_API_KEY) {
      console.log(`[research] Scraping interview data for ${company} ${role} via TinyFish...`);
      const scraped = await scrapeAllSources(company, role, TINYFISH_API_KEY);
      scrapedContext = formatScrapedContext(scraped);

      const ok = scraped.filter((s) => s.data).length;
      const fail = scraped.filter((s) => !s.data).length;
      console.log(`[research] Scraped ${ok} sources OK, ${fail} failed`);
    } else {
      console.log("[research] No TINYFISH_API_KEY — using AI knowledge only");
    }

    // Step 2: Build prompt with scraped context
    const contextBlock = scrapedContext
      ? `\nBelow is REAL interview data scraped from Reddit, LeetCode, Glassdoor, and GeeksForGeeks. Use this data as your PRIMARY source of information. Synthesize and structure it into the JSON format below. Prioritize real experiences over general knowledge.\n\n${scrapedContext}\n\n`
      : "";

    const prompt = `You are an interview research analyst. Provide detailed, accurate information about interviewing at ${company} for ${role} positions (${yearsExperience} years experience level).
${contextBlock}
Focus areas:
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
