"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { getProfile, getWeakAreas, LearningProfile, WeakAreaProfile } from "@/lib/store";
import { WEAK_AREA_LABELS } from "@/lib/questions";

const T = { cyan: "#22d3ee", violet: "#818cf8", success: "#34d399", warning: "#fbbf24", danger: "#f87171", text: "rgba(255,255,255,0.88)", sec: "rgba(255,255,255,0.50)", tert: "rgba(255,255,255,0.26)" };
function sc(s: number) { return s >= 85 ? T.success : s >= 70 ? T.cyan : s >= 50 ? T.warning : T.danger; }
const bento = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 22 };

export default function ProgressDashboard() {
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [weakAreas, setWeakAreas] = useState<WeakAreaProfile[]>([]);
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => { setProfile(getProfile()); setWeakAreas(getWeakAreas()); }, []);

  if (!profile || profile.answers.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "80px 0", fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif" }}>
        <div style={{ width: 64, height: 64, borderRadius: 20, background: "rgba(34,211,238,0.10)", border: "1px solid rgba(34,211,238,0.18)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22d3ee" strokeWidth="1.8" strokeLinecap="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>
        </div>
        <h3 style={{ fontSize: 22, fontWeight: 700, color: "white", letterSpacing: "-0.02em", marginBottom: 8 }}>No data yet</h3>
        <p style={{ fontSize: 15, color: T.sec }}>Complete some practice questions to see your progress.</p>
      </div>
    );
  }

  const analyzeProgress = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/adaptive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyze_progress", profile: profile.userProfile, sessions: profile.sessions.map(s => ({ date: s.startedAt, company: s.company, scores: profile.answers.filter(a => a.sessionId === s.id).map(a => a.feedback.overall_score), weakAreas: s.weakAreas })), overallWeakAreas: weakAreas.map(w => ({ area: w.area, trend: w.scoreHistory, currentScore: w.avgScore })) }) });
      const data = await res.json(); setAnalysis(data.analysis);
    } catch { /* ignore */ } finally { setAnalyzing(false); }
  };

  const recentScores = profile.answers.slice(0, 20).map(a => a.feedback.overall_score).reverse();
  const maxScore = Math.max(...recentScores, 1);

  return (
    <div style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }} className="fade-in">
      <h2 style={{ fontSize: 24, fontWeight: 700, color: "white", letterSpacing: "-0.02em", marginBottom: 20 }}>Progress</h2>

      {/* Top bento row -- 4 stat tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 12 }} className="stagger">
        {[
          { label: "Sessions", value: profile.sessions.length, color: T.cyan },
          { label: "Questions", value: profile.answers.length, color: T.violet },
          { label: "Avg score", value: profile.overallAvgScore, color: sc(profile.overallAvgScore) },
          { label: "Mins practised", value: `${profile.totalPracticeMinutes}`, color: T.success },
        ].map(({ label, value, color }) => (
          <div key={label} className="fade-in" style={{ ...bento, textAlign: "center", padding: "20px 16px" }}>
            <div style={{ fontSize: 36, fontWeight: 800, color, letterSpacing: "-0.04em", lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: 12, color: T.tert, marginTop: 6 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Second bento row -- score trend + communication */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        {recentScores.length > 1 && (
          <div style={{ ...bento }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 16 }}>Score Trend <span style={{ fontSize: 12, color: T.tert, fontWeight: 400 }}>last {recentScores.length}</span></div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 80, marginBottom: 8 }}>
              {recentScores.map((score, i) => (
                <div key={i} style={{ flex: 1, display: "flex", alignItems: "flex-end", height: "100%" }}>
                  <div style={{ width: "100%", borderRadius: "3px 3px 0 0", background: `linear-gradient(180deg, ${sc(score)}, ${sc(score)}66)`, height: `${Math.max(4, (score / maxScore) * 72)}px`, transition: "height 0.5s" }} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: T.tert }}>
              <span>Oldest</span><span>Most recent</span>
            </div>
          </div>
        )}

        <div style={{ ...bento }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 16 }}>Communication Habits</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              { label: "Filler words", value: profile.totalFillerWords, color: T.danger },
              { label: "Hedging", value: profile.totalHedgingPhrases, color: T.warning },
              { label: "Active voice", value: `${profile.avgActiveVoicePct}%`, color: T.cyan },
              { label: "Good pacing", value: `${profile.pacingDistribution.good}/${profile.pacingDistribution.too_short + profile.pacingDistribution.good + profile.pacingDistribution.too_long}`, color: T.success },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ textAlign: "center", padding: "12px 0", background: `${color}0D`, borderRadius: 12 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.02em" }}>{value}</div>
                <div style={{ fontSize: 10, color: T.tert, marginTop: 3 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wide bento -- weak areas */}
      {weakAreas.length > 0 && (
        <div style={{ ...bento, marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 16 }}>Skill Breakdown</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {weakAreas.slice(0, 8).map(w => (
              <div key={w.area} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <span style={{ fontSize: 12, color: T.sec, width: 130, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{WEAK_AREA_LABELS[w.area] || w.area}</span>
                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                  <div className="bar-animate" style={{ height: "100%", width: `${w.avgScore}%`, background: `linear-gradient(90deg, ${sc(w.avgScore)}, ${sc(w.avgScore)}88)`, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: sc(w.avgScore), width: 28, textAlign: "right" }}>{w.avgScore}</span>
                <span style={{ fontSize: 13, width: 16, color: w.trend === "improving" ? T.success : w.trend === "declining" ? T.danger : T.tert }}>{w.trend === "improving" ? "up" : w.trend === "declining" ? "down" : "--"}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI analysis bento */}
      {profile.sessions.length >= 2 && (
        <div style={{ ...bento, background: "rgba(129,140,248,0.05)", borderColor: "rgba(129,140,248,0.15)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: analysis ? 16 : 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>AI Progress Analysis</span>
            <button onClick={analyzeProgress} disabled={analyzing}
              style={{ padding: "8px 20px", borderRadius: 999, background: analyzing ? "rgba(34,211,238,0.2)" : "linear-gradient(135deg,#22d3ee,#818cf8)", color: "white", fontSize: 12, fontWeight: 600, border: "none", cursor: analyzing ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {analyzing ? (
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Analysing...
                </span>
              ) : "Analyse Progress"}
            </button>
          </div>
          {analysis && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ fontSize: 42, fontWeight: 800, color: analysis.readiness_score >= 8 ? T.success : analysis.readiness_score >= 5 ? T.warning : T.danger, letterSpacing: "-0.04em", lineHeight: 1 }}>{analysis.readiness_score}<span style={{ fontSize: 18 }}>/10</span></div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{analysis.readiness_label}</div>
                  <div style={{ fontSize: 13, color: T.sec }}>Trend: {analysis.overall_trend}</div>
                </div>
              </div>
              {analysis.milestone_message && <p style={{ fontSize: 14, color: T.cyan, fontStyle: "italic", padding: "12px 14px", background: "rgba(34,211,238,0.07)", borderRadius: 10, margin: 0 }}>{String(analysis.milestone_message)}</p>}
              {analysis.coaching_insights?.map((ins: string, i: number) => <p key={i} style={{ fontSize: 13, color: T.text, padding: "10px 14px", background: "rgba(255,255,255,0.03)", borderRadius: 10, lineHeight: 1.55, margin: 0 }}>{ins}</p>)}
            </div>
          )}
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
