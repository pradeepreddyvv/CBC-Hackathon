"use client";
import { FeedbackResult } from "@/lib/store";

interface FeedbackCardProps {
  feedback: FeedbackResult;
  questionText: string;
}

function ScoreRing({ score, size = 80 }: { score: number; size?: number }) {
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = score >= 85 ? "#22c55e" : score >= 70 ? "#6c63ff" : score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#2e3350" strokeWidth={4} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={4}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"
          className="score-ring transition-all duration-1000"
        />
      </svg>
      <span className="absolute text-xl font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

function StarBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div className="mb-2">
      <div className="flex justify-between text-xs text-muted mb-1">
        <span>{label}</span>
        <span>{score}</span>
      </div>
      <div className="h-1.5 bg-border rounded-full overflow-hidden">
        <div className="h-full rounded-full bar-animate" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

export default function FeedbackCard({ feedback, questionText }: FeedbackCardProps) {
  const f = feedback;

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-5">
      {/* Header: Score + Recommendation */}
      <div className="flex items-start gap-5">
        <ScoreRing score={f.overall_score} />
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className={`px-3 py-0.5 rounded-full text-xs font-bold ${
              f.recommendation === "Strong" ? "bg-green-900 text-green-400" :
              f.recommendation === "Good" ? "bg-blue-900 text-blue-400" :
              f.recommendation === "Needs Work" ? "bg-yellow-900 text-yellow-400" :
              "bg-red-900 text-red-400"
            }`}>
              {f.recommendation}
            </span>
            <span className={`px-2 py-0.5 rounded text-xs ${
              f.delivery_analysis?.pacing === "good" ? "bg-green-900/50 text-green-400" :
              f.delivery_analysis?.pacing === "too_short" ? "bg-yellow-900/50 text-yellow-400" :
              "bg-red-900/50 text-red-400"
            }`}>
              {f.delivery_analysis?.pacing === "good" ? "Good timing" :
               f.delivery_analysis?.pacing === "too_short" ? "Too short" : "Too long"}
            </span>
          </div>
          <p className="text-xs text-muted line-clamp-2">{questionText}</p>
          {f.encouragement && (
            <p className="text-xs text-accent2 mt-2 italic">{f.encouragement}</p>
          )}
        </div>
      </div>

      {/* STAR Scores */}
      <div>
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">STAR Framework</h4>
        <div className="grid grid-cols-2 gap-x-4">
          <StarBar label="Situation" score={f.star_scores?.situation || 0} color="#60a5fa" />
          <StarBar label="Task" score={f.star_scores?.task || 0} color="#a78bfa" />
          <StarBar label="Action" score={f.star_scores?.action || 0} color="#4ade80" />
          <StarBar label="Result" score={f.star_scores?.result || 0} color="#f59e0b" />
        </div>
      </div>

      {/* Communication Dimensions */}
      <div>
        <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Communication</h4>
        <div className="grid grid-cols-5 gap-2">
          {Object.entries(f.dimension_scores || {}).map(([key, val]) => (
            <div key={key} className="text-center">
              <div className={`text-lg font-bold ${(val as number) >= 70 ? "text-green-400" : (val as number) >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                {val as number}
              </div>
              <div className="text-[10px] text-muted capitalize">{key.replace(/_/g, " ")}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sentence-Level Analysis */}
      {f.sentence_analysis?.length > 0 && (
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Sentence-by-Sentence</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {f.sentence_analysis.map((s, i) => (
              <div key={i} className={`p-3 rounded-lg border-l-3 text-xs ${
                s.rating === "strong" ? "bg-green-950/30 border-l-green-500" :
                s.rating === "okay" ? "bg-yellow-950/30 border-l-yellow-500" :
                "bg-red-950/30 border-l-red-500"
              }`} style={{ borderLeftWidth: "3px" }}>
                <p className="text-slate-300 mb-1">&ldquo;{s.sentence}&rdquo;</p>
                <p className="text-muted">{s.reason}</p>
                {s.rewrite && (
                  <p className="text-accent2 mt-1">Better: &ldquo;{s.rewrite}&rdquo;</p>
                )}
                {s.tags?.length > 0 && (
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {s.tags.map(tag => (
                      <span key={tag} className="px-1.5 py-0.5 bg-surface rounded text-[10px] text-muted">{tag}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Delivery Analysis */}
      {f.delivery_analysis && (
        <div>
          <h4 className="text-xs font-bold text-muted uppercase tracking-wider mb-3">Delivery Analysis</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] text-red-400 font-bold mb-1">Filler Words</div>
              <p className="text-xs text-slate-300">
                {f.delivery_analysis.filler_words?.length > 0
                  ? f.delivery_analysis.filler_words.join(", ")
                  : "None detected!"}
              </p>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] text-yellow-400 font-bold mb-1">Hedging Language</div>
              <p className="text-xs text-slate-300">
                {f.delivery_analysis.hedging_phrases?.length > 0
                  ? f.delivery_analysis.hedging_phrases.join(", ")
                  : "None — confident language!"}
              </p>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] text-green-400 font-bold mb-1">Power Words</div>
              <p className="text-xs text-slate-300">
                {f.delivery_analysis.power_words?.length > 0
                  ? f.delivery_analysis.power_words.join(", ")
                  : "Try using: built, designed, led, shipped"}
              </p>
            </div>
            <div className="bg-surface rounded-lg p-3">
              <div className="text-[10px] text-blue-400 font-bold mb-1">Active Voice</div>
              <p className="text-xs text-slate-300">{f.delivery_analysis.active_voice_pct || 0}% active voice</p>
            </div>
          </div>
        </div>
      )}

      {/* Strengths & Improvements */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs font-bold text-green-400 mb-2">Strengths</h4>
          <ul className="space-y-1">
            {f.strengths?.map((s, i) => (
              <li key={i} className="text-xs text-slate-300 pl-3 relative before:absolute before:left-0 before:content-['✓'] before:text-green-400">{s}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-xs font-bold text-yellow-400 mb-2">Improvements</h4>
          <ul className="space-y-1">
            {f.improvements?.map((s, i) => (
              <li key={i} className="text-xs text-slate-300 pl-3 relative before:absolute before:left-0 before:content-['→'] before:text-yellow-400">{s}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* Coaching Tip */}
      {f.coaching_tip && (
        <div className="bg-blue-950/30 border-l-[3px] border-accent p-3 rounded-r-lg">
          <div className="text-[10px] text-accent font-bold mb-1">TOP COACHING TIP</div>
          <p className="text-xs text-slate-300">{f.coaching_tip}</p>
        </div>
      )}

      {/* Weakest Sentence Rewrite */}
      {f.weakest_sentence_rewrite?.original && (
        <div className="bg-surface rounded-lg p-3">
          <div className="text-[10px] text-muted font-bold mb-2">BEST SINGLE IMPROVEMENT</div>
          <div className="text-xs">
            <p className="text-red-400 line-through mb-1">{f.weakest_sentence_rewrite.original}</p>
            <p className="text-green-400">{f.weakest_sentence_rewrite.improved}</p>
          </div>
        </div>
      )}

      {/* Follow-up Question */}
      {f.follow_up_question && (
        <div className="bg-surface rounded-lg p-3">
          <div className="text-[10px] text-warn font-bold mb-1">LIKELY FOLLOW-UP QUESTION</div>
          <p className="text-xs text-slate-300 italic">{f.follow_up_question}</p>
        </div>
      )}

      {/* 90-second Structure */}
      {f.ideal_90sec_structure && (
        <details className="bg-surface rounded-lg p-3 cursor-pointer">
          <summary className="text-[10px] text-accent2 font-bold">IDEAL 90-SECOND ANSWER STRUCTURE</summary>
          <p className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">{f.ideal_90sec_structure}</p>
        </details>
      )}
    </div>
  );
}
