"use client";
import { useState, useEffect, useCallback } from "react";
import VoiceRecorder from "@/components/VoiceRecorder";
import FeedbackCard from "@/components/FeedbackCard";
import ProgressDashboard from "@/components/ProgressDashboard";
import { QUESTION_BANK, WEAK_AREA_LABELS, Question } from "@/lib/questions";
import { getCompanyPattern } from "@/lib/company-patterns";
import {
  getProfile, saveUserProfile, recordAnswer, recordSession, getWeakAreas, getSessionCount,
  FeedbackResult, AnswerRecord, SessionRecord, UserProfile,
} from "@/lib/store";
import {
  cloudGetOrCreateUser, cloudSaveProfile, cloudSaveSession, cloudSaveAnswer,
} from "@/lib/cloud-sync";

type Tab = "setup" | "practice" | "progress" | "history";

interface AdaptiveQuestion {
  id: string;
  text: string;
  type: string;
  category: string;
  targets_weakness: string[];
  difficulty: string;
  hint: string;
  company_context?: string;
  time_target_sec?: number;
  delivery_note?: string;
}

interface SessionPlan {
  session_plan: {
    focus_message: string;
    primary_weakness: string;
    expected_improvement: string;
    delivery_challenge?: string;
  };
  questions: AdaptiveQuestion[];
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("setup");
  const [profile, setProfile] = useState<UserProfile>({
    name: "", background: "", targetRole: "Software Engineer",
    targetCompany: "Google", experience: "", skills: "",
  });
  const [profileSaved, setProfileSaved] = useState(false);
  const [resumeText, setResumeText] = useState("");
  const [userContext, setUserContext] = useState("");
  const [parsing, setParsing] = useState(false);
  const [showContextPrompt, setShowContextPrompt] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [resumeHighlights, setResumeHighlights] = useState<any>(null);
  const [cloudUserId, setCloudUserId] = useState<string | null>(null);

