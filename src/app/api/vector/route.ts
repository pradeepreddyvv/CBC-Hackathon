import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

const GEMINI_KEY = process.env.GEMINI_API_KEY || "";
const EMB_MODEL = "gemini-embedding-001";
const EMB_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMB_MODEL}:embedContent?key=${GEMINI_KEY}`;

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

async function getEmbedding(text: string): Promise<number[] | null> {
  try {
    const res = await fetch(EMB_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${EMB_MODEL}`,
        content: { parts: [{ text }] },
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding?.values || null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── Find similar questions to user's weak areas ──
      case "find_similar_questions": {
        const { query, limit = 5 } = body;
        const emb = await getEmbedding(query);
        if (!emb) return NextResponse.json({ error: "Embedding failed" }, { status: 500 });

        const p = getPool();
        const res = await p.query(
          `SELECT question_text, category, type, difficulty,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM question_embeddings
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [JSON.stringify(emb), limit]
        );
        return NextResponse.json({ questions: res.rows });
      }

      // ── Save answer embedding for future comparison ──
      case "embed_answer": {
        const { userId, answerId, questionText, answerText, score } = body;
        const emb = await getEmbedding(answerText);
        if (!emb) return NextResponse.json({ error: "Embedding failed" }, { status: 500 });

        const p = getPool();
        await p.query(
          `INSERT INTO answer_embeddings (user_id, answer_id, question_text, answer_text, score, embedding)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [userId, answerId, questionText, answerText, score, JSON.stringify(emb)]
        );
        return NextResponse.json({ ok: true });
      }

      // ── Compare answer to similar high-scoring answers ──
      case "find_similar_answers": {
        const { answerText, limit: lim = 3 } = body;
        const emb = await getEmbedding(answerText);
        if (!emb) return NextResponse.json({ error: "Embedding failed" }, { status: 500 });

        const p = getPool();
        const res = await p.query(
          `SELECT question_text, answer_text, score,
                  1 - (embedding <=> $1::vector) AS similarity
           FROM answer_embeddings
           WHERE score >= 75
           ORDER BY embedding <=> $1::vector
           LIMIT $2`,
          [JSON.stringify(emb), lim]
        );
        return NextResponse.json({ similarAnswers: res.rows });
      }

      // ── Get personalized question recommendations ──
      case "recommend_questions": {
        const { userId, weakAreas, limit: recLimit = 5 } = body;
        // Combine weak areas into a query
        const query = `Interview questions targeting: ${(weakAreas || []).join(", ")}`;
        const emb = await getEmbedding(query);
        if (!emb) return NextResponse.json({ error: "Embedding failed" }, { status: 500 });

        const p = getPool();
        // Find questions similar to weak area description, excluding already answered
        const answeredRes = await p.query(
          "SELECT DISTINCT question_text FROM answer_embeddings WHERE user_id = $1",
          [userId]
        );
        const answered = answeredRes.rows.map(r => r.question_text);

        let sql = `SELECT question_text, category, type, difficulty,
                          1 - (embedding <=> $1::vector) AS relevance
                   FROM question_embeddings`;
        const params: (string | number)[] = [JSON.stringify(emb)];

        if (answered.length > 0) {
          sql += ` WHERE question_text NOT IN (${answered.map((_, i) => `$${i + 2}`).join(",")})`;
          params.push(...answered);
        }

        sql += ` ORDER BY embedding <=> $1::vector LIMIT $${params.length + 1}`;
        params.push(recLimit);

        const res = await p.query(sql, params);
        return NextResponse.json({ recommendations: res.rows });
      }

      // ── Save ideal answer for comparison ──
      case "save_ideal_answer": {
        const { questionText, idealAnswer } = body;
        const emb = await getEmbedding(idealAnswer);
        if (!emb) return NextResponse.json({ error: "Embedding failed" }, { status: 500 });

        const p = getPool();
        await p.query(
          `INSERT INTO ideal_answer_embeddings (question_text, ideal_answer, embedding)
           VALUES ($1, $2, $3)`,
          [questionText, idealAnswer, JSON.stringify(emb)]
        );
        return NextResponse.json({ ok: true });
      }

      // ── Compare user answer to ideal answers ──
      case "compare_to_ideal": {
        const { answerText: userAnswer, questionText: qt } = body;
        const emb = await getEmbedding(userAnswer);
        if (!emb) return NextResponse.json({ error: "Embedding failed" }, { status: 500 });

        const p = getPool();
        const res = await p.query(
          `SELECT ideal_answer, 1 - (embedding <=> $1::vector) AS similarity
           FROM ideal_answer_embeddings
           WHERE question_text = $2
           ORDER BY embedding <=> $1::vector
           LIMIT 1`,
          [JSON.stringify(emb), qt]
        );

        if (res.rows.length > 0) {
          return NextResponse.json({
            idealAnswer: res.rows[0].ideal_answer,
            similarity: res.rows[0].similarity,
          });
        }
        return NextResponse.json({ idealAnswer: null, similarity: 0 });
      }

      // ── Stats ──
      case "vector_stats": {
        const p = getPool();
        const [qCount, aCount, iCount] = await Promise.all([
          p.query("SELECT COUNT(*) FROM question_embeddings"),
          p.query("SELECT COUNT(*) FROM answer_embeddings"),
          p.query("SELECT COUNT(*) FROM ideal_answer_embeddings"),
        ]);
        return NextResponse.json({
          questions: parseInt(qCount.rows[0].count),
          answers: parseInt(aCount.rows[0].count),
          idealAnswers: parseInt(iCount.rows[0].count),
        });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Vector API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Vector search error" },
      { status: 500 }
    );
  }
}
