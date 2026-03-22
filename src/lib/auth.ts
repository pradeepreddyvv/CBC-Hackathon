import { SignJWT, jwtVerify } from "jose";
import { hash, compare } from "bcryptjs";
import { Pool } from "pg";
import { NextRequest, NextResponse } from "next/server";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "interview-coach-secret-key-2026");

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

// ── Password Hashing ────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  return hash(password, 10);
}

export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
  return compare(password, hashed);
}

// ── JWT ─────────────────────────────────────────────────────
export async function createToken(userId: string): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{ userId: string } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as string };
  } catch {
    return null;
  }
}

// ── Cookie Helpers ──────────────────────────────────────────
export function setAuthCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set("auth_token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: "/",
  });
  return response;
}

export async function getAuthFromRequest(req: NextRequest): Promise<{ userId: string } | null> {
  const token = req.cookies.get("auth_token")?.value;
  if (!token) return null;
  return verifyToken(token);
}

// ── DB Auth Functions ───────────────────────────────────────
export async function findUserByEmail(email: string) {
  const p = getPool();
  const res = await p.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  return res.rows[0] || null;
}

export async function createUserWithEmail(email: string, passwordHash: string, name: string) {
  const p = getPool();
  const res = await p.query(
    `INSERT INTO users (id, email, password_hash, name)
     VALUES (gen_random_uuid()::text, $1, $2, $3)
     RETURNING id, email, name, avatar_url, onboarded`,
    [email.toLowerCase(), passwordHash, name]
  );
  return res.rows[0];
}

export async function findOrCreateGoogleUser(googleId: string, email: string, name: string, avatarUrl: string) {
  const p = getPool();
  // Try by google_id first
  let res = await p.query("SELECT * FROM users WHERE google_id = $1", [googleId]);
  if (res.rows[0]) return res.rows[0];

  // Try by email (link existing account)
  res = await p.query("SELECT * FROM users WHERE email = $1", [email.toLowerCase()]);
  if (res.rows[0]) {
    await p.query("UPDATE users SET google_id = $1, avatar_url = $2 WHERE id = $3", [googleId, avatarUrl, res.rows[0].id]);
    return { ...res.rows[0], google_id: googleId, avatar_url: avatarUrl };
  }

  // Create new
  res = await p.query(
    `INSERT INTO users (id, email, google_id, name, avatar_url)
     VALUES (gen_random_uuid()::text, $1, $2, $3, $4)
     RETURNING id, email, name, avatar_url, onboarded`,
    [email.toLowerCase(), googleId, name, avatarUrl]
  );
  return res.rows[0];
}

export async function getUserById(userId: string) {
  const p = getPool();
  const res = await p.query(
    `SELECT id, email, name, avatar_url, background, target_role, target_company,
            experience, skills, resume_text, llm_context, target_roles,
            interview_type, onboarded, country
     FROM users WHERE id = $1`,
    [userId]
  );
  return res.rows[0] || null;
}

export async function updateUserProfile(userId: string, data: Record<string, unknown>) {
  const p = getPool();
  const fields: string[] = [];
  const values: unknown[] = [];
  let idx = 1;

  const allowed = [
    "name", "background", "target_role", "target_company", "experience",
    "skills", "resume_text", "llm_context", "target_roles", "interview_type", "onboarded", "country"
  ];

  for (const key of allowed) {
    if (data[key] !== undefined) {
      fields.push(`${key} = $${idx}`);
      values.push(data[key]);
      idx++;
    }
  }

  if (fields.length === 0) return;
  values.push(userId);
  await p.query(
    `UPDATE users SET ${fields.join(", ")}, updated_at = NOW() WHERE id = $${idx}`,
    values
  );
}
