import { NextRequest, NextResponse } from "next/server";
import { callGemini, extractJSON } from "@/lib/gemini";

const TINYFISH_API_URL = "https://agent.tinyfish.ai/v1/automation/run-sse";
const TINYFISH_API_KEY = process.env.TINYFISH_API_KEY || "";
const TINYFISH_RUN_URL = "https://agent.tinyfish.ai/v1/runs";

// TinyFish takes ~300 seconds per source
const SCRAPE_TIMEOUT_MS = 300_000;

// ── Config from user profile (mirrors config.json) ──────────────

interface ScrapeConfig {
  company: string;
  role: string;
  round_type: string;
  skills: string[];
  years_of_experience: string;
  job_description: string | null;
  country: string;
}

function buildConfig(body: {
  company: string;
  role: string;
  roundType?: string;
  skills?: string;
  yearsExperience?: string;
  jobDescription?: string;
  country?: string;
}): ScrapeConfig {
  return {
    company: body.company || "General",
    role: body.role || "Software Engineer",
    round_type: (body.roundType || "technical").toLowerCase(),
    skills: body.skills ? body.skills.split(",").map((s: string) => s.trim()) : [],
    years_of_experience: body.yearsExperience || "0-2",
    job_description: body.jobDescription || null,
    country: body.country || "",
  };
}

// ── Build query (same as scraper.py) ────────────────────────────

function buildQuery(config: ScrapeConfig): string {
  const parts = [config.company, config.role, config.round_type, "interview experience"];
  if (config.job_description) {
    parts.push(config.job_description.substring(0, 100));
  }
  return parts.join(" ");
}

// ── Scrape targets (matching scraper.py exactly) ────────────────

function getScrapeTargets(config: ScrapeConfig) {
  const q = buildQuery(config).replace(/ /g, "+");
  const companySlug = config.company.toLowerCase().replace(/ /g, "-");
  const roleSlug = config.role.toLowerCase().replace(/ /g, "-");

  return [
    // Reddit — same as scraper.py scrape_reddit()
    {
      source: "reddit",
      url: `https://www.reddit.com/search/?q=${q}&sort=relevance&t=year`,
      goal: `On this Reddit search page for ${config.company} ${config.role} ${config.round_type} interviews:
1. Find and extract the AI-generated summary at the top if available
2. Extract the top 5 post titles and their short descriptions visible on the page
Do NOT click into any posts or navigate away from this page.
Return as JSON:
{
  "company": "${config.company}",
  "role": "${config.role}",
  "round_type": "${config.round_type}",
  "source": "reddit",
  "ai_summary": "...",
  "top_posts": [{"title": "...", "snippet": "...", "url": "..."}]
}`,
    },
    // LeetCode Discuss — same as scraper.py scrape_leetcode()
    {
      source: "leetcode_discuss",
      url: `https://leetcode.com/discuss/interview-experience/?currentPage=1&orderBy=hot&query=${config.company}+${config.role}`,
      goal: `On this LeetCode Discuss page for ${config.company} ${config.role} interviews:
1. Extract the top 5 interview experience posts visible on the page
2. For each post get the title, short description/snippet, and url
Do NOT click into any posts or navigate away from this page.
Return as JSON:
{
  "company": "${config.company}",
  "role": "${config.role}",
  "round_type": "${config.round_type}",
  "source": "leetcode_discuss",
  "top_posts": [{"title": "...", "snippet": "...", "url": "..."}]
}`,
    },
    // IGotAnOffer — same as scraper.py scrape_igotanoffer()
    {
      source: "igotanoffer",
      url: `https://igotanoffer.com/blogs/tech/${companySlug}-${roleSlug}-interview`,
      goal: `On this IGotAnOffer page about ${config.company} ${config.role} interviews:
1. Extract the main interview process overview
2. Extract any specific interview questions mentioned
3. Extract any tips or preparation advice
Do NOT navigate away from this page.
Return as JSON:
{
  "company": "${config.company}",
  "role": "${config.role}",
  "round_type": "${config.round_type}",
  "source": "igotanoffer",
  "interview_overview": "...",
  "questions": ["question1", "question2"],
  "tips": ["tip1", "tip2"]
}`,
    },
    // GeeksForGeeks — same as scraper.py scrape_gfg()
    {
      source: "geeksforgeeks",
      url: `https://www.geeksforgeeks.org/search/?q=${(config.company + "+" + config.role + "+interview+experience").replace(/ /g, "+")}`,
      goal: `On this GeeksForGeeks search page for ${config.company} ${config.role} interview experiences:
1. Extract the top 5 interview experience articles visible on the page
2. For each get the title, snippet, and url
Do NOT click into any articles or navigate away from this page.
Return as JSON:
{
  "company": "${config.company}",
  "role": "${config.role}",
  "round_type": "${config.round_type}",
  "source": "geeksforgeeks",
  "top_posts": [{"title": "...", "snippet": "...", "url": "..."}]
}`,
    },
    // Glassdoor — same as scraper.py scrape_glassdoor()
    {
      source: "glassdoor",
      url: `https://www.glassdoor.com/Interview/${companySlug}-${roleSlug}-interview-questions-SRCH_KE0,${companySlug.length}_KO${companySlug.length + 1},${companySlug.length + 1 + roleSlug.length}.htm`,
      goal: `On this Glassdoor page for ${config.company} ${config.role} interview questions:
1. Extract the top 5 interview questions visible on the page
2. Extract any interview experience snippets or tips visible
Do NOT log in or navigate away from this page.
Return as JSON:
{
  "company": "${config.company}",
  "role": "${config.role}",
  "round_type": "${config.round_type}",
  "source": "glassdoor",
  "questions": ["question1", "question2"],
  "experiences": [{"snippet": "...", "rating": "..."}]
}`,
    },
  ];
}

