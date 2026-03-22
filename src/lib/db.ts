// ============================================================
// InsForge PostgreSQL Database Layer
// Persistent cloud database replacing localStorage
// ============================================================
import { Pool } from "pg";

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.INSFORGE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 5,
    });
  }
  return pool;
}

// ── User Profile ────────────────────────────────────────────
export async function dbGetOrCreateUser(name: string): Promise<string> {
  const p = getPool();
  // Try to find existing user by name
  const existing = await p.query("SELECT id FROM users WHERE name = $1 LIMIT 1", [name]);
  if (existing.rows.length > 0) return existing.rows[0].id;

  // Create new user
  const res = await p.query(
    "INSERT INTO users (id, name) VALUES (gen_random_uuid()::text, $1) RETURNING id",
    [name]
  );
  return res.rows[0].id;
}

export async function dbSaveUserProfile(userId: string, profile: {
  name: string; background: string; targetRole: string;
  targetCompany: string; experience: string; skills: string;
}) {
  const p = getPool();
  await p.query(
    `UPDATE users SET name=$1, background=$2, target_role=$3, target_company=$4,
     experience=$5, skills=$6, updated_at=NOW() WHERE id=$7`,
    [profile.name, profile.background, profile.targetRole,
     profile.targetCompany, profile.experience, profile.skills, userId]
  );
}

export async function dbGetUserProfile(userId: string) {
  const p = getPool();
  const res = await p.query("SELECT * FROM users WHERE id = $1", [userId]);
  if (res.rows.length === 0) return null;
  const r = res.rows[0];
  return {
    id: r.id,
    name: r.name,
    background: r.background,
    targetRole: r.target_role,
    targetCompany: r.target_company,
    experience: r.experience,
    skills: r.skills,
  };
}

// ── Sessions ────────────────────────────────────────────────
export async function dbSaveSession(userId: string, session: {
  id: string; company: string; role: string; answerCount: number;
  avgScore: number; weakAreas: string[]; sessionNumber: number;
  sessionSummary?: Record<string, unknown>;
  generatedQuestions?: unknown[];
  interviewType?: string;
  roundType?: string;
  researchContext?: Record<string, unknown>;
  sessionConfig?: Record<string, unknown>;
}) {
  const p = getPool();
  await p.query(
    `INSERT INTO sessions (id, user_id, company, role, answer_count, avg_score, weak_areas, session_number, session_summary, generated_questions, interview_type, round_type, research_context, session_config)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (id) DO UPDATE SET
       answer_count=$5, avg_score=$6, weak_areas=$7, session_summary=$9,
       generated_questions=COALESCE($10, sessions.generated_questions),
       session_config=COALESCE($14, sessions.session_config),
       completed_at=NOW()`,
    [session.id, userId, session.company, session.role,
     session.answerCount, session.avgScore, session.weakAreas,
     session.sessionNumber,
     session.sessionSummary ? JSON.stringify(session.sessionSummary) : null,
     session.generatedQuestions ? JSON.stringify(session.generatedQuestions) : null,
     session.interviewType || '',
     session.roundType || '',
     session.researchContext ? JSON.stringify(session.researchContext) : null,
     session.sessionConfig ? JSON.stringify(session.sessionConfig) : null]
  );
}

export async function dbGetSessions(userId: string) {
  const p = getPool();
  const res = await p.query(
    "SELECT * FROM sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50",
    [userId]
  );
  return res.rows.map(r => ({
    id: r.id,
    company: r.company,
    role: r.role,
    startedAt: r.started_at,
    completedAt: r.completed_at,
    answerCount: r.answer_count,
    avgScore: r.avg_score,
    weakAreas: r.weak_areas || [],
    sessionNumber: r.session_number,
    sessionSummary: r.session_summary,
    generatedQuestions: r.generated_questions || [],
    interviewType: r.interview_type,
    roundType: r.round_type,
    researchContext: r.research_context,
    sessionConfig: r.session_config,
  }));
}

// ── Answers ─────────────────────────────────────────────────
export async function dbSaveAnswer(userId: string, answer: {
  id: string; sessionId: string; questionId: string; questionText: string;
  category: string; type: string; answer: string;
  feedback: Record<string, unknown>; durationSec: number;
  transcript?: string;
}) {
  const p = getPool();
  await p.query(
    `INSERT INTO answers (id, session_id, user_id, question_id, question_text, category, type, answer_text, feedback, duration_sec, transcript)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO NOTHING`,
    [answer.id, answer.sessionId, userId, answer.questionId, answer.questionText,
     answer.category, answer.type, answer.answer, JSON.stringify(answer.feedback), answer.durationSec,
     answer.transcript || answer.answer]
  );
}

export async function dbGetAnswers(userId: string, limit = 100) {
  const p = getPool();
  const res = await p.query(
    "SELECT * FROM answers WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2",
    [userId, limit]
  );
  return res.rows.map(r => ({
    id: r.id,
    sessionId: r.session_id,
    questionId: r.question_id,
    questionText: r.question_text,
    category: r.category,
    type: r.type,
    answer: r.answer_text,
    transcript: r.transcript || r.answer_text,
    feedback: r.feedback,
    durationSec: r.duration_sec,
    timestamp: r.created_at,
  }));
}

// ── Weak Areas ──────────────────────────────────────────────
export async function dbUpdateWeakAreas(userId: string, areas: string[], score: number) {
  const p = getPool();
  const scoreInt = Math.round(Number(score) || 0);
  for (const area of areas) {
    await p.query(
      `INSERT INTO weak_areas (user_id, area, total_occurrences, score_history, avg_score, last_seen)
       VALUES ($1, $2, 1, ARRAY[$3::int], $3::int, NOW())
       ON CONFLICT (user_id, area) DO UPDATE SET
         total_occurrences = weak_areas.total_occurrences + 1,
         score_history = array_append(weak_areas.score_history, $3::int),
         avg_score = (SELECT ROUND(AVG(v))::int FROM unnest(array_append(weak_areas.score_history, $3::int)) AS v),
         last_seen = NOW(),
         trend = CASE
           WHEN array_length(weak_areas.score_history, 1) >= 3 THEN
             CASE WHEN $3::int > weak_areas.avg_score + 5 THEN 'improving'
                  WHEN $3::int < weak_areas.avg_score - 5 THEN 'declining'
                  ELSE 'stable' END
           ELSE 'stable' END`,
      [userId, area, scoreInt]
    );
  }
}

export async function dbGetWeakAreas(userId: string) {
  const p = getPool();
  const res = await p.query(
    "SELECT * FROM weak_areas WHERE user_id = $1 ORDER BY avg_score ASC",
    [userId]
  );
  return res.rows.map(r => ({
    area: r.area,
    totalOccurrences: r.total_occurrences,
    scoreHistory: r.score_history || [],
    avgScore: r.avg_score,
    trend: r.trend,
    lastSeen: r.last_seen,
  }));
}

// ── Stats ───────────────────────────────────────────────────
export async function dbGetStats(userId: string) {
  const p = getPool();
  const answers = await p.query(
    "SELECT COUNT(*) as count, COALESCE(AVG((feedback->>'overall_score')::int), 0) as avg_score FROM answers WHERE user_id = $1",
    [userId]
  );
  const sessions = await p.query(
    "SELECT COUNT(*) as count FROM sessions WHERE user_id = $1",
    [userId]
  );
  return {
    totalAnswers: parseInt(answers.rows[0].count),
    avgScore: Math.round(parseFloat(answers.rows[0].avg_score)),
    totalSessions: parseInt(sessions.rows[0].count),
  };
}