  // Session state
  const [sessionId, setSessionId] = useState("");
  const [sessionQuestions, setSessionQuestions] = useState<(Question | AdaptiveQuestion)[]>([]);
  const [sessionPlan, setSessionPlan] = useState<SessionPlan | null>(null);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answerDuration, setAnswerDuration] = useState(0);
  const [answerStartTime, setAnswerStartTime] = useState<number | null>(null);

  // Feedback state
  const [feedback, setFeedback] = useState<FeedbackResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionAnswers, setSessionAnswers] = useState<AnswerRecord[]>([]);
  const [showFeedbackPerQ, setShowFeedbackPerQ] = useState(true);

  // Session summary
  const [sessionSummary, setSessionSummary] = useState<Record<string, unknown> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Generating session
  const [generatingSession, setGeneratingSession] = useState(false);

  // Load saved profile on mount + sync to cloud
  useEffect(() => {
    const saved = getProfile();
    if (saved.userProfile?.name) {
      setProfile(saved.userProfile);
      setProfileSaved(true);
      if (saved.answers.length > 0) setTab("practice");
      // Connect to InsForge cloud
      cloudGetOrCreateUser(saved.userProfile.name).then(uid => {
        if (uid) setCloudUserId(uid);
      });
    }
  }, []);

  const saveProfile = useCallback(() => {
    saveUserProfile(profile);
    setProfileSaved(true);
    setTab("practice");
    // Sync to InsForge cloud
    if (profile.name) {
      cloudGetOrCreateUser(profile.name).then(uid => {
        if (uid) {
          setCloudUserId(uid);
          cloudSaveProfile(uid, profile);
        }
      });
    }
  }, [profile]);

  const autoFillFromResumeOrContext = useCallback(async () => {
    if (!resumeText && !userContext) return;
    setParsing(true);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: resumeText, context: userContext }),
      });
      const data = await res.json();
      if (data.profile) {
        const p = data.profile;
        setProfile(prev => ({
          ...prev,
          name: p.name || prev.name,
          background: p.background || prev.background,
          targetRole: p.targetRole || prev.targetRole,
          targetCompany: p.targetCompany || prev.targetCompany,
          experience: p.experience || prev.experience,
          skills: p.skills || prev.skills,
        }));
        if (p.resumeHighlights) setResumeHighlights(p.resumeHighlights);
      }
    } catch (e) {
      console.error("Auto-fill error:", e);
    } finally {
      setParsing(false);
    }
  }, [resumeText, userContext]);

  // Start a new session — either with default Qs or adaptive AI-generated Qs
  const startSession = useCallback(async (useAdaptive: boolean) => {
    const sid = "sess_" + Date.now();
    setSessionId(sid);
    setCurrentQIndex(0);
    setFeedback(null);
    setAnswer("");
    setSessionAnswers([]);
    setSessionSummary(null);

    if (useAdaptive) {
      setGeneratingSession(true);
      try {
        const weakAreas = getWeakAreas().map(w => ({
          area: w.area, score: w.avgScore, frequency: w.totalOccurrences,
        }));
        const savedProfile = getProfile();
        const res = await fetch("/api/adaptive", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "generate_session",
            company: profile.targetCompany,
            role: profile.targetRole,
            profile,
            weakAreas,
            completedQuestions: savedProfile.completedQuestionTexts,
            sessionNumber: getSessionCount() + 1,
            communicationHabits: {
              fillerFrequency: savedProfile.totalFillerWords > 10 ? "high" : "normal",
              hedgingFrequency: savedProfile.totalHedgingPhrases > 5 ? "high" : "normal",
              pacingIssue: savedProfile.pacingDistribution.too_long > savedProfile.pacingDistribution.good ? "tends to ramble" : "okay",
            },
          }),
        });
        const data = await res.json();
        if (data.session) {
          setSessionPlan(data.session);
          setSessionQuestions(data.session.questions);
        } else {
          // Fallback to default
          setSessionQuestions(QUESTION_BANK.slice(0, 5));
        }
      } catch {
        setSessionQuestions(QUESTION_BANK.slice(0, 5));
      } finally {
        setGeneratingSession(false);
      }
    } else {
      setSessionPlan(null);
      setSessionQuestions(QUESTION_BANK.slice(0, 5));
    }

    // Record session
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
  }, [profile]);

  const currentQuestion = sessionQuestions[currentQIndex] || null;

  const handleTranscript = useCallback((text: string) => {
    setAnswer(text);
    if (answerStartTime) {
      setAnswerDuration(Math.round((Date.now() - answerStartTime) / 1000));
    }
  }, [answerStartTime]);

  const handleRecordingChange = useCallback((isRecording: boolean) => {
    if (isRecording) {
      setAnswerStartTime(Date.now());
      setFeedback(null);
    }
  }, []);

  // Get feedback for current answer
  const getFeedback = useCallback(async () => {
    if (!answer || !currentQuestion) return;
    setLoading(true);
    try {
      const q = currentQuestion;
      const prevAttempts = getProfile().answers
        .filter(a => a.questionText === q.text)
        .map(a => ({ score: a.feedback.overall_score, weakAreas: a.feedback.weak_areas }));

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q.text,
          answer,
          category: q.category,
          questionType: q.type,
          company: profile.targetCompany,
          role: profile.targetRole,
          profile,
          answerDurationSec: answerDuration || 60,
          modelAnswer: undefined,
          previousAttempts: prevAttempts.length > 0 ? prevAttempts : undefined,
        }),
      });
      const data = await res.json();
      if (data.feedback) {
        setFeedback(data.feedback);

        // Record the answer
        const record: AnswerRecord = {
          id: "ans_" + Date.now(),
          sessionId,
          questionId: q.id,
          questionText: q.text,
          category: q.category,
          type: q.type,
          answer,
          feedback: data.feedback,
          durationSec: answerDuration || 60,
          timestamp: new Date().toISOString(),
        };
        recordAnswer(record);
        setSessionAnswers(prev => [...prev, record]);

        // Update session record
        const allScores = [...sessionAnswers, record].map(a => a.feedback.overall_score);
        const allWeak = [...new Set([...sessionAnswers, record].flatMap(a => a.feedback.weak_areas))];
        const sessionData = {
          id: sessionId,
          company: profile.targetCompany,
          role: profile.targetRole,
          startedAt: new Date().toISOString(),
          answerCount: allScores.length,
          avgScore: Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length),
          weakAreas: allWeak,
          sessionNumber: getSessionCount(),
        };
        recordSession(sessionData);

        // Sync to InsForge cloud
        if (cloudUserId) {
          cloudSaveAnswer(cloudUserId, { ...record, feedback: record.feedback as unknown as Record<string, unknown> });
          cloudSaveSession(cloudUserId, sessionData);
        }
      }
    } catch (e) {
      console.error("Feedback error:", e);
    } finally {
      setLoading(false);
    }
  }, [answer, currentQuestion, profile, answerDuration, sessionId, sessionAnswers]);

  // Skip feedback and go to next question
  const nextQuestion = useCallback(() => {
    if (currentQIndex < sessionQuestions.length - 1) {
      setCurrentQIndex(i => i + 1);
      setAnswer("");
      setFeedback(null);
      setAnswerStartTime(null);
    }
  }, [currentQIndex, sessionQuestions.length]);

  // End session and get summary
  const endSession = useCallback(async () => {
    if (sessionAnswers.length === 0) return;
    setSummaryLoading(true);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "session_summary",
          company: profile.targetCompany,
          role: profile.targetRole,
          profile,
          sessionNumber: getSessionCount(),
          answers: sessionAnswers.map(a => ({
            question: a.questionText,
            answer: a.answer,
            score: a.feedback.overall_score,
            weakAreas: a.feedback.weak_areas,
            starScores: a.feedback.star_scores,
            dimensionScores: a.feedback.dimension_scores,
            deliveryAnalysis: a.feedback.delivery_analysis || {
              filler_words: [], hedging_phrases: [], power_words: [],
              active_voice_pct: 0, pacing: "good",
            },
          })),
        }),
      });
      const data = await res.json();
      if (data.summary) {
        setSessionSummary(data.summary);
      }
    } catch (e) {
      console.error("Summary error:", e);
    } finally {
      setSummaryLoading(false);
    }
  }, [sessionAnswers, profile]);

  const companyPattern = getCompanyPattern(profile.targetCompany);

  return (
    <div className="min-h-screen bg-bg">
      {/* Top Nav */}
      <nav className="bg-surface border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-accent">InterviewCoach</span>
          <span className="text-xs text-muted bg-card px-2 py-0.5 rounded">AI-Powered</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(["setup", "practice", "progress", "history"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t ? "bg-accent text-white" : "text-muted hover:bg-card hover:text-slate-200"
                }`}
              >
                {t === "setup" ? "Profile" : t === "practice" ? "Practice" : t === "progress" ? "Progress" : "History"}
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ═══════ SETUP TAB ═══════ */}
        {tab === "setup" && (
          <div className="max-w-2xl mx-auto space-y-5">
            <h2 className="text-xl font-bold text-slate-200">Your Profile</h2>
            <p className="text-sm text-muted">Paste your resume or LLM-generated context to auto-fill, or fill manually.</p>

            {/* ── Quick Fill Section ── */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-accent2">Quick Fill (Optional)</h3>
              <p className="text-xs text-muted">Paste your resume text and/or an LLM-generated context summary. We&apos;ll auto-fill everything.</p>

              {/* Resume */}
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Resume (paste text)</label>
                <textarea
                  value={resumeText}
                  onChange={e => setResumeText(e.target.value)}
                  placeholder="Paste your resume text here... (copy from your PDF/DOCX)"
                  rows={4}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-y"
                />
              </div>

              {/* Context */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs text-muted font-semibold">LLM-Generated Context (paste output)</label>
                  <button
                    onClick={() => setShowContextPrompt(!showContextPrompt)}
                    className="text-[10px] text-accent hover:underline"
                  >
                    {showContextPrompt ? "Hide prompt" : "Get the prompt to generate this"}
                  </button>
                </div>

                {showContextPrompt && (
                  <div className="bg-bg border border-accent/30 rounded-lg p-3 mb-2">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] text-accent font-bold uppercase tracking-wider">Copy this prompt → paste into ChatGPT / Claude / Gemini</span>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(CONTEXT_GENERATION_PROMPT);
                        }}
                        className="text-[10px] bg-accent/20 text-accent px-2 py-1 rounded hover:bg-accent/30 transition-colors"
                      >
                        Copy Prompt
                      </button>
                    </div>
                    <pre className="text-xs text-slate-400 whitespace-pre-wrap max-h-48 overflow-y-auto leading-relaxed">{CONTEXT_GENERATION_PROMPT}</pre>
                  </div>
                )}

                <textarea
                  value={userContext}
                  onChange={e => setUserContext(e.target.value)}
                  placeholder="Paste the LLM-generated context here..."
                  rows={4}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-y"
                />
              </div>

              <button
                onClick={autoFillFromResumeOrContext}
                disabled={parsing || (!resumeText && !userContext)}
                className="w-full py-2.5 bg-accent2 text-bg rounded-lg text-sm font-semibold hover:bg-accent2/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {parsing ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="inline-block w-4 h-4 border-2 border-bg/30 border-t-bg rounded-full animate-spin" />
                    Analyzing & auto-filling...
                  </span>
                ) : "Auto-Fill Profile from Resume / Context"}
              </button>
            </div>

            {/* ── Resume Highlights (shown after auto-fill) ── */}
            {resumeHighlights && (
              <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                <h4 className="text-xs font-bold text-accent uppercase tracking-wider mb-2">Resume Analysis</h4>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  {resumeHighlights.years_of_experience > 0 && (
                    <div><span className="text-muted">Experience:</span> <span className="text-slate-200">{resumeHighlights.years_of_experience} years</span></div>
                  )}
                  {resumeHighlights.education && (
                    <div><span className="text-muted">Education:</span> <span className="text-slate-200">{resumeHighlights.education}</span></div>
                  )}
                </div>
                {resumeHighlights.key_metrics?.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[10px] text-green-400 font-bold">KEY METRICS</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {resumeHighlights.key_metrics.map((m: string, i: number) => (
                        <span key={i} className="text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded">{m}</span>
                      ))}
                    </div>
                  </div>
                )}
                {resumeHighlights.gaps_to_address?.length > 0 && (
                  <div className="mt-2">
                    <span className="text-[10px] text-yellow-400 font-bold">AREAS TO PREP</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {resumeHighlights.gaps_to_address.map((g: string, i: number) => (
                        <span key={i} className="text-[10px] bg-yellow-900/30 text-yellow-400 px-2 py-0.5 rounded">{g}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Manual Fields ── */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-slate-200">Profile Details {resumeHighlights ? "(auto-filled — edit as needed)" : ""}</h3>
              <Field label="Name" value={profile.name} onChange={v => setProfile(p => ({ ...p, name: v }))} placeholder="Your name" />
              <Field label="Background" value={profile.background} onChange={v => setProfile(p => ({ ...p, background: v }))} placeholder="e.g., CS student, 3 years as backend engineer" />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted font-semibold block mb-1">Target Company</label>
                  <select
                    value={profile.targetCompany}
                    onChange={e => setProfile(p => ({ ...p, targetCompany: e.target.value }))}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
                  >
                    {["Google", "Amazon", "Meta", "Microsoft", "Apple", "Netflix", "Startup", "General"].map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <Field label="Target Role" value={profile.targetRole} onChange={v => setProfile(p => ({ ...p, targetRole: v }))} placeholder="SWE Intern, Senior SDE, etc." />
              </div>
              <Field label="Experience Summary" value={profile.experience} onChange={v => setProfile(p => ({ ...p, experience: v }))} placeholder="Key projects, companies, achievements with metrics." multiline />
              <Field label="Key Skills" value={profile.skills} onChange={v => setProfile(p => ({ ...p, skills: v }))} placeholder="Python, React, AWS, System Design, ML, etc." />
              <button
                onClick={saveProfile}
                disabled={!profile.name}
                className="w-full py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {profileSaved ? "Update & Continue" : "Save & Start Practicing"}
              </button>
            </div>
          </div>
        )}

        {/* ═══════ PRACTICE TAB ═══════ */}
        {tab === "practice" && (
          <div className="space-y-4">
            {/* Company Pattern Info */}
            {sessionQuestions.length === 0 && !generatingSession && companyPattern.name !== "General" && (
              <div className="bg-surface border border-border rounded-xl p-4 fade-in">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-bold text-accent2">{companyPattern.name} Interview Intel</span>
                </div>
                <p className="text-xs text-muted mb-2">{companyPattern.interviewStyle.substring(0, 200)}</p>
                <div className="flex flex-wrap gap-1">
                  {companyPattern.whatTheyLookFor.slice(0, 4).map((w, i) => (
                    <span key={i} className="text-[10px] bg-accent2/10 text-accent2 px-2 py-0.5 rounded">{w}</span>
                  ))}
                </div>
                <details className="mt-2">
                  <summary className="text-[10px] text-accent cursor-pointer">Key principles & tips</summary>
                  <div className="mt-2 space-y-1">
                    {companyPattern.tips.map((t, i) => (
                      <p key={i} className="text-[10px] text-muted">→ {t}</p>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {/* No active session */}
            {sessionQuestions.length === 0 && !generatingSession && (
              <div className="text-center py-12 space-y-4 fade-in">
                <h2 className="text-xl font-bold text-slate-200">Start a Practice Session</h2>
                <p className="text-sm text-muted max-w-md mx-auto">
                  Each session is 5 questions. Get feedback per question or save it all for the end.
                </p>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => startSession(false)}
                    className="px-6 py-3 bg-card border border-border rounded-lg text-sm font-semibold text-slate-200 hover:border-accent transition-colors"
                  >
                    Standard Session
                  </button>
                  <button
                    onClick={() => startSession(true)}
                    className="px-6 py-3 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/80 transition-colors"
                  >
                    {getWeakAreas().length > 0 ? "Adaptive Session (targets weak spots)" : "AI-Generated Session"}
                  </button>
                </div>
                <label className="flex items-center gap-2 justify-center text-xs text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showFeedbackPerQ}
                    onChange={e => setShowFeedbackPerQ(e.target.checked)}
                    className="rounded"
                  />
                  Show feedback after each question (uncheck for end-of-session only)
                </label>
              </div>
            )}

            {/* Generating */}
            {generatingSession && (
              <div className="text-center py-20">
                <div className="inline-block w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted">Claude is analyzing your weak spots and designing a personalized session...</p>
              </div>
            )}

            {/* Active session */}
            {sessionQuestions.length > 0 && !sessionSummary && (
              <>
                {/* Session plan banner */}
                {sessionPlan?.session_plan && (
                  <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
                    <div className="text-xs text-accent font-bold uppercase tracking-wider mb-1">Session Focus</div>
                    <p className="text-sm text-slate-200">{sessionPlan.session_plan.focus_message}</p>
                    <div className="flex gap-2 mt-2">
                      <span className="text-xs bg-accent/20 text-accent px-2 py-0.5 rounded">
                        Primary: {WEAK_AREA_LABELS[sessionPlan.session_plan.primary_weakness] || sessionPlan.session_plan.primary_weakness}
                      </span>
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent rounded-full transition-all duration-500"
                      style={{ width: `${((currentQIndex + (feedback ? 1 : 0)) / sessionQuestions.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-muted">{currentQIndex + 1}/{sessionQuestions.length}</span>
                  <button
                    onClick={endSession}
                    disabled={sessionAnswers.length === 0 || summaryLoading}
                    className="px-3 py-1 text-xs bg-card border border-border rounded-lg text-muted hover:text-red-400 hover:border-red-400 disabled:opacity-30 transition-colors"
                  >
                    End Session
                  </button>
                </div>

                {/* Current question */}
                {currentQuestion && (
                  <div className="bg-surface border-2 border-accent rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] text-muted uppercase tracking-wider">{currentQuestion.category}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        currentQuestion.type === "behavioral" ? "bg-blue-900/50 text-blue-400" :
                        currentQuestion.type === "technical" ? "bg-purple-900/50 text-purple-400" :
                        "bg-orange-900/50 text-orange-400"
                      }`}>{currentQuestion.type}</span>
                      {currentQuestion.difficulty && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                          currentQuestion.difficulty === "easy" ? "bg-green-900/50 text-green-400" :
                          currentQuestion.difficulty === "medium" ? "bg-yellow-900/50 text-yellow-400" :
                          "bg-red-900/50 text-red-400"
                        }`}>{currentQuestion.difficulty}</span>
                      )}
                    </div>
                    <p className="text-base font-semibold text-slate-200 leading-relaxed">{currentQuestion.text}</p>
                    {"targets_weakness" in currentQuestion && (currentQuestion as AdaptiveQuestion).targets_weakness?.length > 0 && (
                      <div className="flex gap-1 mt-2 flex-wrap">
                        {(currentQuestion as AdaptiveQuestion).targets_weakness.map(w => (
                          <span key={w} className="text-[10px] bg-card px-1.5 py-0.5 rounded text-muted">
                            Targets: {WEAK_AREA_LABELS[w] || w}
                          </span>
                        ))}
                      </div>
                    )}
                    {"delivery_note" in currentQuestion && (currentQuestion as AdaptiveQuestion).delivery_note && (
                      <p className="text-xs text-accent2 mt-2 italic">{(currentQuestion as AdaptiveQuestion).delivery_note}</p>
                    )}
                  </div>
                )}

                {/* Hint toggle */}
                {currentQuestion?.hint && (
                  <details className="bg-surface rounded-lg p-3">
                    <summary className="text-xs text-accent cursor-pointer font-semibold">Show Hint</summary>
                    <p className="text-xs text-muted mt-2">{currentQuestion.hint}</p>
                  </details>
                )}

                {/* Voice/Text Input */}
                <div className="bg-card border border-border rounded-xl p-4">
                  <VoiceRecorder
                    onTranscript={handleTranscript}
                    onRecordingChange={handleRecordingChange}
                    disabled={loading}
                  />
                </div>

                {/* Answer preview + action buttons */}
                {answer && (
                  <div className="space-y-3">
                    <div className="bg-surface rounded-lg p-3">
                      <div className="text-[10px] text-muted font-bold mb-1">YOUR ANSWER ({answerDuration}s)</div>
                      <p className="text-xs text-slate-300 whitespace-pre-wrap max-h-32 overflow-y-auto">{answer}</p>
                    </div>
                    <div className="flex gap-2">
                      {showFeedbackPerQ && (
                        <button
                          onClick={getFeedback}
                          disabled={loading}
                          className="flex-1 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/80 disabled:opacity-50 transition-colors"
                        >
                          {loading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Claude is analyzing...
                            </span>
                          ) : "Get AI Feedback"}
                        </button>
                      )}
                      {!showFeedbackPerQ && (
                        <button
                          onClick={() => {
                            // Save answer without feedback for now
                            const record: AnswerRecord = {
                              id: "ans_" + Date.now(),
                              sessionId,
                              questionId: currentQuestion?.id || "",
                              questionText: currentQuestion?.text || "",
                              category: currentQuestion?.category || "",
                              type: currentQuestion?.type || "",
                              answer,
                              feedback: {
                                overall_score: 0, star_scores: { situation: 0, task: 0, action: 0, result: 0 },
                                dimension_scores: { clarity: 0, confidence: 0, conciseness: 0, storytelling: 0, technical_accuracy: 0 },
                                sentence_analysis: [], delivery_analysis: { filler_words: [], hedging_phrases: [], power_words: [], active_voice_pct: 0, pacing: "good", pacing_note: "" },
                                strengths: [], improvements: [], coaching_tip: "", weakest_sentence_rewrite: { original: "", improved: "" },
                                follow_up_question: "", ideal_90sec_structure: "", weak_areas: [],
                                recommendation: "", encouragement: "",
                              },
                              durationSec: answerDuration || 60,
                              timestamp: new Date().toISOString(),
                            };
                            setSessionAnswers(prev => [...prev, record]);
                            nextQuestion();
                          }}
                          className="flex-1 py-2.5 bg-card border border-border text-slate-200 rounded-lg text-sm font-semibold hover:border-accent transition-colors"
                        >
                          Save & Next
                        </button>
                      )}
                      {feedback && currentQIndex < sessionQuestions.length - 1 && (
                        <button
                          onClick={nextQuestion}
                          className="px-6 py-2.5 bg-accent2 text-bg rounded-lg text-sm font-semibold hover:bg-accent2/80 transition-colors"
                        >
                          Next Question →
                        </button>
                      )}
                      {feedback && currentQIndex === sessionQuestions.length - 1 && (
                        <button
                          onClick={endSession}
                          disabled={summaryLoading}
                          className="px-6 py-2.5 bg-accent2 text-bg rounded-lg text-sm font-semibold hover:bg-accent2/80 disabled:opacity-50 transition-colors"
                        >
                          {summaryLoading ? "Generating Summary..." : "Finish & Get Summary"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Feedback card */}
                {feedback && showFeedbackPerQ && (
                  <div className="space-y-2 slide-up">
                    {/* TTS button */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          const text = `Score: ${feedback.overall_score} out of 100. ${feedback.recommendation}. ${feedback.coaching_tip}. Strengths: ${feedback.strengths?.join(". ")}. Areas to improve: ${feedback.improvements?.join(". ")}`;
                          if (typeof window !== "undefined" && window.speechSynthesis) {
                            window.speechSynthesis.cancel();
                            window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
                          }
                        }}
                        className="px-3 py-1.5 bg-card border border-border rounded-lg text-xs text-muted hover:text-accent2 hover:border-accent2 transition-colors"
                      >
                        Read Feedback Aloud
                      </button>
                    </div>
                    <FeedbackCard feedback={feedback} questionText={currentQuestion?.text || ""} />
                  </div>
                )}
              </>
            )}

            {/* Session Summary */}
            {sessionSummary && (
              <SessionSummaryCard summary={sessionSummary} answers={sessionAnswers} onNewSession={() => {
                setSessionQuestions([]);
                setSessionSummary(null);
                setSessionAnswers([]);
                setFeedback(null);
                setAnswer("");
                setSessionPlan(null);
              }} />
            )}

            {summaryLoading && (
              <div className="text-center py-20">
                <div className="inline-block w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted">Claude is analyzing your full session performance...</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════ PROGRESS TAB ═══════ */}
        {tab === "progress" && <ProgressDashboard />}

        {/* ═══════ HISTORY TAB ═══════ */}
        {tab === "history" && <HistoryView />}
      </main>
    </div>
  );
}

