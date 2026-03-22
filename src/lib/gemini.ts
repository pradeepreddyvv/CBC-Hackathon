// ============================================================
// GEMINI API CLIENT — lightweight, no SDK needed
// ============================================================

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

export async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY;
  if (!apiKey) throw new Error("Set GEMINI_API_KEY (or GEMINI_KEY) in .env.local");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 4096,
        temperature: 0.7,
      },
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API ${res.status}: ${err}`);
  }

  const data = await res.json();
  const parts = data.candidates?.[0]?.content?.parts || [];
  // Skip thinking parts, get the text
  const text = parts.find((p: { text?: string; thought?: boolean }) => p.text && !p.thought)?.text
    || parts[parts.length - 1]?.text || "";
  return text;
}

export function extractJSON(text: string): Record<string, unknown> {
  // Try to find JSON in the response (handles markdown code fences too)
  const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("No JSON found in response");
  return JSON.parse(match[0]);
}
