import { NextRequest, NextResponse } from "next/server";

const SPEECHMATICS_BASE = "https://asr.api.speechmatics.com/v2";
const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 60;

type Turn = {
  speaker: string;
  text: string;
};

type TranscriptToken = {
  type?: string;
  speaker?: string;
  alternatives?: Array<{ content?: string }>;
};

function appendTokenWithSpacing(existing: string, token: string): string {
  const punctuation = /^(\.|,|!|\?|;|:|\)|\]|\}|"|'|%|\u2026)$/;
  if (!existing) return token;
  if (punctuation.test(token)) return `${existing}${token}`;
  return `${existing} ${token}`;
}

function buildTurnsFromJsonV2(payload: unknown): { transcript: string; turns: Turn[] } {
  const results = (payload as { results?: TranscriptToken[] })?.results || [];
  const turns: Turn[] = [];
  let fullTranscript = "";

  for (const token of results) {
    if (token?.type !== "word" && token?.type !== "punctuation") continue;
    const content = token?.alternatives?.[0]?.content?.trim();
    if (!content) continue;

    const speaker = token?.speaker || "Unknown";
    fullTranscript = appendTokenWithSpacing(fullTranscript, content);

    const last = turns[turns.length - 1];
    if (!last || last.speaker !== speaker) {
      turns.push({ speaker, text: content });
    } else {
      last.text = appendTokenWithSpacing(last.text, content);
    }
  }

  return {
    transcript: fullTranscript.trim(),
    turns: turns.filter(t => t.text.trim().length > 0),
  };
}

async function createSpeechmaticsJob(file: File, language: string, apiKey: string): Promise<string> {
  const config = {
    type: "transcription",
    transcription_config: {
      language,
      diarization: "speaker",
      operating_point: "enhanced",
      enable_entities: true,
    },
  };

  const body = new FormData();
  body.append("config", JSON.stringify(config));
  body.append("data_file", file, file.name || "interview.webm");

  const res = await fetch(`${SPEECHMATICS_BASE}/jobs`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body,
  });

  if (!res.ok) {
    const message = await res.text();
    throw new Error(`Speechmatics create job failed (${res.status}): ${message}`);
  }

  const data = await res.json() as { id?: string; job?: { id?: string } };
  const jobId = data.id || data.job?.id;
  if (!jobId) throw new Error("Speechmatics did not return a job id");
  return jobId;
}

async function waitForJobCompletion(jobId: string, apiKey: string): Promise<void> {
  for (let i = 0; i < MAX_POLLS; i++) {
    const res = await fetch(`${SPEECHMATICS_BASE}/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const message = await res.text();
      throw new Error(`Speechmatics job status failed (${res.status}): ${message}`);
    }

    const data = await res.json() as { job?: { status?: string; errors?: Array<{ message?: string }> } };
    const status = (data.job?.status || "").toLowerCase();

    if (["done", "completed", "transcribed"].includes(status)) return;
    if (["rejected", "failed", "error", "expired"].includes(status)) {
      const errorMessage = data.job?.errors?.map(e => e?.message).filter(Boolean).join("; ") || "Unknown transcription failure";
      throw new Error(`Speechmatics job failed: ${errorMessage}`);
    }

    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new Error("Speechmatics transcription timed out. Try a shorter recording or retry.");
}

async function fetchTranscript(jobId: string, apiKey: string): Promise<{ transcript: string; turns: Turn[] }> {
  const jsonV2Res = await fetch(`${SPEECHMATICS_BASE}/jobs/${jobId}/transcript?format=json-v2`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (jsonV2Res.ok) {
    const jsonV2 = await jsonV2Res.json();
    const parsed = buildTurnsFromJsonV2(jsonV2);
    if (parsed.transcript) return parsed;
  }

  const txtRes = await fetch(`${SPEECHMATICS_BASE}/jobs/${jobId}/transcript?format=txt`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    cache: "no-store",
  });

  if (!txtRes.ok) {
    const message = await txtRes.text();
    throw new Error(`Speechmatics transcript fetch failed (${txtRes.status}): ${message}`);
  }

  const text = await txtRes.text();
  return {
    transcript: text.trim(),
    turns: [],
  };
}

export async function POST(req: NextRequest) {
  try {
    const apiKey = process.env.SPEECHMATICS_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Set SPEECHMATICS_API_KEY in .env.local" }, { status: 500 });
    }

    const formData = await req.formData();
    const file = formData.get("file");
    const language = String(formData.get("language") || "en");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Audio file is required" }, { status: 400 });
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Audio file is empty" }, { status: 400 });
    }

    const jobId = await createSpeechmaticsJob(file, language, apiKey);
    await waitForJobCompletion(jobId, apiKey);
    const transcriptData = await fetchTranscript(jobId, apiKey);

    return NextResponse.json({
      jobId,
      transcript: transcriptData.transcript,
      turns: transcriptData.turns,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown transcription error";
    console.error("Transcribe API error:", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
