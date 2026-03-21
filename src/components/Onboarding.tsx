"use client";
import { useState } from "react";
import { AccessibilityMode, LearningStyle, UserProfile } from "@/lib/store";
import { COMPANY_PATTERNS } from "@/lib/company-patterns";

interface OnboardingProps {
  onComplete: (profile: Partial<UserProfile>) => void;
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [company, setCompany] = useState("General");
  const [role, setRole] = useState("Software Engineer");
  const [accessMode, setAccessMode] = useState<AccessibilityMode>("default");
  const [learnStyle, setLearnStyle] = useState<LearningStyle>("mixed");

  const steps = [
    // Step 0: Welcome
    () => (
      <div className="text-center space-y-6 fade-in">
        <div className="text-5xl">🎯</div>
        <h2 className="text-2xl font-bold text-slate-200">Welcome to InterviewCoach</h2>
        <p className="text-sm text-muted max-w-md mx-auto">
          AI-powered mock interviews with sentence-level feedback, adaptive learning, and accessibility built in.
        </p>
        <button onClick={() => setStep(1)} className="px-8 py-3 bg-accent text-white rounded-lg font-semibold hover:bg-accent/80 transition-colors">
          Get Started
        </button>
      </div>
    ),

    // Step 1: Target Company
    () => (
      <div className="space-y-5 fade-in">
        <h2 className="text-xl font-bold text-slate-200">What company are you targeting?</h2>
        <p className="text-sm text-muted">We&apos;ll tailor questions and feedback to their interview style.</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.keys(COMPANY_PATTERNS).map(c => (
            <button
              key={c}
              onClick={() => setCompany(c)}
              className={`p-4 rounded-xl border-2 text-sm font-semibold transition-all ${
                company === c
                  ? "border-accent bg-accent/10 text-white"
                  : "border-border bg-card text-muted hover:border-accent/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        {company !== "General" && (
          <div className="bg-surface rounded-lg p-3 text-xs text-muted slide-up">
            <span className="text-accent font-bold">{company}:</span> {COMPANY_PATTERNS[company]?.interviewStyle.substring(0, 150)}...
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={() => setStep(0)} className="px-6 py-2.5 text-sm text-muted hover:text-slate-200">Back</button>
          <button onClick={() => setStep(2)} className="flex-1 py-2.5 bg-accent text-white rounded-lg font-semibold hover:bg-accent/80 transition-colors">Next</button>
        </div>
      </div>
    ),

    // Step 2: Role
    () => (
      <div className="space-y-5 fade-in">
        <h2 className="text-xl font-bold text-slate-200">What role are you preparing for?</h2>
        <div className="grid grid-cols-2 gap-3">
          {["Software Engineer", "SWE Intern", "Senior SDE", "ML Engineer", "Frontend Engineer", "Fullstack Engineer", "Data Engineer", "DevOps/SRE"].map(r => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`p-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                role === r
                  ? "border-accent bg-accent/10 text-white"
                  : "border-border bg-card text-muted hover:border-accent/50"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <div>
          <label className="text-xs text-muted font-semibold block mb-1">Or type custom role</label>
          <input
            type="text"
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
          />
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStep(1)} className="px-6 py-2.5 text-sm text-muted hover:text-slate-200">Back</button>
          <button onClick={() => setStep(3)} className="flex-1 py-2.5 bg-accent text-white rounded-lg font-semibold hover:bg-accent/80 transition-colors">Next</button>
        </div>
      </div>
    ),

    // Step 3: Accessibility
    () => (
      <div className="space-y-5 fade-in">
        <h2 className="text-xl font-bold text-slate-200">Accessibility preferences</h2>
        <p className="text-sm text-muted">Optional — choose what helps you learn best.</p>
        <div className="space-y-3">
          {([
            { id: "default" as AccessibilityMode, label: "Default", desc: "Standard interface", icon: "🖥️" },
            { id: "adhd" as AccessibilityMode, label: "ADHD-Friendly", desc: "Micro-chunks, Pomodoro timer, progress rewards, reduced distractions", icon: "⚡" },
            { id: "dyslexia" as AccessibilityMode, label: "Dyslexia-Friendly", desc: "OpenDyslexic font, increased spacing, pastel background, text-to-speech", icon: "📖" },
            { id: "focus" as AccessibilityMode, label: "Focus Mode", desc: "Stripped UI — just the question and your microphone", icon: "🎯" },
          ]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setAccessMode(opt.id)}
              className={`w-full p-4 rounded-xl border-2 text-left transition-all flex items-start gap-3 ${
                accessMode === opt.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-card hover:border-accent/50"
              }`}
            >
              <span className="text-2xl">{opt.icon}</span>
              <div>
                <div className="text-sm font-semibold text-slate-200">{opt.label}</div>
                <div className="text-xs text-muted">{opt.desc}</div>
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStep(2)} className="px-6 py-2.5 text-sm text-muted hover:text-slate-200">Back</button>
          <button onClick={() => setStep(4)} className="flex-1 py-2.5 bg-accent text-white rounded-lg font-semibold hover:bg-accent/80 transition-colors">Next</button>
        </div>
      </div>
    ),

    // Step 4: Learning Style
    () => (
      <div className="space-y-5 fade-in">
        <h2 className="text-xl font-bold text-slate-200">How do you learn best?</h2>
        <p className="text-sm text-muted">We&apos;ll adapt feedback delivery to your style.</p>
        <div className="grid grid-cols-2 gap-3">
          {([
            { id: "visual" as LearningStyle, label: "Visual", desc: "Charts, score bars, color-coded feedback", icon: "📊" },
            { id: "auditory" as LearningStyle, label: "Auditory", desc: "Feedback read aloud, voice coaching", icon: "🔊" },
            { id: "reading" as LearningStyle, label: "Reading/Writing", desc: "Detailed text, rewrites, written coaching", icon: "📝" },
            { id: "mixed" as LearningStyle, label: "Mixed", desc: "Best of everything — all formats", icon: "🎯" },
          ]).map(opt => (
            <button
              key={opt.id}
              onClick={() => setLearnStyle(opt.id)}
              className={`p-4 rounded-xl border-2 text-center transition-all ${
                learnStyle === opt.id
                  ? "border-accent bg-accent/10"
                  : "border-border bg-card hover:border-accent/50"
              }`}
            >
              <div className="text-2xl mb-1">{opt.icon}</div>
              <div className="text-sm font-semibold text-slate-200">{opt.label}</div>
              <div className="text-[10px] text-muted mt-1">{opt.desc}</div>
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button onClick={() => setStep(3)} className="px-6 py-2.5 text-sm text-muted hover:text-slate-200">Back</button>
          <button
            onClick={() => onComplete({
              targetCompany: company,
              targetRole: role,
              accessibilityMode: accessMode,
              learningStyle: learnStyle,
              ttsEnabled: learnStyle === "auditory" || accessMode === "dyslexia",
              onboardingComplete: true,
            })}
            className="flex-1 py-2.5 bg-accent2 text-bg rounded-lg font-semibold hover:bg-accent2/80 transition-colors"
          >
            Start Practicing
          </button>
        </div>
      </div>
    ),
  ];

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full transition-all ${
                i === step ? "bg-accent w-6" : i < step ? "bg-accent2" : "bg-border"
              }`}
            />
          ))}
        </div>
        {steps[step]()}
      </div>
    </div>
  );
}
