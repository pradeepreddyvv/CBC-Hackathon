"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import VoiceRecorder from "@/components/VoiceRecorder";
import FeedbackCard from "@/components/FeedbackCard";
import ProgressDashboard from "@/components/ProgressDashboard";
import { QUESTION_BANK, WEAK_AREA_LABELS, Question } from "@/lib/questions";
import { getCompanyPattern } from "@/lib/company-patterns";
import {
  getProfile, saveUserProfile, recordAnswer, recordSession, getWeakAreas, getSessionCount,
  FeedbackResult, AnswerRecord, SessionRecord, UserProfile,
} from "@/lib/store";
import { cloudSaveSession, cloudSaveAnswer } from "@/lib/cloud-sync";
import { useAuth } from "@/lib/auth-context";
import dynamic from "next/dynamic";

const InterviewArtifactScene = dynamic(() => import("@/components/InterviewArtifactScene"), { ssr: false });

type Tab = "interview" | "progress" | "history" | "3d-interview";

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
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("interview");
  const [profile, setProfile] = useState<UserProfile>({
    name: "", background: "", targetRole: "Software Engineer",
    targetCompany: "Google", experience: "", skills: "", country: "",
  });
  const [profileSaved, setProfileSaved] = useState(false);

  // Session state
  const [sessionId, setSessionId] = useState("");
  const sessionIdRef = useRef("");
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

  // Audio replay
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Follow-up question
  const [followUpQ, setFollowUpQ] = useState<string | null>(null);
  const [isFollowUp, setIsFollowUp] = useState(false);

  // Session summary
  const [sessionSummary, setSessionSummary] = useState<Record<string, unknown> | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Generating session
  const [generatingSession, setGeneratingSession] = useState(false);

  // Theme
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = localStorage.getItem("theme") as "dark" | "light" | null;
    if (saved) { setTheme(saved); document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : ""); }
  }, []);
  const toggleTheme = useCallback(() => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    if (next === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  // Auth guard
  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    } else if (!authLoading && user && !user.onboarded) {
      router.push("/onboarding");
    }
  }, [user, authLoading, router]);

  // Load saved profile on mount
  useEffect(() => {
    const saved = getProfile();
    if (saved.userProfile?.name) {
      setProfile(saved.userProfile);
      setProfileSaved(true);
    } else if (user) {
      // Populate from auth user
      setProfile(prev => ({ ...prev, name: user.name || prev.name }));
    }
    // Load session config from onboarding
    const config = localStorage.getItem("interview_session_config");
    if (config) {
      try {
        const parsed = JSON.parse(config);
        if (parsed.generatedQuestions?.length > 0) {
          setSessionQuestions(parsed.generatedQuestions);
          const newSid = "sess_" + Date.now();
          setSessionId(newSid);
          sessionIdRef.current = newSid;
        }
        if (parsed.companyName) {
          setProfile(prev => ({ ...prev, targetCompany: parsed.companyName, country: parsed.country || "" }));
        }
      } catch { /* ignore */ }
    }
  }, []);

  const saveProfile = useCallback(() => {
    saveUserProfile(profile);
    setProfileSaved(true);
    setTab("interview");
  }, [profile]);

  // Start a new session — either with default Qs or adaptive AI-generated Qs
  const startSession = useCallback(async (useAdaptive: boolean) => {
    const sid = "sess_" + Date.now();
    setSessionId(sid);
    sessionIdRef.current = sid;
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
            country: profile.country,
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

    // Record session locally
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

    // Save full session data to cloud (generated questions, config, etc.)
    if (user?.id) {
      const config = localStorage.getItem("interview_session_config");
      const parsedConfig = config ? JSON.parse(config) : {};
      cloudSaveSession(user.id, {
        ...session,
        generatedQuestions: sessionQuestions,
        interviewType: parsedConfig.interviewType || "",
        roundType: parsedConfig.roundType || "",
        researchContext: parsedConfig.researchResults || null,
        sessionConfig: {
          company: profile.targetCompany,
          role: profile.targetRole,
          country: profile.country,
          interviewType: parsedConfig.interviewType,
          roundType: parsedConfig.roundType,
          jobDescription: parsedConfig.jobDescription,
        },
      });
    }
  }, [profile, user]);

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
      setAudioUrl(null);
      setIsPlaying(false);
    }
  }, []);

  const handleAudioReady = useCallback((url: string) => {
    // Revoke previous URL to avoid memory leaks
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(url);
  }, [audioUrl]);

  const togglePlayback = useCallback(() => {
    if (!audioUrl) return;
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      const audio = new Audio(audioUrl);
      audio.onended = () => setIsPlaying(false);
      audio.play();
      audioRef.current = audio;
      setIsPlaying(true);
    }
  }, [audioUrl, isPlaying]);

  // Get feedback for current answer
  const getFeedback = useCallback(async () => {
    if (!answer || (!currentQuestion && !followUpQ)) return;
    setLoading(true);
    try {
      const q = currentQuestion;
      const questionText = isFollowUp && followUpQ ? followUpQ : q?.text || "";
      const prevAttempts = getProfile().answers
        .filter(a => a.questionText === questionText)
        .map(a => ({ score: a.feedback.overall_score, weakAreas: a.feedback.weak_areas }));

      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: questionText,
          answer,
          category: q?.category || "follow_up",
          questionType: q?.type || "behavioral",
          company: profile.targetCompany,
          role: profile.targetRole,
          country: profile.country,
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
          questionId: isFollowUp ? "followup_" + (q?.id || Date.now()) : (q?.id || ""),
          questionText: questionText,
          category: q?.category || "follow_up",
          type: q?.type || "behavioral",
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

        // Sync to InsForge cloud + vector embedding
        if (user?.id) {
          cloudSaveAnswer(user?.id, {
            ...record,
            feedback: record.feedback as unknown as Record<string, unknown>,
            transcript: record.answer,
          });
          cloudSaveSession(user?.id, {
            ...sessionData,
            generatedQuestions: sessionQuestions,
          });
          // Embed answer for vector similarity search (fire-and-forget)
          fetch("/api/vector", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "embed_answer",
              userId: user?.id,
              answerId: record.id,
              questionText: record.questionText,
              answerText: record.answer,
              score: data.feedback.overall_score,
            }),
          }).catch(() => {});
        }

        // Reset follow-up state after recording
        if (isFollowUp) {
          setIsFollowUp(false);
          setFollowUpQ(null);
        }
      }
    } catch (e) {
      console.error("Feedback error:", e);
    } finally {
      setLoading(false);
    }
  }, [answer, currentQuestion, profile, answerDuration, sessionId, sessionAnswers, isFollowUp, followUpQ]);

  // Skip feedback and go to next question
  const nextQuestion = useCallback(() => {
    if (currentQIndex < sessionQuestions.length - 1) {
      setCurrentQIndex(i => i + 1);
      setAnswer("");
      setFeedback(null);
      setAnswerStartTime(null);
      setFollowUpQ(null);
      setIsFollowUp(false);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setIsPlaying(false);
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
          country: profile.country,
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

  // Auth loading state
  if (authLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="inline-block w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) return null;

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
            {(["interview", "3d-interview", "progress", "history"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  tab === t ? "bg-accent text-white" : "text-muted hover:bg-card hover:text-slate-200"
                }`}
              >
                {t === "interview" ? "Interview" : t === "3d-interview" ? "3D Mock" : t === "progress" ? "Progress" : "History"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 ml-2 pl-2 border-l border-border">
            <span className="text-xs text-muted">{user.name}</span>
            <button
              onClick={toggleTheme}
              className="text-xs text-muted hover:text-accent transition-colors px-2 py-1 rounded-lg hover:bg-card"
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            >
              {theme === "dark" ? "☀️" : "🌙"}
            </button>
            <button
              onClick={() => { router.push("/onboarding"); }}
              className="text-xs text-muted hover:text-accent transition-colors"
              title="New session setup"
            >
              Setup
            </button>
            <button
              onClick={() => { logout(); router.push("/login"); }}
              className="text-xs text-muted hover:text-red-400 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* ═══════ PRACTICE TAB ═══════ */}
        {tab === "interview" && (
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
                <h2 className="text-xl font-bold text-slate-200">Start an Interview Session</h2>
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

                {/* Follow-up question display */}
                {isFollowUp && followUpQ && (
                  <div className="bg-surface border-2 border-accent2 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] bg-accent2/20 text-accent2 px-1.5 py-0.5 rounded">follow-up</span>
                    </div>
                    <p className="text-base font-semibold text-slate-200 leading-relaxed">{followUpQ}</p>
                  </div>
                )}

                {/* Current question */}
                {currentQuestion && !isFollowUp && (
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
                    onAudioReady={handleAudioReady}
                    disabled={loading}
                  />
                </div>

                {/* Answer preview + action buttons */}
                {answer && (
                  <div className="space-y-3">
                    <div className="bg-surface rounded-lg p-3">
                      <div className="flex items-center justify-between mb-1">
                        <div className="text-[10px] text-muted font-bold">YOUR ANSWER ({answerDuration}s)</div>
                        {audioUrl && (
                          <button
                            onClick={togglePlayback}
                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                              isPlaying
                                ? "bg-red-500/20 text-red-400 border border-red-500/30"
                                : "bg-accent/20 text-accent border border-accent/30 hover:bg-accent/30"
                            }`}
                          >
                            {isPlaying ? (
                              <>
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                                Stop
                              </>
                            ) : (
                              <>
                                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                                Re-listen
                              </>
                            )}
                          </button>
                        )}
                      </div>
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

                    {/* Follow-up question from AI */}
                    {feedback.follow_up_question && !isFollowUp && (
                      <div className="bg-accent2/10 border border-accent2/30 rounded-xl p-4 mt-3">
                        <div className="text-[10px] text-accent2 font-bold uppercase tracking-wider mb-2">Follow-Up Question</div>
                        <p className="text-sm text-slate-200 mb-3">{feedback.follow_up_question}</p>
                        <button
                          onClick={() => {
                            setFollowUpQ(feedback.follow_up_question);
                            setIsFollowUp(true);
                            setAnswer("");
                            setFeedback(null);
                            setAnswerStartTime(null);
                          }}
                          className="px-4 py-2 bg-accent2 text-bg rounded-lg text-xs font-semibold hover:bg-accent2/80 transition-colors"
                        >
                          Answer Follow-Up
                        </button>
                      </div>
                    )}
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

        {/* ═══════ 3D MOCK INTERVIEW TAB ═══════ */}
        {tab === "3d-interview" && (
          <div className="fade-in" style={{ margin: "-24px -16px 0", height: "calc(100vh - 56px)" }}>
            <InterviewArtifactScene
              questions={sessionQuestions.length > 0 ? sessionQuestions.map(q => q.text) : undefined}
              companyName={profile.targetCompany}
              profile={profile}
              userId={user?.id}
              sessionId={sessionId}
              role={profile.targetRole}
              onInterviewStart={() => {
                // Create session row in DB FIRST so FK constraint is satisfied for answers
                const sid = sessionIdRef.current || `3d_sess_${Date.now()}`;
                sessionIdRef.current = sid;
                setSessionId(sid);
                if (user?.id) {
                  cloudSaveSession(user.id, {
                    id: sid,
                    company: profile.targetCompany,
                    role: profile.targetRole,
                    answerCount: 0,
                    avgScore: 0,
                    weakAreas: [],
                    sessionNumber: 1,
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
                // Save answer to DB using ref (avoids stale closure)
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
                // Update the answer in DB with feedback analysis
                const sid = sessionIdRef.current;
                if (user?.id && sid) {
                  const q = sessionQuestions[qIdx];
                  const answerId = `3d-${sid}-${qIdx}`;
                  // Re-save the answer with full feedback
                  cloudSaveAnswer(user.id, {
                    id: answerId,
                    sessionId: sid,
                    questionId: q?.id || `q-${qIdx}`,
                    questionText: question,
                    category: q?.category || "general",
                    type: q?.type || "behavioral",
                    answer: answerText,
                    feedback: {
                      ...analysis,
                      humanized_feedback: humanizedFeedback,
                    },
                    durationSec: durationSec || 0,
                    transcript: answerText,
                  });
                  // Also update weak areas
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
                // Update session with final analysis
                const sid = sessionIdRef.current;
                if (user?.id && sid) {
                  const avgScore = sessionAnalysis?.session_score || 0;
                  const weakAreas = sessionAnalysis?.top_3_focus_areas || sessionAnalysis?.adaptive_question_topics || [];
                  cloudSaveSession(user.id, {
                    id: sid,
                    company: profile.targetCompany,
                    role: profile.targetRole,
                    answerCount: answers.length,
                    avgScore,
                    weakAreas,
                    sessionNumber: 1,
                    sessionSummary: sessionAnalysis,
                    generatedQuestions: sessionQuestions,
                    interviewType: "3d-mock",
                    roundType: "behavioral",
                    sessionConfig: { mode: "3d-mock", company: profile.targetCompany },
                  });
                  // Update weak areas
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

        {/* ═══════ PROGRESS TAB ═══════ */}
        {tab === "progress" && <ProgressDashboard />}

        {/* ═══════ HISTORY TAB ═══════ */}
        {tab === "history" && <HistoryView />}
      </main>
    </div>
  );
}

// ═══════ SUB-COMPONENTS ═══════

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
  const [expandedAnswer, setExpandedAnswer] = useState<string | null>(null);
  useEffect(() => { setProfile(getProfile()); }, []);

  if (profile.answers.length === 0) {
    return (
      <div className="text-center py-20">
        <div className="text-4xl mb-4">📋</div>
        <h3 className="text-lg font-bold text-slate-200 mb-2">No history yet</h3>
        <p className="text-sm text-muted">Complete some interview questions to see your history.</p>
      </div>
    );
  }

  // Group by session
  const sessionMap = new Map<string, AnswerRecord[]>();
  for (const a of profile.answers) {
    if (!sessionMap.has(a.sessionId)) sessionMap.set(a.sessionId, []);
    sessionMap.get(a.sessionId)!.push(a);
  }

  const scoreColor = (s: number) =>
    s >= 85 ? "text-green-400" : s >= 70 ? "text-blue-400" : s >= 50 ? "text-yellow-400" : "text-red-400";

  const scoreBg = (s: number) =>
    s >= 85 ? "bg-green-900/50 text-green-400" : s >= 70 ? "bg-blue-900/50 text-blue-400" : s >= 50 ? "bg-yellow-900/50 text-yellow-400" : "bg-red-900/50 text-red-400";

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-200">Interview History</h2>
      {Array.from(sessionMap.entries()).map(([sessId, answers]) => {
        const session = profile.sessions.find(s => s.id === sessId);
        const scoredAnswers = answers.filter(a => a.feedback.overall_score > 0);
        const avgScore = scoredAnswers.length > 0
          ? Math.round(scoredAnswers.reduce((s, a) => s + a.feedback.overall_score, 0) / scoredAnswers.length)
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
                <span className={`px-2 py-0.5 rounded text-xs font-bold ${scoreBg(avgScore)}`}>{avgScore} avg</span>
              )}
            </summary>
            <div className="border-t border-border">
              {answers.map(a => {
                const isExpanded = expandedAnswer === a.id;
                const fb = a.feedback;
                return (
                  <div key={a.id} className="border-b border-border last:border-0">
                    {/* Collapsed row */}
                    <button
                      onClick={() => setExpandedAnswer(isExpanded ? null : a.id)}
                      className="w-full p-3 text-left hover:bg-surface/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {fb.overall_score > 0 && (
                          <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${scoreBg(fb.overall_score)}`}>
                            {fb.overall_score}
                          </span>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-slate-300 truncate">{a.questionText}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] text-muted">{a.type}</span>
                            <span className="text-[10px] text-muted">{a.durationSec}s</span>
                            {fb.coaching_tip && <span className="text-[10px] text-muted truncate">Tip: {fb.coaching_tip}</span>}
                          </div>
                        </div>
                        <svg className={`w-4 h-4 text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3 bg-surface/30">
                        {/* Question */}
                        <div className="bg-surface rounded-lg p-3">
                          <div className="text-[10px] text-accent font-bold uppercase mb-1">Question</div>
                          <p className="text-sm text-slate-200">{a.questionText}</p>
                        </div>

                        {/* Your Answer / Transcript */}
                        <div className="bg-surface rounded-lg p-3">
                          <div className="text-[10px] text-accent2 font-bold uppercase mb-1">Your Answer ({a.durationSec}s)</div>
                          <p className="text-xs text-slate-300 whitespace-pre-wrap">{a.answer}</p>
                        </div>

                        {/* STAR Scores */}
                        {fb.star_scores && (
                          <div className="bg-surface rounded-lg p-3">
                            <div className="text-[10px] text-muted font-bold uppercase mb-2">STAR Scores</div>
                            <div className="grid grid-cols-4 gap-2">
                              {Object.entries(fb.star_scores).map(([k, v]) => (
                                <div key={k} className="text-center">
                                  <div className={`text-lg font-bold ${scoreColor(v as number)}`}>{v as number}</div>
                                  <div className="text-[10px] text-muted capitalize">{k}</div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Dimension Scores */}
                        {fb.dimension_scores && (
                          <div className="bg-surface rounded-lg p-3">
                            <div className="text-[10px] text-muted font-bold uppercase mb-2">Dimension Scores</div>
                            <div className="space-y-1.5">
                              {Object.entries(fb.dimension_scores).map(([k, v]) => (
                                <div key={k} className="flex items-center gap-2">
                                  <span className="text-[10px] text-muted w-28 capitalize">{k.replace(/_/g, " ")}</span>
                                  <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full ${(v as number) >= 70 ? "bg-green-500" : (v as number) >= 50 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${v}%` }} />
                                  </div>
                                  <span className={`text-[10px] font-bold w-6 text-right ${scoreColor(v as number)}`}>{v as number}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Sentence Analysis */}
                        {fb.sentence_analysis && fb.sentence_analysis.length > 0 && (
                          <div className="bg-surface rounded-lg p-3">
                            <div className="text-[10px] text-muted font-bold uppercase mb-2">Sentence Analysis</div>
                            <div className="space-y-2">
                              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                              {fb.sentence_analysis.map((s: any, i: number) => (
                                <div key={i} className={`text-xs p-2 rounded border-l-2 ${
                                  s.rating === "strong" ? "border-green-500 bg-green-900/10" :
                                  s.rating === "okay" ? "border-yellow-500 bg-yellow-900/10" :
                                  "border-red-500 bg-red-900/10"
                                }`}>
                                  <p className="text-slate-300">&quot;{s.sentence}&quot;</p>
                                  <p className="text-muted mt-1">{s.reason}</p>
                                  {s.rewrite && <p className="text-accent2 mt-1">Better: &quot;{s.rewrite}&quot;</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Delivery Analysis */}
                        {fb.delivery_analysis && (
                          <div className="bg-surface rounded-lg p-3">
                            <div className="text-[10px] text-muted font-bold uppercase mb-2">Delivery Analysis</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {fb.delivery_analysis.filler_words?.length > 0 && (
                                <div className="bg-red-900/10 rounded p-2">
                                  <span className="text-[10px] text-red-400 font-bold">Filler Words</span>
                                  <p className="text-slate-300">{fb.delivery_analysis.filler_words.join(", ")}</p>
                                </div>
                              )}
                              {fb.delivery_analysis.hedging_phrases?.length > 0 && (
                                <div className="bg-yellow-900/10 rounded p-2">
                                  <span className="text-[10px] text-yellow-400 font-bold">Hedging</span>
                                  <p className="text-slate-300">{fb.delivery_analysis.hedging_phrases.join(", ")}</p>
                                </div>
                              )}
                              {fb.delivery_analysis.power_words?.length > 0 && (
                                <div className="bg-green-900/10 rounded p-2">
                                  <span className="text-[10px] text-green-400 font-bold">Power Words</span>
                                  <p className="text-slate-300">{fb.delivery_analysis.power_words.join(", ")}</p>
                                </div>
                              )}
                              <div className="bg-blue-900/10 rounded p-2">
                                <span className="text-[10px] text-blue-400 font-bold">Active Voice</span>
                                <p className="text-slate-300">{fb.delivery_analysis.active_voice_pct}%</p>
                              </div>
                            </div>
                            {fb.delivery_analysis.pacing_note && (
                              <p className="text-[10px] text-muted mt-2">Pacing: {fb.delivery_analysis.pacing_note}</p>
                            )}
                          </div>
                        )}

                        {/* Strengths & Improvements */}
                        <div className="grid grid-cols-2 gap-3">
                          {fb.strengths?.length > 0 && (
                            <div className="bg-green-900/10 rounded-lg p-3">
                              <div className="text-[10px] text-green-400 font-bold uppercase mb-1">Strengths</div>
                              <ul className="space-y-1">
                                {fb.strengths.map((s: string, i: number) => (
                                  <li key={i} className="text-[10px] text-slate-300">+ {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {fb.improvements?.length > 0 && (
                            <div className="bg-red-900/10 rounded-lg p-3">
                              <div className="text-[10px] text-red-400 font-bold uppercase mb-1">Improvements</div>
                              <ul className="space-y-1">
                                {fb.improvements.map((s: string, i: number) => (
                                  <li key={i} className="text-[10px] text-slate-300">- {s}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>

                        {/* Coaching Tip */}
                        {fb.coaching_tip && (
                          <div className="bg-accent/10 border border-accent/20 rounded-lg p-3">
                            <div className="text-[10px] text-accent font-bold uppercase mb-1">Coaching Tip</div>
                            <p className="text-xs text-slate-200">{fb.coaching_tip}</p>
                          </div>
                        )}

                        {/* Weak Areas */}
                        {fb.weak_areas?.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {fb.weak_areas.map((w: string, i: number) => (
                              <span key={i} className="text-[10px] bg-red-900/30 text-red-400 px-2 py-0.5 rounded">
                                {WEAK_AREA_LABELS[w] || w}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Weakest Sentence Rewrite */}
                        {fb.weakest_sentence_rewrite && fb.weakest_sentence_rewrite.original && (
                          <div className="bg-surface rounded-lg p-3">
                            <div className="text-[10px] text-muted font-bold uppercase mb-2">Best Single Improvement</div>
                            <p className="text-xs text-red-400 line-through mb-1">{fb.weakest_sentence_rewrite.original}</p>
                            <p className="text-xs text-green-400">{fb.weakest_sentence_rewrite.improved}</p>
                          </div>
                        )}

                        {/* Follow-up Question */}
                        {fb.follow_up_question && (
                          <div className="bg-accent2/10 border border-accent2/20 rounded-lg p-3">
                            <div className="text-[10px] text-accent2 font-bold uppercase mb-1">Likely Follow-Up Question</div>
                            <p className="text-xs text-slate-200">{fb.follow_up_question}</p>
                          </div>
                        )}

                        {/* Ideal 90-Second Structure */}
                        {fb.ideal_90sec_structure && (
                          <details className="bg-surface rounded-lg p-3">
                            <summary className="text-[10px] text-accent font-bold uppercase cursor-pointer">Ideal 90-Second Answer Structure</summary>
                            <p className="text-xs text-slate-300 mt-2 whitespace-pre-wrap">{fb.ideal_90sec_structure}</p>
                          </details>
                        )}

                        {/* Recommendation & Encouragement */}
                        {fb.recommendation && (
                          <div className={`rounded-lg p-3 ${
                            fb.recommendation === "Strong" ? "bg-green-900/10 border border-green-500/20" :
                            fb.recommendation === "Good" ? "bg-blue-900/10 border border-blue-500/20" :
                            "bg-yellow-900/10 border border-yellow-500/20"
                          }`}>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-bold ${
                                fb.recommendation === "Strong" ? "text-green-400" :
                                fb.recommendation === "Good" ? "text-blue-400" :
                                "text-yellow-400"
                              }`}>{fb.recommendation}</span>
                              {fb.encouragement && <span className="text-[10px] text-muted">{fb.encouragement}</span>}
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
        );
      })}
    </div>
  );
}
