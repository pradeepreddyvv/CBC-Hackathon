import { NextResponse } from "next/server";

const SM_API_KEY = process.env.NEXT_PUBLIC_SPEECHMATICS_API_KEY || "";

export async function POST() {
  if (!SM_API_KEY) {
    return NextResponse.json({ error: "No Speechmatics API key configured" }, { status: 500 });
  }

  try {
    const res = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SM_API_KEY}`,
      },
      body: JSON.stringify({ ttl: 300 }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[speechmatics] Temp key error:", res.status, text);
      return NextResponse.json({ error: `Speechmatics auth failed: ${res.status}` }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json({ key_value: data.key_value });
  } catch (error) {
    console.error("[speechmatics] Temp key error:", error);
    return NextResponse.json({ error: "Failed to get temporary key" }, { status: 500 });
  }
}
