"use client";
import { useState, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

const ROLE_OPTIONS = [
  "Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack",
  "ML/AI Engineer", "Data Scientist", "DevOps/SRE", "Mobile Developer",
  "Product Manager", "Data Engineer", "Security Engineer", "QA Engineer",
];

const INTERVIEW_TYPES = [
  { id: "behavioral", label: "Behavioral", desc: "STAR stories, leadership, conflict resolution", icon: "💬" },
  { id: "technical", label: "Technical", desc: "Coding, algorithms, system knowledge", icon: "💻" },
  { id: "system_design", label: "System Design", desc: "Architecture, scalability, trade-offs", icon: "🏗️" },
  { id: "mixed", label: "Mixed (Recommended)", desc: "All types — most realistic prep", icon: "🎯" },
];

const ROUND_TYPES = [
  "Phone Screen", "Technical Round", "System Design", "Behavioral / Bar Raiser",
  "Onsite Loop", "Take-Home", "Final Round", "General Prep",
];

const COMPANY_PRESETS = [
  "Google", "Amazon", "Meta", "Microsoft", "Apple", "Netflix",
  "Startup", "Other",
];

interface OnboardingData {
  name: string;
  country: string;
  resumeText: string;
  llmContext: string;
  targetRoles: string[];
  background: string;
  experience: string;
  skills: string;
  interviewType: string;
  companyName: string;
  jobDescription: string;
  yearsExperience: string;
  roundType: string;
  targetSkills: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  researchResults: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  generatedQuestions: any[];
}

export default function OnboardingPage() {
  const { user, refreshUser } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OnboardingData>({
    name: user?.name || "",
    country: "",
    resumeText: "",
    llmContext: "",
    targetRoles: [],
    background: "",
    experience: "",
    skills: "",
    interviewType: "mixed",
    companyName: "Google",
    jobDescription: "",
    yearsExperience: "0-2",
    roundType: "General Prep",
    targetSkills: "",
    researchResults: null,
    generatedQuestions: [],
  });

  const [isOtherCompany, setIsOtherCompany] = useState(false);
  const [autoFillJdLoading, setAutoFillJdLoading] = useState(false);
  const update = (fields: Partial<OnboardingData>) => setData(prev => ({ ...prev, ...fields }));

  const toggleRole = (role: string) => {
    setData(prev => ({
      ...prev,
      targetRoles: prev.targetRoles.includes(role)
        ? prev.targetRoles.filter(r => r !== role)
        : [...prev.targetRoles, role],
    }));
  };

  // Auto-fill from resume/context
  const autoFill = useCallback(async () => {
    if (!data.resumeText && !data.llmContext) return;
    setLoading(true);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resume: data.resumeText, context: data.llmContext }),
      });
      const result = await res.json();
      if (result.profile) {
        const p = result.profile;
        update({
          name: p.name || data.name,
          background: p.background || data.background,
          experience: p.experience || data.experience,
          skills: p.skills || data.skills,
        });
      }
    } catch (e) {
      console.error("Auto-fill error:", e);
    } finally {
      setLoading(false);
    }
  }, [data.resumeText, data.llmContext, data.name, data.background, data.experience, data.skills]);

  // Auto-fill Step 3 fields from Job Description using Gemini
  const autoFillFromJD = useCallback(async () => {
    if (!data.jobDescription.trim()) return;
    setAutoFillJdLoading(true);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription: data.jobDescription }),
      });
      const result = await res.json();
      if (result.profile) {
        const p = result.profile;
        const fields: Partial<OnboardingData> = {};
        // Target company
        if (p.targetCompany && p.targetCompany !== "General") {
          const preset = COMPANY_PRESETS.find(c => c.toLowerCase() === p.targetCompany.toLowerCase());
          if (preset) {
            fields.companyName = preset;
            setIsOtherCompany(false);
          } else {
            fields.companyName = p.targetCompany;
            setIsOtherCompany(true);
          }
        }
        // Years of experience
        if (p.yearsExperience) {
          const yoe = p.yearsExperience;
          if (yoe <= 2) fields.yearsExperience = "0-2";
          else if (yoe <= 5) fields.yearsExperience = "2-5";
          else if (yoe <= 10) fields.yearsExperience = "5-10";
          else fields.yearsExperience = "10+";
        }
        // Round type
        if (p.roundType) {
          const matchedRound = ROUND_TYPES.find(r => r.toLowerCase().includes(p.roundType.toLowerCase()));
          if (matchedRound) fields.roundType = matchedRound;
        }
        // Key skills
        if (p.keySkills) {
          fields.targetSkills = typeof p.keySkills === "string" ? p.keySkills : (p.keySkills as string[]).join(", ");
        }
        // Target role from JD
        if (p.targetRole) {
          const matchedRole = ROLE_OPTIONS.find(r => r.toLowerCase().includes(p.targetRole.toLowerCase()));
          if (matchedRole && !data.targetRoles.includes(matchedRole)) {
            fields.targetRoles = [...data.targetRoles, matchedRole];
          }
        }
        update(fields);
      }
    } catch (e) {
      console.error("Auto-fill from JD error:", e);
    } finally {
      setAutoFillJdLoading(false);
    }
  }, [data.jobDescription, data.targetRoles]);

  // Run internet research
  const runResearch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: data.companyName,
          role: data.targetRoles[0] || "Software Engineer",
          interviewType: data.interviewType,
          roundType: data.roundType,
          skills: data.targetSkills || data.skills,
          yearsExperience: data.yearsExperience,
          country: data.country,
        }),
      });
      const result = await res.json();
      update({ researchResults: result.research });
    } catch (e) {
      console.error("Research error:", e);
    } finally {
      setLoading(false);
    }
  }, [data]);

  // Generate questions
  const generateQuestions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/adaptive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_session",
          company: data.companyName,
          role: data.targetRoles[0] || "Software Engineer",
          country: data.country,
          profile: {
            name: data.name,
            background: data.background,
            targetRole: data.targetRoles[0] || "Software Engineer",
            targetCompany: data.companyName,
            experience: data.experience,
            skills: data.skills,
            country: data.country,
          },
          weakAreas: [],
          completedQuestions: [],
          sessionNumber: 1,
          interviewType: data.interviewType,
          jobDescription: data.jobDescription,
          researchContext: data.researchResults
            ? JSON.stringify(data.researchResults).substring(0, 3000)
            : undefined,
        }),
      });
      const result = await res.json();
      if (result.session?.questions) {
        update({ generatedQuestions: result.session.questions });
      }
    } catch (e) {
      console.error("Generate error:", e);
    } finally {
      setLoading(false);
    }
  }, [data]);

  // Save and start practice
  const finishOnboarding = async () => {
    setLoading(true);
    try {
      // Save profile to DB
      await fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          background: data.background,
          target_role: data.targetRoles[0] || "Software Engineer",
          target_company: data.companyName,
          experience: data.experience,
          skills: data.skills,
          resume_text: data.resumeText,
          llm_context: data.llmContext,
          target_roles: data.targetRoles,
          interview_type: data.interviewType,
          country: data.country,
          onboarded: true,
        }),
      });
      await refreshUser();
      // Store session config in localStorage for the practice page
      localStorage.setItem("interview_session_config", JSON.stringify({
        companyName: data.companyName,
        interviewType: data.interviewType,
        roundType: data.roundType,
        jobDescription: data.jobDescription,
        generatedQuestions: data.generatedQuestions,
        researchResults: data.researchResults,
        country: data.country,
      }));
      router.push("/");
    } catch (e) {
      console.error("Save error:", e);
    } finally {
      setLoading(false);
    }
  };

  const totalSteps = 5;

  return (
    <div className="min-h-screen bg-bg">
      {/* Progress Bar */}
      <div className="bg-surface border-b border-border px-4 py-3">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-2">
            <span className="text-lg font-bold text-accent">InterviewCoach</span>
            <span className="text-xs text-muted">Step {step} of {totalSteps}</span>
          </div>
          <div className="flex gap-1">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i < step ? "bg-accent" : "bg-border"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 py-8">
        {/* ═══ STEP 1: Profile ═══ */}
        {step === 1 && (
          <div className="space-y-5 fade-in">
            <div>
              <h2 className="text-xl font-bold text-slate-200">Your Profile</h2>
              <p className="text-sm text-muted mt-1">Tell us about yourself so we can personalize your practice.</p>
            </div>

            {/* Quick fill */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <h3 className="text-sm font-bold text-accent2">Quick Fill (Optional)</h3>

              {/* Resume Upload */}
              <div>
                <label className="text-xs text-muted font-semibold block mb-2">Upload Resume</label>
                <label className="flex items-center justify-center gap-3 w-full py-4 bg-surface border-2 border-dashed border-border rounded-xl cursor-pointer hover:border-accent transition-colors group">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt,.md"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setLoading(true);
                      try {
                        const formData = new FormData();
                        formData.append("file", file);
                        const res = await fetch("/api/parse-resume", { method: "POST", body: formData });
                        const result = await res.json();
                        if (result.text) {
                          update({ resumeText: result.text });
                        } else {
                          alert("Could not extract text from file. Try pasting instead.");
                        }
                      } catch {
                        alert("Failed to parse resume file.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                  />
                  <svg className="w-6 h-6 text-muted group-hover:text-accent transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <div>
                    <span className="text-sm text-slate-200 group-hover:text-accent transition-colors font-semibold">
                      {loading ? "Parsing..." : "Click to upload resume"}
                    </span>
                    <span className="text-xs text-muted block">PDF, DOCX, or TXT</span>
                  </div>
                </label>
                {data.resumeText && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-green-400 font-semibold">Resume loaded</span>
                    <span className="text-xs text-muted">({data.resumeText.length} chars)</span>
                  </div>
                )}
              </div>

              {/* Or paste manually */}
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Or Paste Resume Text</label>
                <textarea
                  value={data.resumeText}
                  onChange={e => update({ resumeText: e.target.value })}
                  placeholder="Copy-paste your resume text here..."
                  rows={3}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-y"
                />
              </div>
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">LLM-Generated Context (Optional)</label>
                <textarea
                  value={data.llmContext}
                  onChange={e => update({ llmContext: e.target.value })}
                  placeholder="Paste output from ChatGPT/Claude about your background..."
                  rows={3}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-y"
                />
              </div>
              {(data.resumeText || data.llmContext) && (
                <button onClick={autoFill} disabled={loading}
                  className="w-full py-2.5 bg-accent2 text-bg rounded-lg text-sm font-semibold hover:bg-accent2/80 disabled:opacity-50 transition-colors">
                  {loading ? "Analyzing..." : "Auto-Fill from Resume / Context"}
                </button>
              )}
            </div>

            {/* Manual fields */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-3">
              <InputField label="Name" value={data.name} onChange={v => update({ name: v })} placeholder="Your name" />
              <InputField label="Country" value={data.country} onChange={v => update({ country: v })} placeholder="e.g., United States, India, Germany" />
              <InputField label="Background" value={data.background} onChange={v => update({ background: v })} placeholder="e.g., CS student, 3 years backend engineer" />
              <InputField label="Experience" value={data.experience} onChange={v => update({ experience: v })} placeholder="Key projects, achievements with metrics" multiline />
              <InputField label="Skills" value={data.skills} onChange={v => update({ skills: v })} placeholder="Python, React, AWS, System Design, etc." />

              {/* Target Roles Multi-Select */}
              <div>
                <label className="text-xs text-muted font-semibold block mb-2">Target Roles (select all that apply)</label>
                <div className="flex flex-wrap gap-2">
                  {ROLE_OPTIONS.map(role => (
                    <button
                      key={role}
                      onClick={() => toggleRole(role)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        data.targetRoles.includes(role)
                          ? "bg-accent text-white"
                          : "bg-surface border border-border text-muted hover:border-accent hover:text-slate-200"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ STEP 2: Interview Type ═══ */}
        {step === 2 && (
          <div className="space-y-5 fade-in">
            <div>
              <h2 className="text-xl font-bold text-slate-200">Interview Type</h2>
              <p className="text-sm text-muted mt-1">What type of interview are you preparing for?</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {INTERVIEW_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => update({ interviewType: t.id })}
                  className={`p-5 rounded-xl border-2 text-left transition-all ${
                    data.interviewType === t.id
                      ? "border-accent bg-accent/10"
                      : "border-border bg-card hover:border-accent/50"
                  }`}
                >
                  <div className="text-2xl mb-2">{t.icon}</div>
                  <div className="text-sm font-bold text-slate-200">{t.label}</div>
                  <div className="text-xs text-muted mt-1">{t.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ═══ STEP 3: Company & Role Details ═══ */}
        {step === 3 && (
          <div className="space-y-5 fade-in">
            <div>
              <h2 className="text-xl font-bold text-slate-200">Company & Role Details</h2>
              <p className="text-sm text-muted mt-1">Tell us about the specific role you&apos;re targeting.</p>
            </div>

            {/* Job Description — Required, at the top */}
            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">
                  Job Description <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={data.jobDescription}
                  onChange={e => update({ jobDescription: e.target.value })}
                  placeholder="Paste the full job description here — we'll auto-fill company, skills, experience level, and more..."
                  rows={6}
                  className={`w-full bg-surface border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-y ${
                    !data.jobDescription.trim() ? "border-red-500/50" : "border-border"
                  }`}
                />
                {!data.jobDescription.trim() && (
                  <p className="text-xs text-red-400 mt-1">Job description is required for personalized questions.</p>
                )}
              </div>

              {data.jobDescription.trim() && (
                <button
                  onClick={autoFillFromJD}
                  disabled={autoFillJdLoading}
                  className="w-full py-2.5 bg-accent2 text-bg rounded-lg text-sm font-semibold hover:bg-accent2/80 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {autoFillJdLoading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-bg border-t-transparent rounded-full animate-spin" />
                      Analyzing JD with AI...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                      Auto-Fill from Job Description
                    </>
                  )}
                </button>
              )}
            </div>

            <div className="bg-card border border-border rounded-xl p-5 space-y-4">
              {/* Company Selection */}
              <div>
                <label className="text-xs text-muted font-semibold block mb-2">Target Company</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {COMPANY_PRESETS.map(c => (
                    <button
                      key={c}
                      onClick={() => {
                        if (c === "Other") {
                          setIsOtherCompany(true);
                          update({ companyName: "" });
                        } else {
                          setIsOtherCompany(false);
                          update({ companyName: c });
                        }
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        (c === "Other" && isOtherCompany) || (!isOtherCompany && data.companyName === c)
                          ? "bg-accent text-white"
                          : "bg-surface border border-border text-muted hover:border-accent"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
                {isOtherCompany && (
                  <input
                    type="text"
                    value={data.companyName}
                    placeholder="Enter company name"
                    onChange={e => update({ companyName: e.target.value })}
                    className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none mt-2"
                    autoFocus
                  />
                )}
              </div>

              {/* Years of Experience */}
              <div>
                <label className="text-xs text-muted font-semibold block mb-1">Years of Experience</label>
                <select
                  value={data.yearsExperience}
                  onChange={e => update({ yearsExperience: e.target.value })}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
                >
                  <option value="0-2">0-2 years (New Grad / Intern)</option>
                  <option value="2-5">2-5 years (Mid-Level)</option>
                  <option value="5-10">5-10 years (Senior)</option>
                  <option value="10+">10+ years (Staff+)</option>
                </select>
              </div>

              {/* Round Type */}
              <div>
                <label className="text-xs text-muted font-semibold block mb-2">Interview Round</label>
                <div className="flex flex-wrap gap-2">
                  {ROUND_TYPES.map(r => (
                    <button
                      key={r}
                      onClick={() => update({ roundType: r })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                        data.roundType === r
                          ? "bg-accent2 text-bg"
                          : "bg-surface border border-border text-muted hover:border-accent2"
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {/* Key Skills for this role */}
              <InputField
                label="Key Skills for This Role"
                value={data.targetSkills}
                onChange={v => update({ targetSkills: v })}
                placeholder="e.g., React, Node.js, distributed systems, leadership"
              />
            </div>
          </div>
        )}

        {/* ═══ STEP 4: Internet Research ═══ */}
        {step === 4 && (
          <div className="space-y-5 fade-in">
            <div>
              <h2 className="text-xl font-bold text-slate-200">Interview Research</h2>
              <p className="text-sm text-muted mt-1">
                We&apos;ll search Reddit, LeetCode, Glassdoor, and GeeksForGeeks for real interview experiences at {data.companyName}.
              </p>
            </div>

            {!data.researchResults && !loading && (
              <div className="text-center py-8">
                <button
                  onClick={runResearch}
                  className="px-8 py-4 bg-accent text-white rounded-xl font-semibold hover:bg-accent/80 transition-colors text-sm"
                >
                  Search Interview Experiences
                </button>
                <p className="text-xs text-muted mt-3">
                  Searches Reddit, LeetCode, Glassdoor, GFG for {data.companyName} {data.targetRoles[0] || "SWE"} interviews
                </p>
              </div>
            )}

            {loading && (
              <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted">Searching interview experiences across Reddit, LeetCode, Glassdoor, GFG...</p>
              </div>
            )}

            {data.researchResults && (
              <div className="space-y-4">
                {/* Interview Format */}
                {data.researchResults.interview_format && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-accent2 mb-2">Interview Format</h3>
                    <p className="text-xs text-slate-300">{data.researchResults.interview_format}</p>
                  </div>
                )}

                {/* Common Questions */}
                {data.researchResults.common_questions?.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-5">
                    <h3 className="text-sm font-bold text-accent mb-2">Common Questions Reported</h3>
                    <ul className="space-y-2">
                      {data.researchResults.common_questions.map((q: string, i: number) => (
                        <li key={i} className="text-xs text-slate-300 pl-3 relative before:absolute before:left-0 before:content-['→'] before:text-accent">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Tips */}
                {data.researchResults.tips?.length > 0 && (
                  <div className="bg-accent/10 border border-accent/30 rounded-xl p-5">
                    <h3 className="text-sm font-bold text-accent mb-2">Tips from Candidates</h3>
                    <ul className="space-y-2">
                      {data.researchResults.tips.map((t: string, i: number) => (
                        <li key={i} className="text-xs text-slate-300">{t}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Difficulty */}
                {data.researchResults.difficulty && (
                  <div className="bg-surface rounded-xl p-4 flex items-center gap-3">
                    <span className="text-xs text-muted">Reported Difficulty:</span>
                    <span className={`text-sm font-bold ${
                      data.researchResults.difficulty === "Hard" ? "text-red-400" :
                      data.researchResults.difficulty === "Medium" ? "text-yellow-400" : "text-green-400"
                    }`}>{data.researchResults.difficulty}</span>
                  </div>
                )}

                {/* Sources */}
                {data.researchResults.sources?.length > 0 && (
                  <div className="bg-surface rounded-xl p-4">
                    <h4 className="text-xs text-muted font-bold mb-2">Sources</h4>
                    <div className="flex flex-wrap gap-2">
                      {data.researchResults.sources.map((s: string, i: number) => (
                        <span key={i} className="text-[10px] bg-card px-2 py-1 rounded text-muted">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ STEP 5: Generated Questions ═══ */}
        {step === 5 && (
          <div className="space-y-5 fade-in">
            <div>
              <h2 className="text-xl font-bold text-slate-200">Your Interview Questions</h2>
              <p className="text-sm text-muted mt-1">
                Generated based on your profile, {data.companyName}&apos;s interview style, and real candidate experiences.
              </p>
            </div>

            {data.generatedQuestions.length === 0 && !loading && (
              <div className="text-center py-8">
                <button
                  onClick={generateQuestions}
                  className="px-8 py-4 bg-accent text-white rounded-xl font-semibold hover:bg-accent/80 transition-colors text-sm"
                >
                  Generate Personalized Questions
                </button>
              </div>
            )}

            {loading && (
              <div className="text-center py-12">
                <div className="inline-block w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin mb-4" />
                <p className="text-sm text-muted">AI is generating personalized questions based on your profile and research...</p>
              </div>
            )}

            {data.generatedQuestions.length > 0 && (
              <div className="space-y-3">
                {data.generatedQuestions.map((q: { text: string; type: string; category: string; difficulty: string; hint?: string }, i: number) => (
                  <div key={i} className="bg-card border border-border rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 rounded-full bg-accent text-white text-xs flex items-center justify-center font-bold">{i + 1}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        q.type === "behavioral" ? "bg-blue-900/50 text-blue-400" :
                        q.type === "technical" ? "bg-purple-900/50 text-purple-400" :
                        "bg-orange-900/50 text-orange-400"
                      }`}>{q.type}</span>
                      <span className="text-[10px] text-muted">{q.category}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                        q.difficulty === "easy" ? "bg-green-900/50 text-green-400" :
                        q.difficulty === "medium" ? "bg-yellow-900/50 text-yellow-400" :
                        "bg-red-900/50 text-red-400"
                      }`}>{q.difficulty}</span>
                    </div>
                    <p className="text-sm text-slate-200">{q.text}</p>
                    {q.hint && (
                      <p className="text-xs text-muted mt-2 italic">{q.hint}</p>
                    )}
                  </div>
                ))}

                <button
                  onClick={finishOnboarding}
                  disabled={loading}
                  className="w-full py-4 bg-accent text-white rounded-xl font-bold text-base hover:bg-accent/80 disabled:opacity-50 transition-colors mt-4"
                >
                  {loading ? "Saving..." : "Start Practicing"}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8">
          <button
            onClick={() => setStep(s => Math.max(1, s - 1))}
            disabled={step === 1}
            className="px-6 py-2.5 bg-surface border border-border rounded-lg text-sm text-muted hover:text-slate-200 disabled:opacity-30 transition-colors"
          >
            Back
          </button>

          {step < totalSteps && (
            <button
              onClick={() => {
                if (step === 4 && !data.researchResults) {
                  runResearch().then(() => setStep(s => s + 1));
                } else {
                  setStep(s => s + 1);
                }
              }}
              disabled={(step === 1 && !data.name) || (step === 3 && !data.jobDescription.trim())}
              className="px-6 py-2.5 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/80 disabled:opacity-50 transition-colors"
            >
              {step === 4 && !data.researchResults ? "Skip Research" : "Next"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, multiline }: {
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
