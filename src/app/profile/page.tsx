"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { getProfile, saveUserProfile, UserProfile } from "@/lib/store";

const ROLE_OPTIONS = [
  "Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack",
  "ML/AI Engineer", "Data Scientist", "DevOps/SRE", "Mobile Developer",
  "Product Manager", "Data Engineer", "Security Engineer", "QA Engineer",
];

const COMPANY_PRESETS = [
  "Google", "Amazon", "Meta", "Microsoft", "Apple", "Netflix",
  "Startup", "Other",
];

const ROUND_TYPES = [
  "Phone Screen", "Technical Round", "System Design", "Behavioral / Bar Raiser",
  "Onsite Loop", "Take-Home", "Final Round", "General Prep",
];

const INTERVIEW_TYPES = [
  { id: "behavioral", label: "Behavioral", desc: "STAR stories, leadership" },
  { id: "technical", label: "Technical", desc: "Coding, algorithms" },
  { id: "system_design", label: "System Design", desc: "Architecture, scalability" },
  { id: "mixed", label: "Mixed", desc: "All types" },
];

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile>({
    name: "", background: "", targetRole: "Software Engineer",
    targetCompany: "Google", experience: "", skills: "", country: "",
  });
  const [interviewType, setInterviewType] = useState("mixed");
  const [roundType, setRoundType] = useState("General Prep");
  const [jobDescription, setJobDescription] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [saved, setSaved] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push("/login"); return; }
    const p = getProfile();
    if (p.userProfile.name) {
      setProfile(p.userProfile);
    } else if (user) {
      setProfile(prev => ({ ...prev, name: user.name || prev.name }));
    }
    // Load session config
    const config = localStorage.getItem("interview_session_config");
    if (config) {
      try {
        const parsed = JSON.parse(config);
        if (parsed.interviewType) setInterviewType(parsed.interviewType);
        if (parsed.roundType) setRoundType(parsed.roundType);
        if (parsed.jobDescription) setJobDescription(parsed.jobDescription);
        if (parsed.companyName) {
          const isPreset = COMPANY_PRESETS.includes(parsed.companyName);
          if (!isPreset) {
            setProfile(prev => ({ ...prev, targetCompany: "Other" }));
            setCustomCompany(parsed.companyName);
          }
        }
      } catch { /* ignore */ }
    }
  }, [user, loading, router]);

  const saveAndGenerate = useCallback(async () => {
    const company = profile.targetCompany === "Other" ? customCompany || "General" : profile.targetCompany;
    const updatedProfile = { ...profile, targetCompany: company };

    // Save profile to localStorage
    saveUserProfile(updatedProfile);

    // Save to auth backend
    if (user?.id) {
      fetch("/api/auth/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: updatedProfile.name,
          background: updatedProfile.background,
          target_role: updatedProfile.targetRole,
          target_company: company,
          experience: updatedProfile.experience,
          skills: updatedProfile.skills,
        }),
      }).catch(() => {});
    }

    // Generate new questions for the updated company/role
    setGeneratingQuestions(true);
    try {
      const p = getProfile();
      const res = await fetch("/api/adaptive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_session",
          company,
          role: updatedProfile.targetRole,
          country: updatedProfile.country || "",
          profile: updatedProfile,
          weakAreas: Object.entries(p.weakAreaProfiles || {}).map(([area, wp]) => ({
            area, score: (wp as { avgScore: number }).avgScore || 50, frequency: 1,
          })),
          completedQuestions: (p.completedQuestionTexts || []).slice(-20),
          sessionNumber: (p.sessions?.length || 0) + 1,
          jobDescription: jobDescription || "",
          interviewType,
          roundType,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        // Save new session config
        const sessionConfig = {
          companyName: company,
          interviewType,
          roundType,
          jobDescription,
          country: updatedProfile.country,
          generatedQuestions: data.questions || [],
        };
        localStorage.setItem("interview_session_config", JSON.stringify(sessionConfig));
      }
    } catch (err) {
      console.error("Question generation error:", err);
    }
    setGeneratingQuestions(false);
    setSaved(true);
    setTimeout(() => router.push("/"), 1200);
  }, [profile, customCompany, jobDescription, interviewType, roundType, user, router]);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="text-muted">Loading...</div></div>;
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-3 border-b border-border bg-surface">
        <button onClick={() => router.push("/")} className="text-sm text-muted hover:text-accent transition-colors">
          &larr; Back to Dashboard
        </button>
        <span className="text-sm font-bold text-slate-200">Profile & Settings</span>
        <span className="text-xs text-muted">{user?.name}</span>
      </nav>

      <div className="max-w-2xl mx-auto p-6 space-y-8">
        {/* Personal Info */}
        <section className="bg-card rounded-xl p-6 border border-border space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Personal Info</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-muted font-semibold block mb-1">Name</label>
              <input
                value={profile.name}
                onChange={e => setProfile(p => ({ ...p, name: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs text-muted font-semibold block mb-1">Country</label>
              <input
                value={profile.country || ""}
                onChange={e => setProfile(p => ({ ...p, country: e.target.value }))}
                className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
                placeholder="e.g. United States"
              />
            </div>
          </div>
          <div>
            <label className="text-xs text-muted font-semibold block mb-1">Background</label>
            <textarea
              value={profile.background}
              onChange={e => setProfile(p => ({ ...p, background: e.target.value }))}
              rows={2}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-none"
              placeholder="Brief career summary..."
            />
          </div>
          <div>
            <label className="text-xs text-muted font-semibold block mb-1">Experience</label>
            <textarea
              value={profile.experience}
              onChange={e => setProfile(p => ({ ...p, experience: e.target.value }))}
              rows={2}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-none"
              placeholder="Work history and key projects..."
            />
          </div>
          <div>
            <label className="text-xs text-muted font-semibold block mb-1">Skills</label>
            <input
              value={profile.skills}
              onChange={e => setProfile(p => ({ ...p, skills: e.target.value }))}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
              placeholder="React, Node.js, Python, AWS..."
            />
          </div>
        </section>

        {/* Target Company */}
        <section className="bg-card rounded-xl p-6 border border-border space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Target Company & Role</h2>
          <div>
            <label className="text-xs text-muted font-semibold block mb-2">Company</label>
            <div className="flex flex-wrap gap-2">
              {COMPANY_PRESETS.map(c => (
                <button
                  key={c}
                  onClick={() => { setProfile(p => ({ ...p, targetCompany: c })); if (c !== "Other") setCustomCompany(""); }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    profile.targetCompany === c
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-muted border-border hover:border-accent hover:text-slate-200"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {profile.targetCompany === "Other" && (
              <input
                value={customCompany}
                onChange={e => setCustomCompany(e.target.value)}
                placeholder="Enter company name..."
                className="mt-2 w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
              />
            )}
          </div>
          <div>
            <label className="text-xs text-muted font-semibold block mb-2">Target Role</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setProfile(p => ({ ...p, targetRole: r }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    profile.targetRole === r
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-muted border-border hover:border-accent hover:text-slate-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Interview Settings */}
        <section className="bg-card rounded-xl p-6 border border-border space-y-4">
          <h2 className="text-lg font-bold text-slate-200">Interview Settings</h2>
          <div>
            <label className="text-xs text-muted font-semibold block mb-2">Interview Type</label>
            <div className="flex flex-wrap gap-2">
              {INTERVIEW_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setInterviewType(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    interviewType === t.id
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-muted border-border hover:border-accent hover:text-slate-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted font-semibold block mb-2">Round Type</label>
            <div className="flex flex-wrap gap-2">
              {ROUND_TYPES.map(r => (
                <button
                  key={r}
                  onClick={() => setRoundType(r)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                    roundType === r
                      ? "bg-accent text-white border-accent"
                      : "bg-surface text-muted border-border hover:border-accent hover:text-slate-200"
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="text-xs text-muted font-semibold block mb-1">Job Description (optional)</label>
            <textarea
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              rows={3}
              className="w-full bg-surface border border-border rounded-lg px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none resize-none"
              placeholder="Paste the job description for more tailored questions..."
            />
          </div>
        </section>

        {/* Save Button */}
        <button
          onClick={saveAndGenerate}
          disabled={generatingQuestions}
          className={`w-full py-3 rounded-xl font-bold text-white transition-all ${
            generatingQuestions
              ? "bg-accent/50 cursor-not-allowed"
              : saved
                ? "bg-green-600 hover:bg-green-700"
                : "bg-accent hover:bg-accent/90 shadow-lg shadow-accent/20"
          }`}
        >
          {generatingQuestions
            ? "Generating new questions for this company..."
            : saved
              ? "Saved! Redirecting..."
              : "Save & Generate New Questions"}
        </button>

        <p className="text-xs text-muted text-center">
          Saving will generate new interview questions tailored to your updated company and role.
        </p>
      </div>
    </div>
  );
}
