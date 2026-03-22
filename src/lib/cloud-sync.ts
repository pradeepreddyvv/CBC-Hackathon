// ============================================================
// CLOUD SYNC — Syncs local data to InsForge PostgreSQL
// Provides dual-write: saves locally AND to cloud
// ============================================================

const DB_API = "/api/db";

async function dbCall(action: string, data: Record<string, unknown> = {}) {
  try {
    const res = await fetch(DB_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
    if (!res.ok) {
      console.warn(`Cloud sync failed for ${action}:`, res.status);
      return null;
    }
    return await res.json();
  } catch (e) {
    console.warn(`Cloud sync error for ${action}:`, e);
    return null;
  }
}

// ── User Management ─────────────────────────────────────────
export async function cloudGetOrCreateUser(name: string): Promise<string | null> {
  const result = await dbCall("get_or_create_user", { name });
  return result?.userId || null;
}

export async function cloudSaveProfile(userId: string, profile: {
  name: string; background: string; targetRole: string;
  targetCompany: string; experience: string; skills: string;
}) {
  return dbCall("save_profile", { userId, profile });
}

// ── Session Sync ────────────────────────────────────────────
export async function cloudSaveSession(userId: string, session: {
  id: string; company: string; role: string; answerCount: number;
  avgScore: number; weakAreas: string[]; sessionNumber: number;
  sessionSummary?: Record<string, unknown>;
  generatedQuestions?: unknown[];
  interviewType?: string;
  roundType?: string;
  researchContext?: Record<string, unknown>;
  sessionConfig?: Record<string, unknown>;
}) {
  return dbCall("save_session", { userId, session });
}

// ── Answer Sync ─────────────────────────────────────────────
export async function cloudSaveAnswer(userId: string, answer: {
  id: string; sessionId: string; questionId: string; questionText: string;
  category: string; type: string; answer: string;
  feedback: Record<string, unknown>; durationSec: number;
  transcript?: string;
}) {
  return dbCall("save_answer", { userId, answer });
}

// ── Load Full Profile from Cloud ────────────────────────────
export async function cloudLoadFullProfile(userId: string) {
  return dbCall("load_full_profile", { userId });
}

// ── Stats ───────────────────────────────────────────────────
export async function cloudGetStats(userId: string) {
  return dbCall("get_stats", { userId });
}

export async function cloudGetWeakAreas(userId: string) {
  const result = await dbCall("get_weak_areas", { userId });
  return result?.weakAreas || [];
}
