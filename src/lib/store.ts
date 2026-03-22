// ============================================================
// CLIENT-SIDE STORE — localStorage-backed learning profile
// ============================================================

export interface SentenceAnalysis {
  sentence: string;
  rating: "strong" | "okay" | "weak";
  reason: string;
  rewrite: string | null;
  tags: string[];
}

export interface DeliveryAnalysis {
  filler_words: string[];
  hedging_phrases: string[];
  power_words: string[];
  active_voice_pct: number;
  pacing: "too_short" | "good" | "too_long";
  pacing_note: string;
}

export interface StarScores {
  situation: number;
  task: number;
  action: number;
  result: number;
}

export interface DimensionScores {
  clarity: number;
  confidence: number;
  conciseness: number;
  storytelling: number;
  technical_accuracy: number;
}

export interface FeedbackResult {
  overall_score: number;
  star_scores: StarScores;
  dimension_scores: DimensionScores;
  sentence_analysis: SentenceAnalysis[];
  delivery_analysis: DeliveryAnalysis;
  strengths: string[];
  improvements: string[];
  coaching_tip: string;
  weakest_sentence_rewrite: { original: string; improved: string };
  follow_up_question: string;
  ideal_90sec_structure: string;
  weak_areas: string[];
  recommendation: string;
  encouragement: string;
}

export interface AnswerRecord {
  id: string;
  sessionId: string;
  questionId: string;
  questionText: string;
  category: string;
  type: string;
  answer: string;
  feedback: FeedbackResult;
  durationSec: number;
  timestamp: string;
}

export interface SessionRecord {
  id: string;
  company: string;
  role: string;
  startedAt: string;
  completedAt?: string;
  answerCount: number;
  avgScore: number;
  weakAreas: string[];
  sessionNumber: number;
  sessionSummary?: Record<string, unknown>;
}

export interface WeakAreaProfile {
  area: string;
  totalOccurrences: number;
  scoreHistory: number[];
  avgScore: number;
  trend: "improving" | "stable" | "declining";
  lastSeen: string;
}

export interface UserProfile {
  name: string;
  background: string;
  targetRole: string;
  targetCompany: string;
  experience: string;
  skills: string;
  country?: string;
}

export interface LearningProfile {
  userProfile: UserProfile;
  sessions: SessionRecord[];
  answers: AnswerRecord[];
  weakAreaProfiles: Record<string, WeakAreaProfile>;
  completedQuestionTexts: string[];
  totalPracticeMinutes: number;
  overallAvgScore: number;
  lastSessionDate: string;
  // Communication habit tracking
  totalFillerWords: number;
  totalHedgingPhrases: number;
  avgActiveVoicePct: number;
  pacingDistribution: { too_short: number; good: number; too_long: number };
}

const STORE_KEY = "interview_coach_profile";

export function getProfile(): LearningProfile {
  if (typeof window === "undefined") return emptyProfile();
  const raw = localStorage.getItem(STORE_KEY);
  if (!raw) return emptyProfile();
  try {
    return { ...emptyProfile(), ...JSON.parse(raw) };
  } catch {
    return emptyProfile();
  }
}

export function saveProfile(profile: LearningProfile) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(profile)); } catch { /* quota exceeded or private browsing */ }
}

export function emptyProfile(): LearningProfile {
  return {
    userProfile: { name: "", background: "", targetRole: "", targetCompany: "", experience: "", skills: "" },
    sessions: [],
    answers: [],
    weakAreaProfiles: {},
    completedQuestionTexts: [],
    totalPracticeMinutes: 0,
    overallAvgScore: 0,
    lastSessionDate: "",
    totalFillerWords: 0,
    totalHedgingPhrases: 0,
    avgActiveVoicePct: 0,
    pacingDistribution: { too_short: 0, good: 0, too_long: 0 },
  };
}

export function saveUserProfile(userProfile: UserProfile) {
  const profile = getProfile();
  profile.userProfile = userProfile;
  saveProfile(profile);
}

export function recordAnswer(answer: AnswerRecord): LearningProfile {
  const profile = getProfile();

  profile.answers.unshift(answer);
  if (profile.answers.length > 500) profile.answers = profile.answers.slice(0, 500);

  if (!profile.completedQuestionTexts.includes(answer.questionText)) {
    profile.completedQuestionTexts.push(answer.questionText);
  }

  // Update weak area profiles
  for (const area of answer.feedback.weak_areas) {
    if (!profile.weakAreaProfiles[area]) {
      profile.weakAreaProfiles[area] = {
        area,
        totalOccurrences: 0,
        scoreHistory: [],
        avgScore: 0,
        trend: "stable",
        lastSeen: "",
      };
    }
    const wp = profile.weakAreaProfiles[area];
    wp.totalOccurrences++;
    wp.scoreHistory.push(answer.feedback.overall_score);
    wp.avgScore = Math.round(wp.scoreHistory.reduce((a, b) => a + b, 0) / wp.scoreHistory.length);
    wp.lastSeen = answer.timestamp;

    if (wp.scoreHistory.length >= 3) {
      const recent = wp.scoreHistory.slice(-3);
      const earlier = wp.scoreHistory.slice(-6, -3);
      if (earlier.length > 0) {
        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const earlierAvg = earlier.reduce((a, b) => a + b, 0) / earlier.length;
        if (recentAvg > earlierAvg + 5) wp.trend = "improving";
        else if (recentAvg < earlierAvg - 5) wp.trend = "declining";
        else wp.trend = "stable";
      }
    }
  }

  // Update communication tracking
  const da = answer.feedback.delivery_analysis;
  if (da) {
    profile.totalFillerWords += da.filler_words?.length || 0;
    profile.totalHedgingPhrases += da.hedging_phrases?.length || 0;
    const allActiveVoice = profile.answers.map(a => a.feedback.delivery_analysis?.active_voice_pct || 0).filter(Boolean);
    profile.avgActiveVoicePct = allActiveVoice.length
      ? Math.round(allActiveVoice.reduce((a, b) => a + b, 0) / allActiveVoice.length)
      : 0;
    if (da.pacing) {
      profile.pacingDistribution[da.pacing] = (profile.pacingDistribution[da.pacing] || 0) + 1;
    }
  }

  // Update overall stats
  const allScores = profile.answers.map(a => a.feedback.overall_score).filter(Boolean);
  profile.overallAvgScore = allScores.length
    ? Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length)
    : 0;
  profile.totalPracticeMinutes += Math.round(answer.durationSec / 60);

  saveProfile(profile);
  return profile;
}

export function recordSession(session: SessionRecord): LearningProfile {
  const profile = getProfile();
  const idx = profile.sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) profile.sessions[idx] = session;
  else profile.sessions.unshift(session);
  profile.lastSessionDate = session.startedAt;
  saveProfile(profile);
  return profile;
}

export function getWeakAreas(): WeakAreaProfile[] {
  const profile = getProfile();
  return Object.values(profile.weakAreaProfiles)
    .filter(w => w.totalOccurrences > 0)
    .sort((a, b) => a.avgScore - b.avgScore);
}

export function getSessionCount(): number {
  return getProfile().sessions.length;
}
