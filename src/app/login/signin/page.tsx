"use client";
import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SignInContent() {
  const { login, register } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [isRegister, setIsRegister] = useState(params.get("mode") === "register");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = isRegister
      ? await register(email, password, name)
      : await login(email, password);
    if (result.ok) {
      router.push("/onboarding");
    } else {
      setError(result.error || "Something went wrong");
    }
    setLoading(false);
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif", position: "relative", overflow: "hidden" }}>
      {/* Glow */}
      <div style={{ position: "absolute", top: -200, left: "40%", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(34,211,238,0.09) 0%, rgba(129,140,248,0.05) 40%, transparent 70%)", pointerEvents: "none" }} />

      <div style={{ width: "100%", maxWidth: 440, padding: "0 24px", position: "relative", zIndex: 10 }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 14, background: "linear-gradient(135deg, #22d3ee, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </div>
            <span style={{ fontSize: 24, fontWeight: 700, color: "var(--heading)", letterSpacing: "-0.02em" }}>InterviewCoach</span>
          </div>
          <p style={{ fontSize: 15, color: "var(--text-sec)" }}>AI-powered mock interviews with real feedback</p>
        </div>

        {/* Card */}
        <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 24, padding: "36px 32px", boxShadow: "var(--card-shadow)" }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: "var(--heading)", textAlign: "center", marginBottom: 28, letterSpacing: "-0.02em" }}>
            {isRegister ? "Create Account" : "Welcome Back"}
          </h2>

          {error && (
            <div style={{ background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 12, padding: "12px 14px", fontSize: 13, color: "#f87171", marginBottom: 20 }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {isRegister && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tert)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Your name" required className="ic-input" />
              </div>
            )}
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tert)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@email.com" required className="ic-input" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tert)", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isRegister ? "Min 6 characters" : "Your password"} required minLength={6} className="ic-input" />
            </div>

            <button type="submit" disabled={loading} style={{ width: "100%", padding: "15px 0", borderRadius: 14, background: loading ? "rgba(34,211,238,0.3)" : "linear-gradient(135deg, #22d3ee, #818cf8)", color: "white", fontSize: 16, fontWeight: 700, border: "none", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", marginTop: 4 }}>
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <span style={{ width: 16, height: 16, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                  {isRegister ? "Creating account..." : "Logging in..."}
                </span>
              ) : isRegister ? "Create Account" : "Log In"}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
            <div style={{ flex: 1, height: 1, background: "var(--divider)" }} />
            <span style={{ fontSize: 12, color: "var(--text-tert)" }}>or</span>
            <div style={{ flex: 1, height: 1, background: "var(--divider)" }} />
          </div>

          {/* Google OAuth */}
          <a href="/api/auth/google" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, width: "100%", padding: "14px 0", borderRadius: 14, background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 15, fontWeight: 600, textDecoration: "none", cursor: "pointer", transition: "border-color 0.2s" }}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </a>

          {/* Toggle */}
          <p style={{ textAlign: "center", fontSize: 14, color: "var(--text-sec)", marginTop: 24 }}>
            {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
            <button onClick={() => { setIsRegister(!isRegister); setError(""); }} style={{ background: "none", border: "none", color: "#22d3ee", fontWeight: 600, cursor: "pointer", fontFamily: "inherit", fontSize: 14 }}>
              {isRegister ? "Log in" : "Sign up"}
            </button>
          </p>
        </div>

        <button onClick={() => router.push("/login")} style={{ display: "block", margin: "24px auto 0", background: "none", border: "none", color: "var(--text-tert)", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          &larr; Back to home
        </button>
      </div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-sec)" }}>Loading...</div>}>
      <SignInContent />
    </Suspense>
  );
}
