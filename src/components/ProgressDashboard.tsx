"use client";
import { useEffect, useState } from "react";
import { getProfile, getWeakAreas, LearningProfile, WeakAreaProfile } from "@/lib/store";
import { WEAK_AREA_LABELS } from "@/lib/questions";

export default function ProgressDashboard() {
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [weakAreas, setWeakAreas] = useState<WeakAreaProfile[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analysis, setAnalysis] = useState<any>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    setProfile(getProfile());
    setWeakAreas(getWeakAreas());
  }, []);

  if (!profile || profile.answers.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">📊</div>
        <h3 className="text-lg font-bold text-slate-200 mb-2">No data yet</h3>
        <p className="text-sm text-muted">Complete some practice questions to see your progress.</p>
      </div>
    );
  }

  const analyzeProgress = async () => {
    setAnalyzing(true);
    try {
      const res = await fetch("/api/adaptive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "analyze_progress",
          profile: profile.userProfile,
          sessions: profile.sessions.map(s => ({
            date: s.startedAt,
            company: s.company,
            scores: profile.answers
              .filter(a => a.sessionId === s.id)
              .map(a => a.feedback.overall_score),
            weakAreas: s.weakAreas,
          })),
          overallWeakAreas: weakAreas.map(w => ({
            area: w.area,
            trend: w.scoreHistory,
            currentScore: w.avgScore,
          })),
        }),
      });
      const data = await res.json();
      setAnalysis(data.analysis);
    } catch (e) {
      console.error("Analysis error:", e);
    } finally {
      setAnalyzing(false);
    }
  };

  const recentScores = profile.answers
    .slice(0, 20)
    .map(a => a.feedback.overall_score)
    .reverse();

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Sessions" value={profile.sessions.length} />
        <StatCard label="Questions" value={profile.answers.length} />
        <StatCard label="Avg Score" value={profile.overallAvgScore} color={profile.overallAvgScore >= 70 ? "text-green-400" : "text-yellow-400"} />
        <StatCard label="Practice Time" value={`${profile.totalPracticeMinutes}m`} />
      </div>

      {/* Score Trend */}
      {recentScores.length > 1 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">Score Trend (Last 20)</h3>
          <div className="flex items-end gap-1 h-24">
            {recentScores.map((score, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end">
                <div
                  className="w-full rounded-t transition-all"
                  style={{
                    height: `${(score / 100) * 80}px`,
                    background: score >= 85 ? "#22c55e" : score >= 70 ? "#6c63ff" : score >= 50 ? "#f59e0b" : "#ef4444",
                    minHeight: "4px",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between text-[10px] text-muted mt-1">
            <span>Oldest</span>
            <span>Most Recent</span>
          </div>
        </div>
      )}

      {/* Weak Areas */}
      {weakAreas.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">Weak Areas (Lowest First)</h3>
          <div className="space-y-2">
            {weakAreas.slice(0, 8).map(w => (
              <div key={w.area} className="flex items-center gap-3">
                <div className="w-32 text-xs text-muted truncate">
                  {WEAK_AREA_LABELS[w.area] || w.area}
                </div>
                <div className="flex-1 h-2 bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full bar-animate"
                    style={{
                      width: `${w.avgScore}%`,
                      background: w.avgScore >= 70 ? "#22c55e" : w.avgScore >= 50 ? "#f59e0b" : "#ef4444",
                    }}
                  />
                </div>
                <span className="text-xs text-muted w-8 text-right">{w.avgScore}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                  w.trend === "improving" ? "bg-green-900/50 text-green-400" :
                  w.trend === "declining" ? "bg-red-900/50 text-red-400" :
                  "bg-gray-800 text-gray-400"
                }`}>
                  {w.trend === "improving" ? "↑" : w.trend === "declining" ? "↓" : "—"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Communication Habits */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-3">Communication Habits</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-surface rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-red-400">{profile.totalFillerWords}</div>
            <div className="text-[10px] text-muted">Total Fillers</div>
          </div>
          <div className="bg-surface rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-yellow-400">{profile.totalHedgingPhrases}</div>
            <div className="text-[10px] text-muted">Hedging Phrases</div>
          </div>
          <div className="bg-surface rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-blue-400">{profile.avgActiveVoicePct}%</div>
            <div className="text-[10px] text-muted">Active Voice</div>
          </div>
          <div className="bg-surface rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-green-400">
              {profile.pacingDistribution.good}/
              {profile.pacingDistribution.too_short + profile.pacingDistribution.good + profile.pacingDistribution.too_long}
            </div>
            <div className="text-[10px] text-muted">Good Pacing</div>
          </div>
        </div>
      </div>

      {/* AI Analysis */}
      {profile.sessions.length >= 2 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-slate-200">AI Progress Analysis</h3>
            <button
              onClick={analyzeProgress}
              disabled={analyzing}
              className="px-3 py-1.5 bg-accent text-white rounded-lg text-xs font-semibold hover:bg-accent/80 disabled:opacity-50"
            >
              {analyzing ? "Analyzing..." : "Analyze Progress"}
            </button>
          </div>
          {analysis && (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-3">
                <span className={`text-2xl font-bold ${
                  analysis.readiness_score >= 8 ? "text-green-400" :
                  analysis.readiness_score >= 5 ? "text-yellow-400" : "text-red-400"
                }`}>
                  {analysis.readiness_score}/10
                </span>
                <div>
                  <span className="text-slate-300 font-semibold">{analysis.readiness_label}</span>
                  <span className="text-muted ml-2">Trend: {analysis.overall_trend}</span>
                </div>
              </div>
              {analysis.milestone_message && (
                <p className="text-accent2 italic">{String(analysis.milestone_message)}</p>
              )}
              {analysis.coaching_insights?.map((insight: string, i: number) => (
                <p key={i} className="text-slate-300 bg-surface p-2 rounded">{insight}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = "text-accent2" }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[10px] text-muted mt-1">{label}</div>
    </div>
  );
}
