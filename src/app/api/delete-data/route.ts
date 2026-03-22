import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest } from "@/lib/auth";
import { Pool } from "pg";

let pool: Pool | null = null;
function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.INSFORGE_DB_URL,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
  }
  return pool;
}

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userId = auth.userId;
  const p = getPool();

  try {
    // Delete in order respecting foreign key constraints
    await p.query("DELETE FROM weak_areas WHERE user_id = $1", [userId]);
    await p.query("DELETE FROM answers WHERE user_id = $1", [userId]);
    await p.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
    // Clear user profile fields but keep the account
    await p.query(
      `UPDATE users SET background = NULL, experience = NULL, skills = NULL,
       target_role = NULL, target_company = NULL, country = NULL WHERE id = $1`,
      [userId]
    );

    return NextResponse.json({ ok: true, message: "All interview data deleted" });
  } catch (err) {
    console.error("Delete data error:", err);
    return NextResponse.json({ error: "Failed to delete data" }, { status: 500 });
  }
}