// ═══════ CONSTANTS ═══════

const CONTEXT_GENERATION_PROMPT = `I'm preparing for technical interviews. Please analyze my background and generate a structured context summary I can paste into an interview prep tool.

Please ask me about (or I'll provide):
1. My current role/education and career stage
2. My work experience (companies, roles, key projects, metrics/achievements)
3. My technical skills and technologies I've used
4. Notable projects (personal, academic, or open source)
5. My target companies and roles
6. Any specific areas I want to improve in interviews

Then generate a structured summary in this EXACT format:

---
NAME: [Full name]
BACKGROUND: [1-2 sentence career summary]
TARGET: [Target role] at [Target company type]
EXPERIENCE: [Concise work history with metrics — e.g., "Built X that handled Y TPS, reduced Z by N%"]
SKILLS: [Comma-separated technical skills]
KEY ACHIEVEMENTS: [Bullet list of quantified accomplishments]
PROJECTS: [Notable projects with 1-line descriptions and tech stacks]
INTERVIEW STRENGTHS: [Areas you'd be strong in]
INTERVIEW GAPS: [Areas to prepare more for]
STAR STORIES: [2-3 brief situation summaries you could use for behavioral questions]
---

Be specific and include real metrics wherever possible. This will be used to generate personalized interview questions and evaluate my answers.`;

