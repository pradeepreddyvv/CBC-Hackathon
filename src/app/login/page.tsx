"use client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>

      {/* Glow */}
      <div style={{ position: "absolute", top: -300, left: "35%", width: 1000, height: 1000, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(34,211,238,0.08) 0%, rgba(129,140,248,0.05) 40%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -200, right: -100, width: 600, height: 600, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(129,140,248,0.07) 0%, transparent 65%)", pointerEvents: "none" }} />

      {/* Nav */}
      <nav style={{ position: "relative", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "28px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: "linear-gradient(135deg, #22d3ee, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: "var(--heading)", letterSpacing: "-0.01em" }}>InterviewCoach</span>
        </div>
        <button onClick={() => router.push("/login/signin?mode=login")} style={{ padding: "13px 32px", borderRadius: 999, background: "transparent", border: "1px solid var(--border-hi)", color: "var(--text)", fontSize: 17, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
          Sign in
        </button>
      </nav>

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", position: "relative", zIndex: 5, padding: "0 72px 72px" }}>
        <div style={{ width: "100%", maxWidth: 1400, display: "flex", gap: 80, alignItems: "center", margin: "0 auto" }}>

          {/* LEFT — hero */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 9, padding: "9px 18px", borderRadius: 999, background: "rgba(34,211,238,0.08)", border: "1px solid rgba(34,211,238,0.2)", marginBottom: 36 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#22d3ee" }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: "#22d3ee", letterSpacing: "0.03em" }}>Live AI feedback</span>
            </div>

            <h1 style={{ fontSize: 98, fontWeight: 900, color: "var(--heading)", lineHeight: 1.0, letterSpacing: "-0.05em", margin: "0 0 36px" }}>
              Interview like<br />you&apos;ve done it<br />
              <span style={{ background: "linear-gradient(90deg, #22d3ee, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>100 times.</span>
            </h1>

            <p style={{ fontSize: 22, color: "var(--text-sec)", lineHeight: 1.6, marginBottom: 52, maxWidth: 480 }}>
              Practice real questions, hear your answers back, and get scored instantly. No fluff — just targeted coaching that moves the needle.
            </p>

            <div style={{ display: "flex", gap: 16 }}>
              <button onClick={() => router.push("/login/signin?mode=register")} style={{ padding: "20px 48px", borderRadius: 18, background: "linear-gradient(135deg, #22d3ee, #818cf8)", color: "white", fontSize: 20, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit", letterSpacing: "-0.01em" }}>
                Get started free
              </button>
              <button onClick={() => router.push("/login/signin?mode=login")} style={{ padding: "20px 48px", borderRadius: 18, background: "var(--surface)", border: "1px solid var(--border-hi)", color: "var(--text-sec)", fontSize: 20, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                Sign in
              </button>
            </div>
          </div>

          {/* RIGHT — bento cards */}
          <div style={{ width: 600, flexShrink: 0, display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Question card */}
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 28, padding: "36px 40px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tert)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 16 }}>Question 3 of 5</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: "var(--text)", lineHeight: 1.5, marginBottom: 22 }}>
                &ldquo;Describe a situation where you had to make a decision with incomplete information.&rdquo;
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <span style={{ padding: "7px 18px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "rgba(34,211,238,0.12)", color: "#22d3ee", border: "1px solid rgba(34,211,238,0.2)" }}>Behavioral</span>
                <span style={{ padding: "7px 18px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "rgba(129,140,248,0.12)", color: "#a5b4fc", border: "1px solid rgba(129,140,248,0.2)" }}>Decision-making</span>
                <span style={{ padding: "7px 18px", borderRadius: 999, fontSize: 15, fontWeight: 600, background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.45)", border: "1px solid rgba(255,255,255,0.1)" }}>Hard</span>
              </div>
            </div>

            {/* Recording card */}
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 28, padding: "36px 40px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tert)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 24 }}>Your Recording</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, height: 64, marginBottom: 20 }}>
                {[12,26,16,40,18,50,30,44,14,36,24,13,30,46,12,32,44,16,28,10,22,38,18,48,14,40,26,50,12,32].map((h, i) => (
                  <div key={i} style={{ width: 5, height: h, borderRadius: 3, background: "linear-gradient(180deg, #22d3ee, #818cf8)", flexShrink: 0 }} />
                ))}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
                <span style={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }}>Recording — 0:38</span>
              </div>
            </div>

            {/* Session stats card */}
            <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 28, padding: "36px 40px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-tert)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 26 }}>Session Stats</div>
              <div style={{ display: "flex", justifyContent: "space-around" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 58, fontWeight: 800, color: "#22d3ee", letterSpacing: "-0.04em", lineHeight: 1 }}>89</div>
                  <div style={{ fontSize: 15, color: "var(--text-tert)", marginTop: 10 }}>avg score</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 58, fontWeight: 800, color: "#818cf8", letterSpacing: "-0.04em", lineHeight: 1 }}>5</div>
                  <div style={{ fontSize: 15, color: "var(--text-tert)", marginTop: 10 }}>questions</div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 58, fontWeight: 800, color: "#34d399", letterSpacing: "-0.04em", lineHeight: 1 }}>+12%</div>
                  <div style={{ fontSize: 15, color: "var(--text-tert)", marginTop: 10 }}>vs last</div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
