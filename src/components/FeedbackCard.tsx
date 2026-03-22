"use client";
import { FeedbackResult } from "@/lib/store";

interface FeedbackCardProps { feedback: FeedbackResult; questionText: string; }

const T = { cyan: "#22d3ee", violet: "#818cf8", success: "#34d399", warning: "#fbbf24", danger: "#f87171", text: "rgba(255,255,255,0.88)", sec: "rgba(255,255,255,0.50)", tert: "rgba(255,255,255,0.26)" };

function sc(s: number) { return s >= 85 ? T.success : s >= 70 ? T.cyan : s >= 50 ? T.warning : T.danger; }

function ScoreRing({ score, size = 84 }: { score: number; size?: number }) {
  const r = (size - 10) / 2, circ = 2 * Math.PI * r, offset = circ - (score / 100) * circ, color = sc(score);
  return (
    <div style={{ position: "relative", width: size, height: size, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={5} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={5} strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="score-ring" />
      </svg>
      <span style={{ position: "absolute", fontSize: 22, fontWeight: 800, color, letterSpacing: "-0.03em" }}>{score}</span>
    </div>
  );
}

const bento = { background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 18 };

export default function FeedbackCard({ feedback: f }: FeedbackCardProps) {
  const recColor = f.recommendation === "Strong" ? T.success : f.recommendation === "Good" ? T.cyan : f.recommendation === "Needs Work" ? T.warning : T.danger;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif" }} className="slide-up">

      {/* Score hero — bento row */}
      <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 12 }}>
        <div style={{ ...bento, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "20px 24px", background: "rgba(34,211,238,0.05)", borderColor: "rgba(34,211,238,0.15)" }}>
          <ScoreRing score={f.overall_score} />
          <span style={{ marginTop: 8, padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 600, background: `${recColor}18`, color: recColor }}>{f.recommendation}</span>
        </div>
        <div style={{ ...bento, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Encouragement</div>
          <p style={{ fontSize: 14, color: T.text, lineHeight: 1.6, margin: 0 }}>{f.encouragement}</p>
        </div>
      </div>

      {/* STAR bento */}
      {f.star_scores && (
        <div style={{ ...bento }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>STAR Framework</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {Object.entries(f.star_scores).map(([k, v]) => (
              <div key={k} style={{ textAlign: "center", padding: "12px 0", background: `${sc(v as number)}0D`, borderRadius: 12 }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: sc(v as number), letterSpacing: "-0.03em" }}>{v as number}</div>
                <div style={{ fontSize: 11, color: T.tert, textTransform: "capitalize", marginTop: 4 }}>{k}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dimensions bento */}
      {f.dimension_scores && (
        <div style={{ ...bento }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>Dimensions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {Object.entries(f.dimension_scores).map(([k, v]) => (
              <div key={k} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: T.sec, width: 130, textTransform: "capitalize", flexShrink: 0 }}>{k.replace(/_/g, " ")}</span>
                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                  <div className="bar-animate" style={{ height: "100%", width: `${v}%`, background: `linear-gradient(90deg, ${sc(v as number)}, ${sc(v as number)}99)`, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: sc(v as number), width: 26, textAlign: "right" }}>{v as number}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Strengths + Improvements bento row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {f.strengths?.length > 0 && (
          <div style={{ ...bento, background: "rgba(52,211,153,0.05)", borderColor: "rgba(52,211,153,0.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.success, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Strengths</div>
            {f.strengths.map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: T.text, marginBottom: 6, display: "flex", gap: 6, lineHeight: 1.45 }}><span style={{ color: T.success, flexShrink: 0 }}>+</span>{s}</div>)}
          </div>
        )}
        {f.improvements?.length > 0 && (
          <div style={{ ...bento, background: "rgba(248,113,113,0.05)", borderColor: "rgba(248,113,113,0.15)" }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.danger, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Improve</div>
            {f.improvements.map((s: string, i: number) => <div key={i} style={{ fontSize: 13, color: T.text, marginBottom: 6, display: "flex", gap: 6, lineHeight: 1.45 }}><span style={{ color: T.danger, flexShrink: 0 }}>–</span>{s}</div>)}
          </div>
        )}
      </div>

      {/* Coaching tip bento */}
      {f.coaching_tip && (
        <div style={{ ...bento, background: "rgba(34,211,238,0.05)", borderColor: "rgba(34,211,238,0.15)" }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.cyan, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>💡 Coaching Tip</div>
          <p style={{ fontSize: 14, color: T.text, lineHeight: 1.6, margin: 0 }}>{f.coaching_tip}</p>
        </div>
      )}

      {/* Ideal structure */}
      {f.ideal_90sec_structure && (
        <div style={{ ...bento }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Ideal 90s Structure</div>
          <p style={{ fontSize: 13, color: T.sec, lineHeight: 1.6, margin: 0 }}>{f.ideal_90sec_structure}</p>
        </div>
      )}

      {/* Sentence analysis */}
      {f.sentence_analysis?.length > 0 && (
        <div style={{ ...bento }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Sentence Analysis</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {f.sentence_analysis.map((s: any, i: number) => (
              <div key={i} style={{ padding: 12, borderRadius: 10, borderLeft: `3px solid ${s.rating === "strong" ? T.success : s.rating === "okay" ? T.warning : T.danger}`, background: s.rating === "strong" ? "rgba(52,211,153,0.05)" : s.rating === "okay" ? "rgba(251,191,36,0.05)" : "rgba(248,113,113,0.05)" }}>
                <p style={{ fontSize: 13, color: T.text, margin: "0 0 4px" }}>&ldquo;{s.sentence}&rdquo;</p>
                <p style={{ fontSize: 12, color: T.sec, margin: 0 }}>{s.reason}</p>
                {s.rewrite && <p style={{ fontSize: 12, color: T.cyan, marginTop: 4, margin: "4px 0 0" }}>Better: &ldquo;{s.rewrite}&rdquo;</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery bento */}
      {f.delivery_analysis && (
        <div style={{ ...bento }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 12 }}>Delivery</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {f.delivery_analysis.filler_words?.length > 0 && <div style={{ padding: 10, background: "rgba(248,113,113,0.06)", borderRadius: 10 }}><div style={{ fontSize: 10, color: T.danger, fontWeight: 600, marginBottom: 4 }}>FILLER WORDS</div><p style={{ fontSize: 12, color: T.text, margin: 0 }}>{f.delivery_analysis.filler_words.join(", ")}</p></div>}
            {f.delivery_analysis.hedging_phrases?.length > 0 && <div style={{ padding: 10, background: "rgba(251,191,36,0.06)", borderRadius: 10 }}><div style={{ fontSize: 10, color: T.warning, fontWeight: 600, marginBottom: 4 }}>HEDGING</div><p style={{ fontSize: 12, color: T.text, margin: 0 }}>{f.delivery_analysis.hedging_phrases.join(", ")}</p></div>}
            {f.delivery_analysis.power_words?.length > 0 && <div style={{ padding: 10, background: "rgba(52,211,153,0.06)", borderRadius: 10 }}><div style={{ fontSize: 10, color: T.success, fontWeight: 600, marginBottom: 4 }}>POWER WORDS</div><p style={{ fontSize: 12, color: T.text, margin: 0 }}>{f.delivery_analysis.power_words.join(", ")}</p></div>}
            <div style={{ padding: 10, background: "rgba(34,211,238,0.06)", borderRadius: 10 }}><div style={{ fontSize: 10, color: T.cyan, fontWeight: 600, marginBottom: 4 }}>ACTIVE VOICE</div><p style={{ fontSize: 12, color: T.text, margin: 0 }}>{f.delivery_analysis.active_voice_pct}%</p></div>
          </div>
          {f.delivery_analysis.pacing_note && <p style={{ fontSize: 12, color: T.sec, marginTop: 10, margin: "10px 0 0" }}>Pacing: {f.delivery_analysis.pacing_note}</p>}
        </div>
      )}

      {/* Weak areas */}
      {f.weak_areas?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {f.weak_areas.map((w: string, i: number) => <span key={i} style={{ padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500, color: T.danger, background: "rgba(248,113,113,0.12)" }}>{w}</span>)}
        </div>
      )}
    </div>
  );
}