// ═══════ SUB-COMPONENTS ═══════

function Field({ label, value, onChange, placeholder, multiline }: {
  label: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean;
}) {
  const cls = "w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none";
  return (
    <div>
      <label className="text-xs text-muted font-semibold block mb-1">{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} className={cls + " resize-y"} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      )}
    </div>
  );
}

function SessionSummaryCard({ summary, answers, onNewSession }: {
  summary: Record<string, unknown>;
  answers: AnswerRecord[];
  onNewSession: () => void;
}) {
  const s = summary as {
    session_score: number;
    readiness_rating: number;
    readiness_label: string;
    overall_assessment: string;
    pattern_analysis: {
      recurring_strengths: string[];
      recurring_weaknesses: string[];
      communication_habits: {
        filler_summary: string;
        hedging_summary: string;
        ownership_language: string;
        pacing_summary: string;
      };
    };
    star_breakdown: { strongest: string; weakest: string; advice: string };
    top_3_priorities: Array<{ area: string; why: string; how: string }>;
    superpower: string;
    company_specific_tips: string[];
    encouragement: string;
  };

  return (
    <div className="space-y-5">
      <div className="bg-card border border-accent rounded-xl p-6">
        <h2 className="text-lg font-bold text-slate-200 mb-4">Session Complete</h2>

        {/* Top-level scores */}
        <div className="grid grid-cols-3 gap-4 mb-5">
          <div className="text-center">
            <div className="text-3xl font-bold text-accent">{s.session_score}</div>
            <div className="text-xs text-muted">Session Score</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-accent2">{s.readiness_rating}/10</div>
            <div className="text-xs text-muted">Readiness</div>
          </div>
          <div className="text-center">
            <div className={`text-lg font-bold ${
              s.readiness_label === "Interview Ready" ? "text-green-400" :
              s.readiness_label === "Almost Ready" ? "text-blue-400" :
              "text-yellow-400"
            }`}>{s.readiness_label}</div>
            <div className="text-xs text-muted">Status</div>
          </div>
        </div>

        <p className="text-sm text-slate-300 mb-4">{s.overall_assessment}</p>

        {s.encouragement && (
          <p className="text-sm text-accent2 italic bg-accent2/10 p-3 rounded-lg mb-4">{s.encouragement}</p>
        )}
      </div>

      {/* Per-question scores */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h3 className="text-sm font-bold text-slate-200 mb-3">Question Scores</h3>
        <div className="space-y-2">
          {answers.map((a, i) => (
            <div key={i} className="flex items-center gap-3 bg-surface rounded-lg p-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                a.feedback.overall_score >= 85 ? "bg-green-900/50 text-green-400" :
                a.feedback.overall_score >= 70 ? "bg-blue-900/50 text-blue-400" :
                a.feedback.overall_score >= 50 ? "bg-yellow-900/50 text-yellow-400" :
                "bg-red-900/50 text-red-400"
              }`}>
                {a.feedback.overall_score || "—"}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-300 truncate">{a.questionText}</p>
                <p className="text-[10px] text-muted">{a.feedback.recommendation}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Communication Habits */}
      {s.pattern_analysis?.communication_habits && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">Communication Patterns</h3>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-surface p-3 rounded-lg">
              <div className="text-[10px] text-red-400 font-bold mb-1">Filler Words</div>
              <p className="text-slate-300">{s.pattern_analysis.communication_habits.filler_summary}</p>
            </div>
            <div className="bg-surface p-3 rounded-lg">
              <div className="text-[10px] text-yellow-400 font-bold mb-1">Hedging Language</div>
              <p className="text-slate-300">{s.pattern_analysis.communication_habits.hedging_summary}</p>
            </div>
            <div className="bg-surface p-3 rounded-lg">
              <div className="text-[10px] text-blue-400 font-bold mb-1">Ownership Language</div>
              <p className="text-slate-300">{s.pattern_analysis.communication_habits.ownership_language}</p>
            </div>
            <div className="bg-surface p-3 rounded-lg">
              <div className="text-[10px] text-green-400 font-bold mb-1">Pacing</div>
              <p className="text-slate-300">{s.pattern_analysis.communication_habits.pacing_summary}</p>
            </div>
          </div>
        </div>
      )}

      {/* STAR Breakdown */}
      {s.star_breakdown && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">STAR Pattern</h3>
          <div className="flex gap-4 mb-3">
            <div className="bg-green-900/30 rounded-lg p-3 flex-1">
              <div className="text-[10px] text-green-400 font-bold">Strongest</div>
              <div className="text-sm text-slate-200 capitalize">{s.star_breakdown.strongest}</div>
            </div>
            <div className="bg-red-900/30 rounded-lg p-3 flex-1">
              <div className="text-[10px] text-red-400 font-bold">Weakest</div>
              <div className="text-sm text-slate-200 capitalize">{s.star_breakdown.weakest}</div>
            </div>
          </div>
          <p className="text-xs text-muted">{s.star_breakdown.advice}</p>
        </div>
      )}

      {/* Top 3 Priorities */}
      {s.top_3_priorities?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">Top 3 Priorities for Next Session</h3>
          <div className="space-y-3">
            {s.top_3_priorities.map((p, i) => (
              <div key={i} className="bg-surface rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-5 h-5 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                  <span className="text-sm font-semibold text-slate-200">{p.area}</span>
                </div>
                <p className="text-xs text-muted mb-1">{p.why}</p>
                <p className="text-xs text-accent2">{p.how}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Superpower */}
      {s.superpower && (
        <div className="bg-accent/10 border border-accent/30 rounded-xl p-4">
          <div className="text-[10px] text-accent font-bold uppercase tracking-wider mb-1">Your Superpower</div>
          <p className="text-sm text-slate-200">{s.superpower}</p>
        </div>
      )}

      {/* Company Tips */}
      {s.company_specific_tips?.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-sm font-bold text-slate-200 mb-3">Company-Specific Tips</h3>
          <ul className="space-y-2">
            {s.company_specific_tips.map((tip, i) => (
              <li key={i} className="text-xs text-slate-300 pl-3 relative before:absolute before:left-0 before:content-['→'] before:text-accent">{tip}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onNewSession}
        className="w-full py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent/80 transition-colors"
      >
        Start New Session
      </button>
    </div>
  );
}

function HistoryView() {
  const [profile, setProfile] = useState(getProfile());
  useEffect(() => { setProfile(getProfile()); }, []);

  if (profile.answers.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-bold text-slate-200 mb-2">No history yet</h3>
        <p className="text-sm text-muted">Complete some practice questions to see your history.</p>
      </div>
    );
  }

  // Group by session
  const sessionMap = new Map<string, AnswerRecord[]>();
  for (const a of profile.answers) {
    if (!sessionMap.has(a.sessionId)) sessionMap.set(a.sessionId, []);
    sessionMap.get(a.sessionId)!.push(a);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-200">Practice History</h2>
      {Array.from(sessionMap.entries()).map(([sessId, answers]) => {
        const session = profile.sessions.find(s => s.id === sessId);
        const avgScore = answers.filter(a => a.feedback.overall_score > 0).length > 0
          ? Math.round(answers.filter(a => a.feedback.overall_score > 0).reduce((s, a) => s + a.feedback.overall_score, 0) / answers.filter(a => a.feedback.overall_score > 0).length)
          : 0;

        return (
          <details key={sessId} className="bg-card border border-border rounded-xl overflow-hidden">
            <summary className="p-4 cursor-pointer hover:bg-surface flex items-center justify-between">
              <div>
                <span className="text-sm font-semibold text-slate-200">
                  {session?.company || "Practice"} — {session?.role || ""}
                </span>
                <span className="text-xs text-muted ml-2">
                  {new Date(answers[0].timestamp).toLocaleDateString()} · {answers.length} Qs
                </span>
              </div>
              {avgScore > 0 && (
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                  avgScore >= 70 ? "bg-green-900/50 text-green-400" : "bg-yellow-900/50 text-yellow-400"
                }`}>{avgScore} avg</span>
              )}
            </summary>
            <div className="border-t border-border">
              {answers.map(a => (
                <div key={a.id} className="p-3 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 mb-1">
                    {a.feedback.overall_score > 0 && (
                      <span className={`text-xs font-bold ${
                        a.feedback.overall_score >= 70 ? "text-green-400" : a.feedback.overall_score >= 50 ? "text-yellow-400" : "text-red-400"
                      }`}>{a.feedback.overall_score}</span>
                    )}
                    <span className="text-xs text-slate-300 truncate">{a.questionText}</span>
                  </div>
                  {a.feedback.coaching_tip && (
                    <p className="text-[10px] text-muted mt-1">Tip: {a.feedback.coaching_tip}</p>
                  )}
                </div>
              ))}
            </div>
          </details>
        );
      })}
    </div>
  );
}
