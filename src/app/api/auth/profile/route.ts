import { NextRequest, NextResponse } from "next/server";
import { getAuthFromRequest, updateUserProfile } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const auth = await getAuthFromRequest(req);
  if (!auth) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const data = await req.json();
    await updateUserProfile(auth.userId, data);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Profile update error:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