// ── TinyFish SSE scraper (with run result fetch like scraper.py) ─

async function scrapeSingleSource(
  source: { source: string; url: string; goal: string },
  apiKey: string,
  signal?: AbortSignal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ source: string; data: any; error: string | null }> {
  try {
    console.log(`[tinyfish] Scraping ${source.source}...`);
    console.log(`[tinyfish]   URL: ${source.url}`);

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

    // Read SSE stream (like scraper.py's client.agent.stream)
    const reader = res.body?.getReader();
    if (!reader) {
      return { source: source.source, data: null, error: "No response body" };
    }

    const decoder = new TextDecoder();
    let textAccum = "";
    let runId: string | null = null;

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
          console.log(`[tinyfish]   Event: ${event.type}`);

          if (event.type === "COMPLETE") {
            // Like scraper.py: fetch run result for full data
            if (event.run_id) {
              runId = event.run_id;
            }
            // Also capture inline result
            if (event.result) {
              return {
                source: source.source,
                data: event.result,
                error: null,
              };
            }
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
      if (runId) break;
    }

    // If we got a run_id, fetch the full result (like scraper.py's fetch_run_result)
    if (runId) {
      try {
        const runRes = await fetch(`${TINYFISH_RUN_URL}/${runId}`, {
          headers: { "X-API-Key": apiKey },
        });
        if (runRes.ok) {
          const runData = await runRes.json();
          if (runData.result) {
            return { source: source.source, data: runData.result, error: null };
          }
        }
      } catch {
        // Fall through to text accumulation
      }
    }

    // Fall back to accumulated text
    if (textAccum) {
      try {
        return { source: source.source, data: JSON.parse(textAccum), error: null };
      } catch {
        return { source: source.source, data: textAccum, error: null };
      }
    }

    return { source: source.source, data: null, error: "No data returned" };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`[tinyfish]   Error: ${msg}`);
    return { source: source.source, data: null, error: msg };
  }
}

