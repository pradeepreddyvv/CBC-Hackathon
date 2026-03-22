"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import VoiceRecorder from "@/components/VoiceRecorder";
import FeedbackCard from "@/components/FeedbackCard";
import ProgressDashboard from "@/components/ProgressDashboard";
import { QUESTION_BANK, WEAK_AREA_LABELS, Question } from "@/lib/questions";
import { getCompanyPattern } from "@/lib/company-patterns";
import { getProfile, saveUserProfile, recordAnswer, recordSession, getWeakAreas, getSessionCount, FeedbackResult, AnswerRecord, SessionRecord, UserProfile } from "@/lib/store";
import { cloudSaveSession, cloudSaveAnswer } from "@/lib/cloud-sync";
import { useAuth } from "@/lib/auth-context";
import dynamic from "next/dynamic";
import AppNav from "@/components/AppNav";

const InterviewArtifactScene = dynamic(() => import("@/components/InterviewArtifactScene"), { ssr: false });
type Tab = "practice" | "progress" | "history" | "3d-interview";

interface AdaptiveQuestion { id: string; text: string; type: string; category: string; targets_weakness: string[]; difficulty: string; hint: string; company_context?: string; time_target_sec?: number; delivery_note?: string; }
interface SessionPlan { session_plan: { focus_message: string; primary_weakness: string; expected_improvement: string; delivery_challenge?: string; }; questions: AdaptiveQuestion[]; }

const T = { cyan: "#22d3ee", violet: "#818cf8", success: "#34d399", warning: "#fbbf24", danger: "#f87171", text: "var(--text)", sec: "var(--text-sec)", tert: "var(--text-tert)" };
const bento = { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 20 };
const bentoHi = { background: "rgba(34,211,238,0.06)", border: "1px solid rgba(34,211,238,0.18)", borderRadius: 20 };
const bentoVi = { background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.18)", borderRadius: 20 };
function sc(s: number) { return s >= 85 ? T.success : s >= 70 ? T.cyan : s >= 50 ? T.warning : T.danger; }

function Pill({ children, color = T.cyan }: { children: React.ReactNode; color?: string }) {
  return <span style={{ display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 999, fontSize: 11, fontWeight: 500, color, background: `${color}18`, letterSpacing: "0.02em" }}>{children}</span>;
}

