"use client";
import { useState, useEffect, Suspense } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";

function applyFocus(e: React.FocusEvent<HTMLInputElement>, on: boolean) {
  const el = e.target;
  if (on) {
    el.style.borderColor = "#3b82f6";
    el.style.background = "rgba(59,130,246,0.06)";
    el.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)";
  } else {
    el.style.borderColor = "rgba(255,255,255,0.10)";
    el.style.background = "rgba(255,255,255,0.05)";
    el.style.boxShadow = "none";
  }
}

function SignInForm() {
  const { login, register } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setIsRegister(searchParams.get("mode") === "register");
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(""); setLoading(true);
    const result = isRegister ? await register(email, password, name) : await login(email, password);
    if (result.ok) { router.push("/onboarding"); } else { setError(result.error || "Something went wrong"); }
    setLoading(false);
  };

  const inp: React.CSSProperties = {
    width: "100%", background: "var(--input-bg)", border: "1px solid var(--input-border)",
    borderRadius: 14, padding: "16px 20px", fontSize: 16, color: "var(--text)",
    outline: "none", fontFamily: "inherit", transition: "all 0.2s", boxSizing: "border-box",
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }}>

      {/* Ambient glows */}
      <div style={{ position: "absolute", top: -200, left: "50%", transform: "translateX(-50%)", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(59,130,246,0.15) 0%, rgba(14,165,233,0.07) 45%, transparent 70%)", pointerEvents: "none" }} />
      <div style={{ position: "absolute", bottom: -100, right: -100, width: 400, height: 400, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(59,130,246,0.08) 0%, transparent 65%)", pointerEvents: "none" }} />

      {/* Back to landing */}
      <button onClick={() => router.push("/login")} style={{ position: "absolute", top: 28, left: 40, display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "var(--text-sec)", fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
        Back
      </button>

      {/* Logo */}
      <div style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #3b82f6, #0ea5e9)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
        </div>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--heading)" }}>InterviewCoach</span>
      </div>

      {/* Form card */}
      <div style={{ width: "100%", maxWidth: 600, padding: "0 24px", position: "relative", zIndex: 5 }}>
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 32, padding: "60px 64px", boxShadow: "var(--card-shadow)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)" }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, color: "var(--heading)", letterSpacing: "-0.03em", marginBottom: 8 }}>
            {isRegister ? "Create account" : "Welcome back"}
          </h2>
          <p style={{ fontSize: 16, color: "var(--text-sec)", marginBottom: 32 }}>
            {isRegister ? "Start practising today" : "Continue your session"}
          </p>

          {error && (
            <div style={{ marginBottom: 20, padding: "14px 18px", background: "rgba(248,113,113,0.10)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 14, fontSize: 15, color: "#f87171" }}>
              {error}
            </div>
          )}

          {/* Google Sign In */}
          <a href="/api/auth/google" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "16px", borderRadius: 16, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 16, fontWeight: 600, textDecoration: "none", fontFamily: "inherit", transition: "background 0.2s", marginBottom: 8 }}
            onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-hi)")}
            onMouseLeave={e => (e.currentTarget.style.background = "var(--surface)")}
          >
            <svg width="20" height="20" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
            Continue with Google
          </a>

          <div style={{ display: "flex", alignItems: "center", gap: 14, margin: "8px 0 4px" }}>
            <div style={{ flex: 1, height: 1, background: "var(--divider)" }} />
            <span style={{ fontSize: 13, color: "var(--text-tert)", fontWeight: 500 }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--divider)" }} />
          </div>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {isRegister && (
              <div>
                <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-sec)", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required style={inp} onFocus={e => applyFocus(e, true)} onBlur={e => applyFocus(e, false)} />
              </div>
            )}
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-sec)", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required style={inp} onFocus={e => applyFocus(e, true)} onBlur={e => applyFocus(e, false)} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-sec)", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isRegister ? "Min 6 characters" : "Your password"} required minLength={6} style={inp} onFocus={e => applyFocus(e, true)} onBlur={e => applyFocus(e, false)} />
            </div>

            <button type="submit" disabled={loading} style={{ marginTop: 4, padding: "18px", borderRadius: 16, background: "linear-gradient(135deg, #3b82f6, #0ea5e9)", color: "white", fontSize: 17, fontWeight: 700, border: "none", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: loading ? 0.7 : 1, letterSpacing: "-0.01em" }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <span style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
                  {isRegister ? "Creating..." : "Signing in..."}
                </span>
              ) : (isRegister ? "Create account" : "Sign in")}
            </button>
          </form>

          <div style={{ marginTop: 28, paddingTop: 28, borderTop: "1px solid var(--divider)", textAlign: "center" }}>
            <button onClick={() => { setIsRegister(!isRegister); setError(""); }} style={{ background: "none", border: "none", fontSize: 15, color: "var(--text-tert)", cursor: "pointer", fontFamily: "inherit" }}>
              {isRegister ? "Already have an account? " : "No account? "}
              <span style={{ color: "#60a5fa", fontWeight: 500 }}>{isRegister ? "Sign in" : "Create one"}</span>
            </button>
          </div>
        </div>
      </div>

      <style>{`input::placeholder { color: var(--placeholder); } @keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignInForm />
    </Suspense>
  );
}
