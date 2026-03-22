import { NextRequest, NextResponse } from "next/server";
import {
  dbGetOrCreateUser, dbSaveUserProfile, dbGetUserProfile,
  dbSaveSession, dbGetSessions,
  dbSaveAnswer, dbGetAnswers,
  dbUpdateWeakAreas, dbGetWeakAreas, dbGetStats,
} from "@/lib/db";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      // ── User Profile ──
      case "get_or_create_user": {
        const userId = await dbGetOrCreateUser(body.name);
        const profile = await dbGetUserProfile(userId);
        return NextResponse.json({ userId, profile });
      }

      case "save_profile": {
        await dbSaveUserProfile(body.userId, body.profile);
        return NextResponse.json({ ok: true });
      }

      case "get_profile": {
        const profile = await dbGetUserProfile(body.userId);
        return NextResponse.json({ profile });
      }

      // ── Sessions ──
      case "save_session": {
        await dbSaveSession(body.userId, body.session);
        return NextResponse.json({ ok: true });
      }

      case "get_sessions": {
        const sessions = await dbGetSessions(body.userId);
        return NextResponse.json({ sessions });
      }

      // ── Answers ──
      case "save_answer": {
        await dbSaveAnswer(body.userId, body.answer);
        // Also update weak areas
        if (body.answer.feedback?.weak_areas?.length > 0) {
          await dbUpdateWeakAreas(
            body.userId,
            body.answer.feedback.weak_areas,
            body.answer.feedback.overall_score || 0
          );
        }
        return NextResponse.json({ ok: true });
      }

      case "get_answers": {
        const answers = await dbGetAnswers(body.userId, body.limit || 100);
        return NextResponse.json({ answers });
      }

      // ── Weak Areas ──
      case "get_weak_areas": {
        const weakAreas = await dbGetWeakAreas(body.userId);
        return NextResponse.json({ weakAreas });
      }

      // ── Stats ──
      case "get_stats": {
        const stats = await dbGetStats(body.userId);
        return NextResponse.json({ stats });
      }

      // ── Full Profile Load (for initial page load) ──
      case "load_full_profile": {
        const [profile, sessions, answers, weakAreas, stats] = await Promise.all([
          dbGetUserProfile(body.userId),
          dbGetSessions(body.userId),
          dbGetAnswers(body.userId, 500),
          dbGetWeakAreas(body.userId),
          dbGetStats(body.userId),
        ]);
        return NextResponse.json({ profile, sessions, answers, weakAreas, stats });
      }

      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (error) {
    console.error("DB API error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Database error" },
      { status: 500 }
    );
  }
}
