// ============================================================
// AI CLIENT — Uses InsForge Model Gateway
// ============================================================

const INSFORGE_URL = process.env.INSFORGE_PROJECT_URL || "";
const INSFORGE_KEY = process.env.INSFORGE_API_KEY || "";
const AI_MODEL = process.env.AI_MODEL || "google/gemini-2.5-flash-lite";

export async function callGemini(prompt: string): Promise<string> {
  if (!INSFORGE_URL || !INSFORGE_KEY) {
    throw new Error("INSFORGE_PROJECT_URL or INSFORGE_API_KEY not set in .env.local");
  }

  const url = `${INSFORGE_URL}/api/ai/chat/completion`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${INSFORGE_KEY}`,
    },
    body: JSON.stringify({
      model: AI_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 8192,
      temperature: 0.7,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`InsForge AI ${res.status}: ${err}`);
  }

  const data = await res.json();
  // InsForge returns { text: "...", metadata: { model, usage } }
  return data.text || "";
}

export function extractJSON(text: string): Record<string, unknown> {
  // Try to find JSON in the response (handles markdown code fences too)
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  try {
    return JSON.parse(match[0]);
  } catch {
    // Try to fix common JSON issues: trailing commas, unescaped newlines in strings
    const fixed = match[0]
      .replace(/,\s*([\]}])/g, "$1") // trailing commas
      .replace(/[\x00-\x1f]/g, (ch) => ch === "\n" ? "\\n" : ch === "\t" ? "\\t" : ""); // control chars in strings
    return JSON.parse(fixed);
  }
}