async function scrapeAllSources(config: ScrapeConfig, apiKey: string) {
  const targets = getScrapeTargets(config);

  // 300s timeout for TinyFish (it can be slow)
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);

  console.log(`[tinyfish] Starting scrape of ${targets.length} sources (timeout: ${SCRAPE_TIMEOUT_MS / 1000}s)...`);

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

// ── Format scraped data as context for Gemini ───────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatScrapedContext(results: { source: string; data: any; error: string | null }[]): string {
  const parts: string[] = [];

  for (const r of results) {
    if (!r.data) continue;
    parts.push(`\n--- Source: ${r.source} ---`);

    const dataStr = typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
    // Limit each source to 2000 chars
    parts.push(dataStr.slice(0, 2000));
  }

  return parts.length > 0
    ? `=== REAL INTERVIEW DATA SCRAPED FROM THE WEB ===\n${parts.join("\n")}`
    : "";
}

// ── Main route ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { company, role, interviewType, skills, yearsExperience, country } = body;

    // Build config from user profile (like config.json)
    const config = buildConfig(body);
    console.log(`[research] Config: ${JSON.stringify(config)}`);

    // Step 1: Scrape real data via TinyFish (if API key available)
    let scrapedContext = "";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scrapedResults: { source: string; data: any; error: string | null }[] = [];

    if (TINYFISH_API_KEY) {
      console.log(`[research] Scraping interview data for ${company} ${role} via TinyFish...`);
      scrapedResults = await scrapeAllSources(config, TINYFISH_API_KEY);
      scrapedContext = formatScrapedContext(scrapedResults);

      const ok = scrapedResults.filter((s) => s.data).length;
      const fail = scrapedResults.filter((s) => !s.data).length;
      console.log(`[research] Scraped ${ok} sources OK, ${fail} failed`);
      for (const r of scrapedResults) {
        console.log(`[research]   [${r.data ? "OK" : "FAIL"}] ${r.source}${r.error ? ` — ${r.error}` : ""}`);
      }
    } else {
      console.log("[research] No TINYFISH_API_KEY — using AI knowledge only");
    }

    // Step 2: Build prompt with scraped context
    const contextBlock = scrapedContext
      ? `\nBelow is REAL interview data scraped from Reddit, LeetCode, IGotAnOffer, Glassdoor, and GeeksForGeeks. Use this data as your PRIMARY source of information. Synthesize and structure it into the JSON format below. Prioritize real candidate experiences over general knowledge.\n\n${scrapedContext}\n\n`
      : "";

    const countryContext = country
      ? `\nIMPORTANT: The candidate is based in ${country}. Tailor your research to ${country}-specific interview practices, regional office processes, local hiring patterns, and any country-specific interview rounds or cultural expectations.`
      : "";

    const prompt = `You are an interview research analyst. Provide detailed, accurate information about interviewing at ${company} for ${role} positions (${yearsExperience} years experience, ${config.round_type} round).${countryContext}
${contextBlock}
Focus areas:
1. Interview format and rounds for ${config.round_type} at ${company}${country ? ` (specifically for ${country}-based candidates)` : ""}
2. Common questions asked (${interviewType || "mixed"} type)
3. Key skills tested: ${skills || "general programming"}
4. Difficulty level as reported by candidates
5. Tips from candidates who received offers
6. Common reasons for rejection
7. Timeline (how long the process takes)${country ? `\n8. ${country}-specific interview insights` : ""}

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
  "sources": ["Reddit", "LeetCode Discuss", "IGotAnOffer", "Glassdoor", "GeeksForGeeks"]
}`;

    const text = await callGemini(prompt);
    const research = extractJSON(text);

    // Return research + raw scraped data (for storage/display)
    return NextResponse.json({
      research,
      scrapedSources: scrapedResults.map((r) => ({
        source: r.source,
        hasData: !!r.data,
        error: r.error,
      })),
    });
  } catch (error) {
    console.error("Research error:", error);
    return NextResponse.json({ error: "Research failed" }, { status: 500 });
  }
}