export default function Home() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("practice");
  const [profile, setProfile] = useState<UserProfile>({ name: "", background: "", targetRole: "Software Engineer", targetCompany: "Google", experience: "", skills: "", country: "" });
  const [profileSaved, setProfileSaved] = useState(false);
  const [sessionId, setSessionId] = useState(""); const sessionIdRef = useRef("");
  const [sessionQuestions, setSessionQuestions] = useState<(Question | AdaptiveQuestion)[]>([]);
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answer, setAnswer] = useState(""); const [answerDuration, setAnswerDuration] = useState(0); const [answerStartTime, setAnswerStartTime] = useState<number | null>(null);
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null); const [loading, setLoading] = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState<AnswerRecord[]>([]); const [showFeedbackPerQ, setShowFeedbackPerQ] = useState(true);
  const [audioUrl, setAudioUrl] = useState<string | null>(null); const [isPlaying, setIsPlaying] = useState(false); const audioRef = useRef<HTMLAudioElement | null>(null);
  const [followUpQ, setFollowUpQ] = useState<string | null>(null); const [isFollowUp, setIsFollowUp] = useState(false);
  const [sessionSummary, setSessionSummary] = useState<Record<string, unknown> | null>(null); const [summaryLoading, setSummaryLoading] = useState(false);
  const [generatingSession, setGeneratingSession] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
    else if (!authLoading && user && !user.onboarded) router.push("/onboarding");
  }, [user, authLoading, router]);

  useEffect(() => {
    // 1. Load from localStorage first (instant)
    const saved = getProfile();
    if (saved.userProfile?.name) { setProfile(saved.userProfile); setProfileSaved(true); } else if (user) setProfile(prev => ({ ...prev, name: user.name || prev.name }));
    const config = localStorage.getItem("interview_session_config");
    if (config) { try { const p = JSON.parse(config); if (p.generatedQuestions?.length > 0) { setSessionQuestions(p.generatedQuestions); const sid = "sess_"+Date.now(); setSessionId(sid); sessionIdRef.current = sid; } if (p.companyName) setProfile(prev => ({ ...prev, targetCompany: p.companyName, country: p.country || "" })); } catch { /* ignore */ } }

    // 2. Also fetch from DB to ensure we have latest data
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(data => {
      if (data?.user) {
        const u = data.user;
        setProfile(prev => ({
          name: u.name || prev.name || "",
          background: u.background || prev.background || "",
          targetRole: u.target_role || prev.targetRole || "Software Engineer",
          targetCompany: u.target_company || prev.targetCompany || "Google",
          experience: u.experience || prev.experience || "",
          skills: u.skills || prev.skills || "",
          country: u.country || prev.country || "",
        }));
        if (u.name || u.background) setProfileSaved(true);
        // Sync to localStorage for next time
        saveUserProfile({
          name: u.name || saved.userProfile?.name || "",
          background: u.background || saved.userProfile?.background || "",
          targetRole: u.target_role || saved.userProfile?.targetRole || "Software Engineer",
          targetCompany: u.target_company || saved.userProfile?.targetCompany || "Google",
          experience: u.experience || saved.userProfile?.experience || "",
          skills: u.skills || saved.userProfile?.skills || "",
          country: u.country || saved.userProfile?.country || "",
        });
      }
    }).catch(() => {});
  }, []);

  const startSession = useCallback(async (useAdaptive: boolean) => {
    const sid = "sess_"+Date.now(); setSessionId(sid); sessionIdRef.current = sid;
    setCurrentQIndex(0); setFeedback(null); setAnswer(""); setSessionAnswers([]); setSessionSummary(null);
    if (useAdaptive) {
      setGeneratingSession(true);
      try {
        const wa = getWeakAreas().map(w => ({ area: w.area, score: w.avgScore, frequency: w.totalOccurrences }));
        const sp = getProfile();
        const res = await fetch("/api/adaptive", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_session", company: profile.targetCompany, role: profile.targetRole, country: profile.country, profile, weakAreas: wa, completedQuestions: sp.completedQuestionTexts, sessionNumber: getSessionCount()+1, communicationHabits: { fillerFrequency: sp.totalFillerWords > 10 ? "high" : "normal", hedgingFrequency: sp.totalHedgingPhrases > 5 ? "high" : "normal", pacingIssue: sp.pacingDistribution.too_long > sp.pacingDistribution.good ? "tends to ramble" : "okay" } }) });
        const data = await res.json();
        if (data.session) { setSessionPlan(data.session); setSessionQuestions(data.session.questions); } else setSessionQuestions(QUESTION_BANK.slice(0, 5));
      } catch { setSessionQuestions(QUESTION_BANK.slice(0, 5)); } finally { setGeneratingSession(false); }
    } else { setSessionPlan(null); setSessionQuestions(QUESTION_BANK.slice(0, 5)); }
    const session: SessionRecord = { id: sid, company: profile.targetCompany, role: profile.targetRole, startedAt: new Date().toISOString(), answerCount: 0, avgScore: 0, weakAreas: [], sessionNumber: getSessionCount()+1 };
    recordSession(session);
    if (user?.id) { const cfg = localStorage.getItem("interview_session_config"); const pc = cfg ? JSON.parse(cfg) : {}; cloudSaveSession(user.id, { ...session, generatedQuestions: sessionQuestions, interviewType: pc.interviewType||"", roundType: pc.roundType||"", researchContext: pc.researchResults||null, sessionConfig: { company: profile.targetCompany, role: profile.targetRole, country: profile.country, interviewType: pc.interviewType, roundType: pc.roundType, jobDescription: pc.jobDescription } }); }
  }, [profile, user]);

  const currentQuestion = sessionQuestions[currentQIndex] || null;
  const handleTranscript = useCallback((text: string) => { setAnswer(text); if (answerStartTime) setAnswerDuration(Math.round((Date.now()-answerStartTime)/1000)); }, [answerStartTime]);
  const handleRecordingChange = useCallback((isRecording: boolean) => { if (isRecording) { setAnswerStartTime(Date.now()); setFeedback(null); setAudioUrl(null); setIsPlaying(false); } }, []);
  const handleAudioReady = useCallback((url: string) => { if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(url); }, [audioUrl]);
  const togglePlayback = useCallback(() => { if (!audioUrl) return; if (isPlaying && audioRef.current) { audioRef.current.pause(); setIsPlaying(false); } else { const a = new Audio(audioUrl); a.onended = () => setIsPlaying(false); a.play(); audioRef.current = a; setIsPlaying(true); } }, [audioUrl, isPlaying]);

  const getFeedback = useCallback(async () => {
    if (!answer || (!currentQuestion && !followUpQ)) return; setLoading(true);
    try {
      const q = currentQuestion; const qt = isFollowUp && followUpQ ? followUpQ : q?.text || "";
      const prev = getProfile().answers.filter(a => a.questionText === qt).map(a => ({ score: a.feedback.overall_score, weakAreas: a.feedback.weak_areas }));
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: qt, answer, category: q?.category||"follow_up", questionType: q?.type||"behavioral", company: profile.targetCompany, role: profile.targetRole, country: profile.country, profile, answerDurationSec: answerDuration||60, previousAttempts: prev.length > 0 ? prev : undefined }) });
      const data = await res.json();
      if (data.feedback) {
        setFeedback(data.feedback);
        const rec: AnswerRecord = { id: "ans_"+Date.now(), sessionId, questionId: isFollowUp ? "followup_"+(q?.id||Date.now()) : (q?.id||""), questionText: qt, category: q?.category||"follow_up", type: q?.type||"behavioral", answer, feedback: data.feedback, durationSec: answerDuration||60, timestamp: new Date().toISOString() };
        recordAnswer(rec); setSessionAnswers(prev => [...prev, rec]);
        const allScores = [...sessionAnswers, rec].map(a => a.feedback.overall_score);
        const allWeak = [...new Set([...sessionAnswers, rec].flatMap(a => a.feedback.weak_areas))];
        const sd = { id: sessionId, company: profile.targetCompany, role: profile.targetRole, startedAt: new Date().toISOString(), answerCount: allScores.length, avgScore: Math.round(allScores.reduce((a,b)=>a+b,0)/allScores.length), weakAreas: allWeak, sessionNumber: getSessionCount() };
        recordSession(sd);
        if (user?.id) { cloudSaveAnswer(user.id, { ...rec, feedback: rec.feedback as unknown as Record<string,unknown>, transcript: rec.answer }); cloudSaveSession(user.id, { ...sd, generatedQuestions: sessionQuestions }); fetch("/api/vector", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "embed_answer", userId: user.id, answerId: rec.id, questionText: rec.questionText, answerText: rec.answer, score: data.feedback.overall_score }) }).catch(()=>{}); }
        if (isFollowUp) { setIsFollowUp(false); setFollowUpQ(null); }
      }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, [answer, currentQuestion, profile, answerDuration, sessionId, sessionAnswers, isFollowUp, followUpQ]);

  const nextQuestion = useCallback(() => {
    if (currentQIndex < sessionQuestions.length-1) { setCurrentQIndex(i=>i+1); setAnswer(""); setFeedback(null); setAnswerStartTime(null); setFollowUpQ(null); setIsFollowUp(false); if (audioUrl) URL.revokeObjectURL(audioUrl); setAudioUrl(null); setIsPlaying(false); }
  }, [currentQIndex, sessionQuestions.length]);

  const endSession = useCallback(async () => {
    if (sessionAnswers.length === 0) return; setSummaryLoading(true);
    try {
      const res = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "session_summary", company: profile.targetCompany, role: profile.targetRole, country: profile.country, profile, sessionNumber: getSessionCount(), answers: sessionAnswers.map(a => ({ question: a.questionText, answer: a.answer, score: a.feedback.overall_score, weakAreas: a.feedback.weak_areas, starScores: a.feedback.star_scores, dimensionScores: a.feedback.dimension_scores, deliveryAnalysis: a.feedback.delivery_analysis||{ filler_words:[], hedging_phrases:[], power_words:[], active_voice_pct:0, pacing:"good" } })) }) });
      const data = await res.json(); if (data.summary) setSessionSummary(data.summary);
    } catch (e) { console.error(e); } finally { setSummaryLoading(false); }
  }, [sessionAnswers, profile]);

  const companyPattern = getCompanyPattern(profile.targetCompany);

  if (authLoading) return (
    <div style={{ minHeight: "100vh", background: "#050a14", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 36, height: 36, border: "2.5px solid rgba(255,255,255,0.08)", borderTopColor: "#22d3ee", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
  if (!user) return null;

  const TABS: { id: Tab; label: string }[] = [{ id: "practice", label: "Practice" }, { id: "3d-interview", label: "3D Mock" }, { id: "progress", label: "Progress" }, { id: "history", label: "History" }];

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif", position: "relative" }}>
      {/* Ambient top glow */}
      <div style={{ position: "fixed", top: -200, left: "50%", transform: "translateX(-50%)", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(34,211,238,0.07) 0%, rgba(129,140,248,0.04) 45%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      <AppNav
        user={user}
        activeTab={tab}
        onTabChange={id => setTab(id as Tab)}
        onSignOut={() => { logout(); router.push("/login"); }}
      />

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "36px 40px 100px", position: "relative", zIndex: 1 }}>

        {/* ── PRACTICE TAB ── */}
        {tab === "practice" && (
          <div className="fade-in">

            {/* No session — start screen */}
            {sessionQuestions.length === 0 && !generatingSession && (
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }} className="stagger">

                {/* Hero tile — centred */}
                <div style={{ ...bentoHi, padding: "48px 40px", textAlign: "center" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.cyan, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Ready to practise</div>
                  <h2 style={{ fontSize: 34, fontWeight: 800, color: "var(--heading)", letterSpacing: "-0.03em", margin: "0 0 10px" }}>
                    <span onClick={() => router.push("/profile")} style={{ cursor: "pointer", borderBottom: "2px dashed rgba(34,211,238,0.3)", paddingBottom: 2, transition: "border-color 0.2s" }} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(34,211,238,0.7)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(34,211,238,0.3)")}>{profile.targetCompany}</span>
                    {" · "}
                    <span onClick={() => router.push("/profile")} style={{ cursor: "pointer", borderBottom: "2px dashed rgba(129,140,248,0.3)", paddingBottom: 2, transition: "border-color 0.2s" }} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.7)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "rgba(129,140,248,0.3)")}>{profile.targetRole}</span>
                  </h2>
                  <p style={{ fontSize: 16, color: T.sec, margin: "0 auto 28px", lineHeight: 1.6, maxWidth: 560 }}>5 questions per session. Get scored after each answer or save all feedback for the end of the session.</p>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "center", flexWrap: "wrap" }}>
                    <button onClick={() => startSession(false)} style={{ padding: "14px 28px", borderRadius: 14, background: "var(--surface-hi)", border: "1px solid var(--border-hi)", color: "var(--text)", fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Standard Session</button>
                    <button onClick={() => startSession(true)} style={{ padding: "14px 28px", borderRadius: 14, background: "linear-gradient(135deg, #22d3ee, #818cf8)", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      {getWeakAreas().length > 0 ? "Adaptive Session ✦" : "AI-Generated Session"}
                    </button>
                  </div>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 14, color: T.sec, cursor: "pointer", marginTop: 16 }}>
                    <input type="checkbox" checked={showFeedbackPerQ} onChange={e => setShowFeedbackPerQ(e.target.checked)} style={{ accentColor: T.cyan, width: 15, height: 15 }} />
                    Feedback per question
                  </label>
                </div>

                {/* Company intel — grouped layout */}
                {companyPattern.name !== "General" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {/* Left: title + interview style */}
                    <div style={{ ...bento, padding: "28px 32px" }} className="fade-in">
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.violet, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>{companyPattern.name} Interview Intel</div>
                      <p style={{ fontSize: 14, color: T.sec, lineHeight: 1.65, margin: 0 }}>{companyPattern.interviewStyle}</p>
                    </div>

                    {/* Right: key factors grid */}
                    <div style={{ ...bento, padding: "28px 32px" }} className="fade-in">
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.cyan, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>What They Look For</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {companyPattern.whatTheyLookFor.map((w, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 12, background: `${T.violet}10`, border: `1px solid ${T.violet}20` }}>
                            <span style={{ fontSize: 14 }}>{["🎯", "🧩", "💡", "⚡", "🔍"][i % 5]}</span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{w}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Bottom full-width: tips */}
                    <div style={{ ...bentoVi, padding: "24px 32px", gridColumn: "1 / -1" }} className="fade-in">
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.violet, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 14 }}>Tips from Candidates</div>
                      <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(companyPattern.tips.length, 4)}, 1fr)`, gap: 12 }}>
                        {companyPattern.tips.slice(0, 4).map((tip, i) => (
                          <div key={i} style={{ padding: "14px 16px", borderRadius: 12, background: "rgba(129,140,248,0.06)", border: "1px solid rgba(129,140,248,0.12)" }}>
                            <p style={{ fontSize: 13, color: T.text, lineHeight: 1.5, margin: 0 }}>{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Weak areas */}
                {getWeakAreas().length > 0 && (
                  <div style={{ ...bento, padding: "28px 32px" }} className="fade-in">
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.warning, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 16 }}>Areas to Improve</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {getWeakAreas().slice(0, 4).map(w => (
                        <div key={w.area} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <span style={{ fontSize: 14, color: T.text, flex: 1 }}>{WEAK_AREA_LABELS[w.area] || w.area}</span>
                          <div style={{ width: 100, height: 4, background: "var(--surface-hi)", borderRadius: 2, overflow: "hidden" }}>
                            <div style={{ height: "100%", width: `${w.avgScore}%`, background: `linear-gradient(90deg, ${sc(w.avgScore)}, ${sc(w.avgScore)}88)`, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 14, fontWeight: 700, color: sc(w.avgScore), width: 28, textAlign: "right" }}>{w.avgScore}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Generating */}
            {generatingSession && (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.07)", borderTopColor: T.cyan, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 20px" }} />
                <p style={{ fontSize: 15, color: T.sec }}>Crafting your personalised session...</p>
              </div>
            )}

            {/* ── ACTIVE SESSION BENTO ── */}
            {sessionQuestions.length > 0 && !sessionSummary && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

                {/* Session focus + progress — top bar */}
                <div style={{ ...bento, padding: "20px 28px", display: "flex", alignItems: "center", gap: 24 }}>
                  {sessionPlan?.session_plan && (
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.cyan, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 5 }}>Session Focus</div>
                      <p style={{ fontSize: 15, color: T.text, margin: 0 }}>{sessionPlan.session_plan.focus_message}</p>
                    </div>
                  )}
                  {!sessionPlan && <div style={{ flex: 1 }} />}
                  <div style={{ display: "flex", alignItems: "center", gap: 18, flexShrink: 0 }}>
                    <div style={{ width: 180, height: 4, background: "var(--border)", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${((currentQIndex+(feedback?1:0))/sessionQuestions.length)*100}%`, background: "linear-gradient(90deg, #22d3ee, #818cf8)", transition: "width 0.5s", borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 14, color: T.sec, whiteSpace: "nowrap", fontWeight: 600 }}>{currentQIndex+1} / {sessionQuestions.length}</span>
                    <button onClick={endSession} disabled={sessionAnswers.length === 0 || summaryLoading}
                      style={{ padding: "8px 18px", borderRadius: 999, fontSize: 13, background: "none", border: "1px solid rgba(248,113,113,0.3)", color: "rgba(248,113,113,0.7)", cursor: "pointer", fontFamily: "inherit" }}>
                      End session
                    </button>
                  </div>
                </div>

                {/* Bento grid: question + recorder | score sidebar */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>

                  {/* Left col */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Question card */}
                    {(currentQuestion || isFollowUp) && (
                      <div style={{ ...bentoHi, padding: "28px 32px" }} className="scale-in">
                        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                          {isFollowUp ? <Pill color={T.violet}>Follow-up</Pill> : currentQuestion && (
                            <>
                              <Pill color={currentQuestion.type === "behavioral" ? T.cyan : currentQuestion.type === "technical" ? T.violet : T.warning}>{currentQuestion.type}</Pill>
                              <span style={{ fontSize: 12, color: T.tert }}>{currentQuestion.category}</span>
                              {currentQuestion.difficulty && <Pill color={currentQuestion.difficulty === "easy" ? T.success : currentQuestion.difficulty === "medium" ? T.warning : T.danger}>{currentQuestion.difficulty}</Pill>}
                            </>
                          )}
                        </div>
                        <p style={{ fontSize: 22, fontWeight: 600, color: "var(--heading)", lineHeight: 1.5, letterSpacing: "-0.01em", margin: "0 0 14px" }}>
                          {isFollowUp ? followUpQ : currentQuestion?.text}
                        </p>
                        {"delivery_note" in (currentQuestion||{}) && (currentQuestion as AdaptiveQuestion).delivery_note && (
                          <p style={{ fontSize: 14, color: T.sec, margin: 0, fontStyle: "italic" }}>{(currentQuestion as AdaptiveQuestion).delivery_note}</p>
                        )}
                      </div>
                    )}

                    {/* Hint */}
                    {currentQuestion?.hint && (
                      <details style={{ ...bento, padding: "14px 20px" } as React.CSSProperties}>
                        <summary style={{ fontSize: 14, color: T.cyan, cursor: "pointer", fontWeight: 500 }}>💡 Show Hint</summary>
                        <p style={{ fontSize: 14, color: T.sec, marginTop: 12, lineHeight: 1.6, marginBottom: 0 }}>{currentQuestion.hint}</p>
                      </details>
                    )}

                    {/* Recorder */}
                    <div style={{ ...bento, padding: 24 } as React.CSSProperties}>
                      <VoiceRecorder onTranscript={handleTranscript} onRecordingChange={handleRecordingChange} onAudioReady={handleAudioReady} disabled={loading} />
                    </div>

                    {/* Answer preview */}
                    {answer && (
                      <div style={{ ...bento, padding: "22px 24px" } as React.CSSProperties} className="fade-in">
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em" }}>Your Answer · {answerDuration}s</span>
                          {audioUrl && (
                            <button onClick={togglePlayback} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 999, fontSize: 13, fontWeight: 500, background: isPlaying ? "rgba(248,113,113,0.12)" : "rgba(34,211,238,0.12)", border: `1px solid ${isPlaying ? "rgba(248,113,113,0.3)" : "rgba(34,211,238,0.3)"}`, color: isPlaying ? T.danger : T.cyan, cursor: "pointer", fontFamily: "inherit" }}>
                              {isPlaying ? "⏹ Stop" : "▶ Re-listen"}
                            </button>
                          )}
                        </div>
                        <p style={{ fontSize: 15, color: T.text, lineHeight: 1.65, maxHeight: 160, overflowY: "auto", whiteSpace: "pre-wrap", margin: 0 }}>{answer}</p>

                        {/* Action buttons */}
                        <div style={{ display: "flex", gap: 12, marginTop: 18 }}>
                          {showFeedbackPerQ && (
                            <button onClick={getFeedback} disabled={loading}
                              style={{ flex: 1, padding: "14px", borderRadius: 14, background: loading ? "rgba(34,211,238,0.3)" : "linear-gradient(135deg, #22d3ee, #818cf8)", color: "white", fontSize: 15, fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                              {loading ? (<><span style={{ width: 15, height: 15, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />Analysing...</>) : "Get AI Feedback"}
                            </button>
                          )}
                          {!showFeedbackPerQ && (
                            <button onClick={() => { const r: AnswerRecord = { id: "ans_"+Date.now(), sessionId, questionId: currentQuestion?.id||"", questionText: currentQuestion?.text||"", category: currentQuestion?.category||"", type: currentQuestion?.type||"", answer, feedback: { overall_score:0, star_scores:{situation:0,task:0,action:0,result:0}, dimension_scores:{clarity:0,confidence:0,conciseness:0,storytelling:0,technical_accuracy:0}, sentence_analysis:[], delivery_analysis:{filler_words:[],hedging_phrases:[],power_words:[],active_voice_pct:0,pacing:"good",pacing_note:""}, strengths:[], improvements:[], coaching_tip:"", weakest_sentence_rewrite:{original:"",improved:""}, follow_up_question:"", ideal_90sec_structure:"", weak_areas:[], recommendation:"", encouragement:"" }, durationSec: answerDuration||60, timestamp: new Date().toISOString() }; setSessionAnswers(prev=>[...prev,r]); nextQuestion(); }}
                              style={{ flex: 1, padding: "14px", borderRadius: 14, background: "var(--surface-hi)", border: "1px solid var(--border)", color: "var(--text)", fontSize: 15, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>
                              Save & Next →
                            </button>
                          )}
                          {feedback && currentQIndex < sessionQuestions.length-1 && (
                            <button onClick={nextQuestion} style={{ padding: "14px 24px", borderRadius: 14, background: "rgba(52,211,153,0.12)", border: "1px solid rgba(52,211,153,0.25)", color: T.success, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>Next →</button>
                          )}
                          {feedback && currentQIndex === sessionQuestions.length-1 && (
                            <button onClick={endSession} disabled={summaryLoading} style={{ padding: "14px 24px", borderRadius: 14, background: "rgba(129,140,248,0.12)", border: "1px solid rgba(129,140,248,0.25)", color: T.violet, fontSize: 15, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>
                              {summaryLoading ? "Generating..." : "Finish Session"}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right sidebar — live stats bento */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Progress + avg score side by side */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                      <div style={{ ...bento, padding: "20px 16px", textAlign: "center" } as React.CSSProperties}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Question</div>
                        <div style={{ fontSize: 48, fontWeight: 800, color: T.cyan, letterSpacing: "-0.04em", lineHeight: 1 }}>{currentQIndex+1}<span style={{ fontSize: 20, color: T.tert }}>/{sessionQuestions.length}</span></div>
                      </div>
                      {sessionAnswers.filter(a => a.feedback.overall_score > 0).length > 0 && (() => {
                        const scored = sessionAnswers.filter(a => a.feedback.overall_score > 0);
                        const avg = Math.round(scored.reduce((s,a)=>s+a.feedback.overall_score,0)/scored.length);
                        return (
                          <div style={{ ...bento, padding: "20px 16px", textAlign: "center" } as React.CSSProperties}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Avg Score</div>
                            <div style={{ fontSize: 48, fontWeight: 800, color: sc(avg), letterSpacing: "-0.04em", lineHeight: 1 }}>{avg}</div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Last score breakdown */}
                    {feedback && (
                      <div style={{ ...bentoVi, padding: "22px 24px" } as React.CSSProperties}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: T.violet, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>Latest STAR</div>
                        {Object.entries(feedback.star_scores||{}).map(([k,v]) => (
                          <div key={k} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                            <span style={{ fontSize: 13, color: T.sec, width: 70, textTransform: "capitalize" }}>{k}</span>
                            <div style={{ flex: 1, height: 4, background: "var(--surface-hi)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${v}%`, background: sc(v as number), borderRadius: 2 }} /></div>
                            <span style={{ fontSize: 13, fontWeight: 700, color: sc(v as number), width: 26, textAlign: "right" }}>{v as number}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Target company */}
                    <div onClick={() => router.push("/profile")} style={{ ...bento, padding: "20px 24px", cursor: "pointer", transition: "border-color 0.2s" } as React.CSSProperties} onMouseEnter={e => (e.currentTarget.style.borderColor = "rgba(34,211,238,0.35)")} onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border)")}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>Targeting <span style={{ fontSize: 10, color: T.cyan, marginLeft: 4 }}>Edit →</span></div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--heading)" }}>{profile.targetCompany}</div>
                      <div style={{ fontSize: 14, color: T.sec, marginTop: 4 }}>{profile.targetRole}</div>
                    </div>
                  </div>
                </div>

                {/* Feedback card — full width below the grid */}
                {feedback && showFeedbackPerQ && (
                  <div className="slide-up">
                    <FeedbackCard feedback={feedback} questionText={currentQuestion?.text||""} />

                    {feedback.follow_up_question && !isFollowUp && (
                      <div style={{ ...bentoVi, padding: 20, marginTop: 12 } as React.CSSProperties}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.violet, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Follow-Up Question</div>
                        <p style={{ fontSize: 15, color: T.text, lineHeight: 1.5, margin: "0 0 14px" }}>{feedback.follow_up_question}</p>
                        <button onClick={() => { setFollowUpQ(feedback.follow_up_question); setIsFollowUp(true); setAnswer(""); setFeedback(null); setAnswerStartTime(null); }}
                          style={{ padding: "9px 20px", borderRadius: 999, background: T.violet, color: "white", fontSize: 13, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit" }}>
                          Answer Follow-Up
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Session summary */}
            {sessionSummary && <SessionSummaryView summary={sessionSummary} answers={sessionAnswers} onNewSession={() => { setSessionQuestions([]); setSessionSummary(null); setSessionAnswers([]); setFeedback(null); setAnswer(""); setSessionPlan(null); }} />}
            {summaryLoading && <div style={{ textAlign: "center", padding: "80px 0" }}><div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.07)", borderTopColor: T.violet, borderRadius: "50%", animation: "spin 0.7s linear infinite", margin: "0 auto 20px" }} /><p style={{ fontSize: 15, color: T.sec }}>Analysing your session...</p></div>}
          </div>
        )}

        {/* ── 3D MOCK INTERVIEW TAB ── */}
        {tab === "3d-interview" && (
          <div className="fade-in" style={{ margin: "-28px -28px 0", height: "calc(100vh - 56px)" }}>
            <InterviewArtifactScene
              questions={sessionQuestions.length > 0 ? sessionQuestions.map(q => q.text) : undefined}
              companyName={profile.targetCompany}
              profile={profile}
              userId={user?.id}
              sessionId={sessionId}
              role={profile.targetRole}
              onInterviewStart={() => {
                const sid = sessionIdRef.current || `3d_sess_${Date.now()}`;
                sessionIdRef.current = sid;
                setSessionId(sid);

                // Save session to localStorage immediately (appears in History even if partial)
                const session: SessionRecord = {
                  id: sid,
                  company: profile.targetCompany,
                  role: profile.targetRole,
                  startedAt: new Date().toISOString(),
                  answerCount: 0,
                  avgScore: 0,
                  weakAreas: [],
                  sessionNumber: getSessionCount() + 1,
                };
                recordSession(session);

                // Also save to cloud DB
                if (user?.id) {
                  cloudSaveSession(user.id, {
                    ...session,
                    generatedQuestions: sessionQuestions.length > 0 ? sessionQuestions : [],
                    interviewType: "3d-mock",
                    roundType: "behavioral",
                    sessionConfig: { mode: "3d-mock", company: profile.targetCompany },
                  });
                }
              }}
              onAnswerRecorded={(qIdx, answerText, audioUrl, durationSec) => {
                setAnswer(answerText);
                if (audioUrl) setAudioUrl(audioUrl);
                setCurrentQIndex(qIdx);
                const sid = sessionIdRef.current;
                if (user?.id && sid) {
                  const q = sessionQuestions[qIdx];
                  const answerId = `3d-${sid}-${qIdx}-${Date.now()}`;
                  cloudSaveAnswer(user.id, {
                    id: answerId,
                    sessionId: sid,
                    questionId: q?.id || `q-${qIdx}`,
                    questionText: q?.text || answerText.substring(0, 50),
                    category: q?.category || "general",
                    type: q?.type || "behavioral",
                    answer: answerText,
                    feedback: {},
                    durationSec: durationSec || 0,
                    transcript: answerText,
                  });
                }
              }}
              onFeedbackReceived={(qIdx, question, answerText, analysis, humanizedFeedback, durationSec) => {
                const sid = sessionIdRef.current;
                const q = sessionQuestions[qIdx];
                const answerId = `3d-${sid}-${qIdx}`;

                // Build feedback for localStorage
                const fb: FeedbackResult = {
                  overall_score: analysis.overall_score || 0,
                  star_scores: analysis.star_scores || { situation: 0, task: 0, action: 0, result: 0 },
                  dimension_scores: analysis.dimension_scores || {},
                  sentence_analysis: analysis.sentence_analysis || [],
                  delivery_analysis: analysis.delivery_analysis || {},
                  strengths: analysis.strengths || [],
                  improvements: analysis.improvements || [],
                  coaching_tip: analysis.coaching_tip || "",
                  follow_up_question: analysis.follow_up_question || (analysis.follow_up_questions || [])[0] || "",
                  weak_areas: analysis.weak_areas || [],
                  ideal_90sec_structure: analysis.ideal_answer_outline || analysis.ideal_90sec_structure || "",
                  weakest_sentence_rewrite: analysis.weakest_sentence_rewrite || "",
                  recommendation: analysis.hiring_recommendation || "",
                  encouragement: analysis.encouragement || "",
                };

                // Save to localStorage so it appears in History tab
                const answerRecord: AnswerRecord = {
                  id: answerId,
                  sessionId: sid,
                  questionId: q?.id || `q-${qIdx}`,
                  questionText: question,
                  category: q?.category || "general",
                  type: q?.type || "behavioral",
                  answer: answerText,
                  feedback: fb,
                  durationSec: durationSec || 0,
                  timestamp: new Date().toISOString(),
                };
                recordAnswer(answerRecord);

                // Save to cloud DB
                if (user?.id && sid) {
                  cloudSaveAnswer(user.id, {
                    ...answerRecord,
                    feedback: { ...analysis, humanized_feedback: humanizedFeedback },
                    transcript: answerText,
                  });
                  if (analysis.weak_areas?.length) {
                    fetch("/api/db", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        action: "updateWeakAreas",
                        userId: user.id,
                        areas: analysis.weak_areas,
                        score: analysis.overall_score || 50,
                      }),
                    }).catch(() => {});
                  }
                }
              }}
              onSessionComplete={(answers, sessionAnalysis) => {
                const sid = sessionIdRef.current;
                const avgScore = sessionAnalysis?.session_score || 0;
                const weakAreas = sessionAnalysis?.top_3_focus_areas || sessionAnalysis?.adaptive_question_topics || [];

                // Save session to localStorage so it appears in History tab
                const session: SessionRecord = {
                  id: sid,
                  company: profile.targetCompany,
                  role: profile.targetRole,
                  startedAt: new Date().toISOString(),
                  answerCount: answers.length,
                  avgScore,
                  weakAreas,
                  sessionNumber: getSessionCount() + 1,
                };
                recordSession(session);

                // Save to cloud DB
                if (user?.id && sid) {
                  cloudSaveSession(user.id, {
                    ...session,
                    sessionSummary: sessionAnalysis,
                    generatedQuestions: sessionQuestions,
                    interviewType: "3d-mock",
                    roundType: "behavioral",
                    sessionConfig: { mode: "3d-mock", company: profile.targetCompany },
                  });
                  answers.forEach(a => {
                    if (a.analysis?.weak_areas?.length) {
                      fetch("/api/db", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "updateWeakAreas", userId: user.id, areas: a.analysis.weak_areas, score: a.analysis.overall_score || 50 }),
                      }).catch(() => {});
                    }
                  });
                }
              }}
            />
          </div>
        )}

        {tab === "progress" && <ProgressDashboard />}
        {tab === "history" && <HistoryView />}
      </main>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

/* ── SESSION SUMMARY BENTO ── */
function SessionSummaryView({ summary, answers, onNewSession }: { summary: Record<string,unknown>; answers: AnswerRecord[]; onNewSession: ()=>void }) {
  const s = summary as { session_score:number; readiness_rating:number; readiness_label:string; overall_assessment:string; encouragement:string; pattern_analysis:{recurring_strengths:string[];recurring_weaknesses:string[];communication_habits:{filler_summary:string;hedging_summary:string;ownership_language:string;pacing_summary:string}}; star_breakdown:{strongest:string;weakest:string;advice:string}; top_3_priorities:Array<{area:string;why:string;how:string}>; superpower:string; company_specific_tips:string[] };
  const b = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:20, padding:22 };

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:12 }} className="fade-in">
      {/* Hero bento — 3 score tiles */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
        <div style={{ ...b, background:"rgba(34,211,238,0.06)", borderColor:"rgba(34,211,238,0.18)", textAlign:"center", padding:"28px 20px" }}>
          <div style={{ fontSize:54, fontWeight:900, color:sc(s.session_score), letterSpacing:"-0.04em", lineHeight:1 }}>{s.session_score}</div>
          <div style={{ fontSize:12, color:T.tert, marginTop:6 }}>Session Score</div>
        </div>
        <div style={{ ...b, textAlign:"center", padding:"28px 20px" }}>
          <div style={{ fontSize:54, fontWeight:900, color:T.cyan, letterSpacing:"-0.04em", lineHeight:1 }}>{s.readiness_rating}<span style={{ fontSize:24 }}>/10</span></div>
          <div style={{ fontSize:12, color:T.tert, marginTop:6 }}>Readiness</div>
        </div>
        <div style={{ ...b, background:"rgba(129,140,248,0.06)", borderColor:"rgba(129,140,248,0.18)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"28px 20px", textAlign:"center" }}>
          <div style={{ fontSize:20, fontWeight:700, color:s.readiness_label==="Interview Ready"?T.success:s.readiness_label==="Almost Ready"?T.cyan:T.warning }}>{s.readiness_label}</div>
          <div style={{ fontSize:12, color:T.tert, marginTop:6 }}>Status</div>
        </div>
      </div>

      {/* Assessment + encouragement */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        <div style={{ ...b }}>
          <div style={{ fontSize:11, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Overall Assessment</div>
          <p style={{ fontSize:14, color:T.text, lineHeight:1.6, margin:0 }}>{s.overall_assessment}</p>
        </div>
        {s.encouragement && (
          <div style={{ ...b, background:"rgba(34,211,238,0.05)", borderColor:"rgba(34,211,238,0.15)" }}>
            <div style={{ fontSize:11, fontWeight:600, color:T.cyan, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>✦ Encouragement</div>
            <p style={{ fontSize:14, color:T.text, lineHeight:1.6, margin:0, fontStyle:"italic" }}>{s.encouragement}</p>
          </div>
        )}
      </div>

      {/* Per-question scores bento */}
      <div style={{ ...b }}>
        <div style={{ fontSize:11, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14 }}>Question Scores</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(180px, 1fr))", gap:10 }}>
          {answers.map((a,i) => (
            <div key={i} style={{ padding:14, background:"var(--surface)", borderRadius:14, display:"flex", flexDirection:"column", gap:6 }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:34, height:34, borderRadius:"50%", background:`${sc(a.feedback.overall_score)}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:sc(a.feedback.overall_score), flexShrink:0 }}>{a.feedback.overall_score||"—"}</div>
                <span style={{ fontSize:12, color:T.sec, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>Q{i+1}</span>
              </div>
              <p style={{ fontSize:12, color:T.tert, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.questionText}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Communication + STAR row */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
        {s.pattern_analysis?.communication_habits && (
          <div style={{ ...b }}>
            <div style={{ fontSize:11, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14 }}>Communication Patterns</div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {[["Filler words", s.pattern_analysis.communication_habits.filler_summary, T.danger], ["Hedging", s.pattern_analysis.communication_habits.hedging_summary, T.warning], ["Ownership", s.pattern_analysis.communication_habits.ownership_language, T.cyan], ["Pacing", s.pattern_analysis.communication_habits.pacing_summary, T.success]].map(([label, value, color]) => (
                <div key={label as string} style={{ padding:"10px 12px", background:`${color}0A`, borderRadius:10 }}>
                  <div style={{ fontSize:10, fontWeight:600, color:color as string, marginBottom:4, textTransform:"uppercase", letterSpacing:"0.05em" }}>{label as string}</div>
                  <p style={{ fontSize:12, color:T.text, margin:0, lineHeight:1.45 }}>{value as string}</p>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {s.star_breakdown && (
            <div style={{ ...b }}>
              <div style={{ fontSize:11, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>STAR Pattern</div>
              <div style={{ display:"flex", gap:10, marginBottom:10 }}>
                <div style={{ flex:1, padding:12, background:`${T.success}0D`, borderRadius:10, textAlign:"center" }}><div style={{ fontSize:10, color:T.success, fontWeight:600, marginBottom:4 }}>STRONGEST</div><div style={{ fontSize:14, fontWeight:700, color:"var(--heading)", textTransform:"capitalize" }}>{s.star_breakdown.strongest}</div></div>
                <div style={{ flex:1, padding:12, background:`${T.danger}0D`, borderRadius:10, textAlign:"center" }}><div style={{ fontSize:10, color:T.danger, fontWeight:600, marginBottom:4 }}>WEAKEST</div><div style={{ fontSize:14, fontWeight:700, color:"var(--heading)", textTransform:"capitalize" }}>{s.star_breakdown.weakest}</div></div>
              </div>
              <p style={{ fontSize:12, color:T.sec, margin:0, lineHeight:1.5 }}>{s.star_breakdown.advice}</p>
            </div>
          )}
          {s.superpower && (
            <div style={{ ...b, background:"rgba(129,140,248,0.07)", borderColor:"rgba(129,140,248,0.18)", flex:1 }}>
              <div style={{ fontSize:11, fontWeight:600, color:T.violet, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>✦ Your Superpower</div>
              <p style={{ fontSize:14, color:T.text, lineHeight:1.55, margin:0 }}>{s.superpower}</p>
            </div>
          )}
        </div>
      </div>

      {/* Top 3 priorities bento */}
      {s.top_3_priorities?.length > 0 && (
        <div style={{ ...b }}>
          <div style={{ fontSize:11, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14 }}>Next Session Priorities</div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3, 1fr)", gap:10 }}>
            {s.top_3_priorities.map((p,i) => (
              <div key={i} style={{ padding:16, background:"var(--surface)", borderRadius:14 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <div style={{ width:22, height:22, borderRadius:"50%", background:`linear-gradient(135deg, #22d3ee, #818cf8)`, color:"white", fontSize:11, fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{i+1}</div>
                  <span style={{ fontSize:13, fontWeight:600, color:"var(--heading)" }}>{p.area}</span>
                </div>
                <p style={{ fontSize:12, color:T.sec, margin:"0 0 6px", lineHeight:1.4 }}>{p.why}</p>
                <p style={{ fontSize:12, color:T.cyan, margin:0, lineHeight:1.4 }}>{p.how}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Company-specific tips */}
      {s.company_specific_tips?.length > 0 && (
        <div style={{ ...b }}>
          <div style={{ fontSize:11, fontWeight:600, color:T.violet, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14 }}>Company-Specific Tips</div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {s.company_specific_tips.map((tip,i) => (
              <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                <span style={{ color:T.cyan, fontSize:14, flexShrink:0, marginTop:1 }}>→</span>
                <p style={{ fontSize:13, color:T.text, margin:0, lineHeight:1.5 }}>{tip}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <button onClick={onNewSession} style={{ width:"100%", padding:16, borderRadius:16, background:"linear-gradient(135deg, #22d3ee, #818cf8)", color:"white", fontSize:15, fontWeight:700, border:"none", cursor:"pointer", fontFamily:"inherit", letterSpacing:"-0.01em" }}>
        Start New Session
      </button>
    </div>
  );
}

/* ── HISTORY BENTO VIEW ── */
function HistoryView() {
  const [profile, setProfile] = useState(getProfile());
  const [expandedAnswer, setExpandedAnswer] = useState<string|null>(null);
  useEffect(() => { setProfile(getProfile()); }, []);
  const b = { background:"var(--surface)", border:"1px solid var(--border)", borderRadius:18 };

  if (!profile || !profile.answers || profile.answers.length === 0) return (
    <div style={{ textAlign:"center", padding:"80px 0" }}>
      <div style={{ fontSize:48, marginBottom:16 }}>🕐</div>
      <h3 style={{ fontSize:22, fontWeight:700, color:"white", letterSpacing:"-0.02em", marginBottom:8 }}>No history yet</h3>
      <p style={{ fontSize:15, color:T.sec }}>Complete some practice questions to see your history.</p>
    </div>
  );

  // Group by session
  const sessionMap = new Map<string,AnswerRecord[]>();
  for (const a of profile.answers) { const sid = a.sessionId || "unknown"; if (!sessionMap.has(sid)) sessionMap.set(sid,[]); sessionMap.get(sid)!.push(a); }

  // Group sessions by company
  const companyGroups = new Map<string, Array<{ sessId: string; session: SessionRecord | undefined; answers: AnswerRecord[]; avg: number }>>();
  for (const [sessId, answers] of sessionMap.entries()) {
    const session = (profile.sessions || []).find(s => s.id === sessId);
    const company = session?.company || "Practice";
    const scored = answers.filter(a => a.feedback?.overall_score > 0);
    const avg = scored.length > 0 ? Math.round(scored.reduce((s, a) => s + (a.feedback?.overall_score || 0), 0) / scored.length) : 0;
    if (!companyGroups.has(company)) companyGroups.set(company, []);
    companyGroups.get(company)!.push({ sessId, session, answers, avg });
  }

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:20 }} className="fade-in">
      <h2 style={{ fontSize:24, fontWeight:700, color:"var(--heading)", letterSpacing:"-0.02em", margin:"0 0 4px" }}>Interview History</h2>
      {Array.from(companyGroups.entries()).map(([company, sessions]) => {
        const totalSessions = sessions.length;
        const allScored = sessions.flatMap(s => s.answers.filter(a => a.feedback?.overall_score > 0));
        const companyAvg = allScored.length > 0 ? Math.round(allScored.reduce((s, a) => s + (a.feedback?.overall_score || 0), 0) / allScored.length) : 0;
        return (
          <div key={company} style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {/* Company header */}
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0 4px" }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:10, background:"linear-gradient(135deg, rgba(34,211,238,0.15), rgba(129,140,248,0.15))", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15 }}>🏢</div>
                <div>
                  <div style={{ fontSize:16, fontWeight:700, color:"var(--heading)" }}>{company}</div>
                  <div style={{ fontSize:12, color:T.tert }}>{totalSessions} session{totalSessions !== 1 ? "s" : ""} · {allScored.length} answered</div>
                </div>
              </div>
              {companyAvg > 0 && <span style={{ fontSize:14, fontWeight:800, color:sc(companyAvg), background:`${sc(companyAvg)}18`, padding:"5px 16px", borderRadius:999 }}>{companyAvg} avg</span>}
            </div>

            {/* Sessions for this company */}
            {sessions.map(({ sessId, session, answers, avg }) => (
          <details key={sessId} style={{ ...b, overflow:"hidden" }}>
            <summary style={{ padding:"18px 22px", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"space-between" }}>
              <div>
                <span style={{ fontSize:15, fontWeight:600, color:"white" }}>{session?.role || "General Prep"}</span>
                <span style={{ fontSize:13, color:T.sec, marginLeft:10 }}>{answers[0]?.timestamp ? new Date(answers[0].timestamp).toLocaleDateString() : "—"} · {answers.length} Qs</span>
              </div>
              {avg>0 && <span style={{ fontSize:14, fontWeight:800, color:sc(avg), background:`${sc(avg)}18`, padding:"4px 14px", borderRadius:999 }}>{avg} avg</span>}
            </summary>
            <div style={{ borderTop:"1px solid var(--border)" }}>
              {answers.map(a => {
                const isExp = expandedAnswer===a.id;
                const fb = a.feedback;
                if (!fb) return (
                  <div key={a.id} style={{ padding:"14px 22px", borderBottom:"1px solid var(--border)" }}>
                    <p style={{ fontSize:13, color:T.sec, margin:0 }}>{a.questionText || "Unknown question"}</p>
                    <p style={{ fontSize:12, color:T.tert, margin:"4px 0 0" }}>No feedback data available</p>
                  </div>
                );
                return (
                  <div key={a.id} style={{ borderBottom:"1px solid var(--border)" }}>
                    <button onClick={()=>setExpandedAnswer(isExp?null:a.id)}
                      style={{ width:"100%", padding:"14px 22px", textAlign:"left", background:"none", border:"none", cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:12 }}>
                      {(fb.overall_score||0)>0 && <div style={{ width:34, height:34, borderRadius:"50%", background:`${sc(fb.overall_score)}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:800, color:sc(fb.overall_score), flexShrink:0 }}>{fb.overall_score}</div>}
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:14, color:T.text, margin:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{a.questionText || "Question"}</p>
                        <div style={{ display:"flex", gap:8, marginTop:2 }}>
                          {a.type && <span style={{ fontSize:12, color:T.tert }}>{a.type}</span>}
                          {a.durationSec > 0 && <span style={{ fontSize:12, color:T.tert }}>{a.durationSec}s</span>}
                        </div>
                      </div>
                      <span style={{ color:T.tert, fontSize:12, transition:"transform 0.2s", transform:isExp?"rotate(180deg)":"none" }}>▼</span>
                    </button>
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {isExp && (
                      <div style={{ padding:"0 22px 22px", display:"flex", flexDirection:"column", gap:10 }}>
                        {/* Question + Answer */}
                        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                          <div style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.cyan, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Question</div>
                            <p style={{ fontSize:13, color:T.text, margin:0, lineHeight:1.5 }}>{a.questionText || "—"}</p>
                          </div>
                          {a.answer && (
                            <div style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                              <div style={{ fontSize:10, fontWeight:600, color:T.violet, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Your Answer · {a.durationSec||0}s</div>
                              <p style={{ fontSize:13, color:T.text, margin:0, lineHeight:1.5, maxHeight:100, overflowY:"auto", whiteSpace:"pre-wrap" }}>{a.answer}</p>
                            </div>
                          )}
                        </div>

                        {/* STAR Scores */}
                        {fb.star_scores && typeof fb.star_scores === "object" && Object.keys(fb.star_scores).length > 0 && (
                          <div style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>STAR Scores</div>
                            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                              {Object.entries(fb.star_scores).map(([k,v]) => <div key={k} style={{ textAlign:"center" }}><div style={{ fontSize:22, fontWeight:800, color:sc(v as number) }}>{v as number}</div><div style={{ fontSize:10, color:T.tert, textTransform:"capitalize", marginTop:2 }}>{k}</div></div>)}
                            </div>
                          </div>
                        )}

                        {/* Dimension Scores */}
                        {fb.dimension_scores && typeof fb.dimension_scores === "object" && Object.keys(fb.dimension_scores).length > 0 && (
                          <div style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Dimensions</div>
                            {Object.entries(fb.dimension_scores).map(([k,v]) => (
                              <div key={k} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                                <span style={{ fontSize:12, color:T.sec, width:120, textTransform:"capitalize" }}>{k.replace(/_/g," ")}</span>
                                <div style={{ flex:1, height:3, background:"var(--surface-hi)", borderRadius:2, overflow:"hidden" }}><div style={{ height:"100%", width:`${Math.min(100, v as number)}%`, background:sc(v as number), borderRadius:2 }} /></div>
                                <span style={{ fontSize:12, fontWeight:700, color:sc(v as number), width:24, textAlign:"right" }}>{v as number}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Sentence Analysis */}
                        {Array.isArray(fb.sentence_analysis) && fb.sentence_analysis.length > 0 && (
                          <div style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Sentence Analysis</div>
                            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {fb.sentence_analysis.map((s: any, i: number) => (
                                <div key={i} style={{ padding:"10px 12px", borderRadius:10, borderLeft:`3px solid ${s.rating==="strong"?T.success:s.rating==="okay"?T.warning:T.danger}`, background: s.rating==="strong"?"rgba(52,211,153,0.06)":s.rating==="okay"?"rgba(251,191,36,0.06)":"rgba(248,113,113,0.06)" }}>
                                  <p style={{ fontSize:12, color:T.text, margin:0, lineHeight:1.5 }}>&quot;{s.sentence}&quot;</p>
                                  <p style={{ fontSize:11, color:T.tert, margin:"4px 0 0" }}>{s.reason}</p>
                                  {s.rewrite && <p style={{ fontSize:12, color:T.cyan, margin:"4px 0 0" }}>Better: &quot;{s.rewrite}&quot;</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Delivery Analysis */}
                        {fb.delivery_analysis && typeof fb.delivery_analysis === "object" && Object.keys(fb.delivery_analysis).length > 0 && (
                          <div style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:12 }}>Delivery Analysis</div>
                            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                              {Array.isArray(fb.delivery_analysis.filler_words) && fb.delivery_analysis.filler_words.length > 0 && (
                                <div style={{ padding:10, background:"rgba(248,113,113,0.06)", borderRadius:10 }}>
                                  <div style={{ fontSize:10, fontWeight:600, color:T.danger, marginBottom:4, textTransform:"uppercase" }}>Filler Words</div>
                                  <p style={{ fontSize:12, color:T.text, margin:0 }}>{fb.delivery_analysis.filler_words.join(", ")}</p>
                                </div>
                              )}
                              {Array.isArray(fb.delivery_analysis.hedging_phrases) && fb.delivery_analysis.hedging_phrases.length > 0 && (
                                <div style={{ padding:10, background:"rgba(251,191,36,0.06)", borderRadius:10 }}>
                                  <div style={{ fontSize:10, fontWeight:600, color:T.warning, marginBottom:4, textTransform:"uppercase" }}>Hedging</div>
                                  <p style={{ fontSize:12, color:T.text, margin:0 }}>{fb.delivery_analysis.hedging_phrases.join(", ")}</p>
                                </div>
                              )}
                              {Array.isArray(fb.delivery_analysis.power_words) && fb.delivery_analysis.power_words.length > 0 && (
                                <div style={{ padding:10, background:"rgba(52,211,153,0.06)", borderRadius:10 }}>
                                  <div style={{ fontSize:10, fontWeight:600, color:T.success, marginBottom:4, textTransform:"uppercase" }}>Power Words</div>
                                  <p style={{ fontSize:12, color:T.text, margin:0 }}>{fb.delivery_analysis.power_words.join(", ")}</p>
                                </div>
                              )}
                              {fb.delivery_analysis.active_voice_pct != null && (
                                <div style={{ padding:10, background:"rgba(34,211,238,0.06)", borderRadius:10 }}>
                                  <div style={{ fontSize:10, fontWeight:600, color:T.cyan, marginBottom:4, textTransform:"uppercase" }}>Active Voice</div>
                                  <p style={{ fontSize:12, color:T.text, margin:0 }}>{fb.delivery_analysis.active_voice_pct}%</p>
                                </div>
                              )}
                            </div>
                            {fb.delivery_analysis.pacing_note && <p style={{ fontSize:11, color:T.tert, margin:"8px 0 0" }}>Pacing: {fb.delivery_analysis.pacing_note}</p>}
                          </div>
                        )}

                        {/* Strengths & Improvements */}
                        {(Array.isArray(fb.strengths) && fb.strengths.length>0 || Array.isArray(fb.improvements) && fb.improvements.length>0) && (
                          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                            {Array.isArray(fb.strengths) && fb.strengths.length>0 && <div style={{ padding:14, background:"rgba(52,211,153,0.06)", border:"1px solid rgba(52,211,153,0.15)", borderRadius:14 }}><div style={{ fontSize:10, fontWeight:600, color:T.success, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>Strengths</div>{fb.strengths.map((s:string,i:number)=><div key={i} style={{ fontSize:12, color:T.text, marginBottom:4 }}>+ {s}</div>)}</div>}
                            {Array.isArray(fb.improvements) && fb.improvements.length>0 && <div style={{ padding:14, background:"rgba(248,113,113,0.06)", border:"1px solid rgba(248,113,113,0.15)", borderRadius:14 }}><div style={{ fontSize:10, fontWeight:600, color:T.danger, marginBottom:8, textTransform:"uppercase", letterSpacing:"0.05em" }}>Improve</div>{fb.improvements.map((s:string,i:number)=><div key={i} style={{ fontSize:12, color:T.text, marginBottom:4 }}>– {s}</div>)}</div>}
                          </div>
                        )}

                        {/* Coaching Tip */}
                        {fb.coaching_tip && <div style={{ padding:14, background:"rgba(34,211,238,0.06)", border:"1px solid rgba(34,211,238,0.15)", borderRadius:14 }}><div style={{ fontSize:10, fontWeight:600, color:T.cyan, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>Coaching Tip</div><p style={{ fontSize:13, color:T.text, margin:0, lineHeight:1.5 }}>{fb.coaching_tip}</p></div>}

                        {/* Weak Areas */}
                        {Array.isArray(fb.weak_areas) && fb.weak_areas.length > 0 && (
                          <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                            {fb.weak_areas.map((w:string,i:number) => (
                              <span key={i} style={{ fontSize:11, fontWeight:600, color:T.danger, background:"rgba(248,113,113,0.12)", padding:"4px 12px", borderRadius:999 }}>{WEAK_AREA_LABELS[w]||w}</span>
                            ))}
                          </div>
                        )}

                        {/* Weakest Sentence Rewrite */}
                        {fb.weakest_sentence_rewrite && typeof fb.weakest_sentence_rewrite === "object" && fb.weakest_sentence_rewrite.original && (
                          <div style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:8 }}>Best Single Improvement</div>
                            <p style={{ fontSize:12, color:T.danger, margin:"0 0 4px", textDecoration:"line-through" }}>{fb.weakest_sentence_rewrite.original}</p>
                            <p style={{ fontSize:12, color:T.success, margin:0 }}>{fb.weakest_sentence_rewrite.improved}</p>
                          </div>
                        )}

                        {/* Follow-up Question */}
                        {fb.follow_up_question && (
                          <div style={{ padding:14, background:"rgba(129,140,248,0.06)", border:"1px solid rgba(129,140,248,0.15)", borderRadius:14 }}>
                            <div style={{ fontSize:10, fontWeight:600, color:T.violet, marginBottom:6, textTransform:"uppercase", letterSpacing:"0.05em" }}>Likely Follow-Up</div>
                            <p style={{ fontSize:13, color:T.text, margin:0, lineHeight:1.5 }}>{fb.follow_up_question}</p>
                          </div>
                        )}

                        {/* Ideal 90-Second Structure */}
                        {fb.ideal_90sec_structure && (
                          <details style={{ padding:14, background:"var(--surface)", borderRadius:14 }}>
                            <summary style={{ fontSize:10, fontWeight:600, color:T.cyan, textTransform:"uppercase", letterSpacing:"0.07em", cursor:"pointer" }}>Ideal 90-Second Answer Structure</summary>
                            <p style={{ fontSize:12, color:T.text, margin:"8px 0 0", lineHeight:1.55, whiteSpace:"pre-wrap" }}>{fb.ideal_90sec_structure}</p>
                          </details>
                        )}

                        {/* Recommendation & Encouragement */}
                        {fb.recommendation && (
                          <div style={{ padding:14, borderRadius:14, background: fb.recommendation==="Strong"?"rgba(52,211,153,0.06)":fb.recommendation==="Good"?"rgba(34,211,238,0.06)":"rgba(251,191,36,0.06)", border:`1px solid ${fb.recommendation==="Strong"?"rgba(52,211,153,0.18)":fb.recommendation==="Good"?"rgba(34,211,238,0.18)":"rgba(251,191,36,0.18)"}` }}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ fontSize:14, fontWeight:700, color: fb.recommendation==="Strong"?T.success:fb.recommendation==="Good"?T.cyan:T.warning }}>{fb.recommendation}</span>
                              {fb.encouragement && <span style={{ fontSize:12, color:T.tert }}>{fb.encouragement}</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </details>
            ))}
          </div>
        );
      })}
    </div>
  );
}
