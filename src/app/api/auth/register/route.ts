import { NextRequest, NextResponse } from "next/server";
import { hashPassword, createUserWithEmail, findUserByEmail, createToken, setAuthCookie } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password || !name) {
      return NextResponse.json({ error: "Email, password, and name are required" }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Password must be at least 6 characters" }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 409 });
    }

    const passwordHash = await hashPassword(password);
    const user = await createUserWithEmail(email, passwordHash, name);
    const token = await createToken(user.id);

    const response = NextResponse.json({
      user: { id: user.id, email: user.email, name: user.name, onboarded: false },
    });
    return setAuthCookie(response, token);
  } catch (error) {
    console.error("Register error:", error);
    return NextResponse.json({ error: "Registration failed" }, { status: 500 });
  }
}
