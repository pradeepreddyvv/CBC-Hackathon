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
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push("/login"); return; }
    // Wait until auth is confirmed before fetching
    if (loading) return;

    // Load session config for interview settings (always available from localStorage)
    let sessionCompany = "";
    let sessionCountry = "";
    const config = localStorage.getItem("interview_session_config");
    if (config) {
      try {
        const parsed = JSON.parse(config);
        if (parsed.interviewType) setInterviewType(parsed.interviewType);
        if (parsed.roundType) setRoundType(parsed.roundType);
        if (parsed.jobDescription) setJobDescription(parsed.jobDescription);
        sessionCompany = parsed.companyName || "";
        sessionCountry = parsed.country || "";
      } catch { /* ignore */ }
    }

    // Load localStorage profile as immediate fallback (shows data while DB fetches)
    const localProfile = getProfile();
    if (localProfile.userProfile?.name) {
      setProfile(localProfile.userProfile);
      if (localProfile.userProfile.targetCompany && !COMPANY_PRESETS.includes(localProfile.userProfile.targetCompany)) {
        setProfile(prev => ({ ...prev, targetCompany: "Other" }));
        setCustomCompany(localProfile.userProfile.targetCompany);
      }
    } else if (sessionCompany || user) {
      // At least fill from session config / auth user
      setProfile(prev => ({
        ...prev,
        name: user?.name || prev.name,
        targetCompany: sessionCompany && COMPANY_PRESETS.includes(sessionCompany) ? sessionCompany : sessionCompany ? "Other" : prev.targetCompany,
        country: sessionCountry || prev.country,
      }));
      if (sessionCompany && !COMPANY_PRESETS.includes(sessionCompany)) {
        setCustomCompany(sessionCompany);
      }
    }

    // Fetch full user data from DB (overrides localStorage with latest)
    const fetchFullUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          if (u) {
            const dbProfile: UserProfile = {
              name: u.name || "",
              background: u.background || "",
              targetRole: u.target_role || "",
              targetCompany: u.target_company || "",
              experience: u.experience || "",
              skills: u.skills || "",
              country: u.country || "",
            };

            // Merge: prefer DB values, fall back to localStorage, then session config
            setProfile(prev => ({
              name: dbProfile.name || prev.name || user?.name || "",
              background: dbProfile.background || prev.background || "",
              targetRole: dbProfile.targetRole || prev.targetRole || "Software Engineer",
              targetCompany: dbProfile.targetCompany || prev.targetCompany || sessionCompany || "Google",
              experience: dbProfile.experience || prev.experience || "",
              skills: dbProfile.skills || prev.skills || "",
              country: dbProfile.country || prev.country || sessionCountry || "",
            }));

            // Handle "Other" company
            const finalCompany = dbProfile.targetCompany || localProfile.userProfile?.targetCompany || sessionCompany || "Google";
            if (finalCompany && !COMPANY_PRESETS.includes(finalCompany)) {
              setProfile(prev => ({ ...prev, targetCompany: "Other" }));
              setCustomCompany(finalCompany);
            }
          }
        }
      } catch {
        // DB fetch failed — localStorage fallback already loaded above
      }
    };
    fetchFullUser();
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
          country: updatedProfile.country || "",
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
            <label className="text-xs text-muted font-semibold block mb-1">Job Description <span style={{ color: "#f87171" }}>*</span></label>
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

        {/* Delete My Data */}
        <section className="bg-card rounded-xl p-6 border border-red-500/20 space-y-3 mt-10">
          <h2 className="text-sm font-bold text-red-400 uppercase tracking-wider">Data & Privacy</h2>
          <p className="text-sm text-muted leading-relaxed">
            Delete all your interview data — transcripts, answers, scores, and session history. Your profile info will be cleared. This action cannot be undone.
          </p>
          {deleted ? (
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30 text-green-400 text-sm font-semibold text-center">
              All data deleted successfully.
            </div>
          ) : !deleteConfirm ? (
            <button
              onClick={() => setDeleteConfirm(true)}
              className="px-4 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/20 transition-colors"
            >
              Delete My Data
            </button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-sm text-red-400 font-semibold">Are you sure?</span>
              <button
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await fetch("/api/delete-data", { method: "POST" });
                    localStorage.removeItem("interview_coach_profile");
                    localStorage.removeItem("interview_questions");
                    localStorage.removeItem("interview_history");
                    setDeleted(true);
                    setProfile({ name: "", background: "", targetRole: "Software Engineer", targetCompany: "Google", experience: "", skills: "", country: "" });
                    setJobDescription("");
                    setTimeout(() => router.push("/login"), 2000);
                  } catch { /* ignore */ }
                  setDeleting(false);
                }}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600 disabled:opacity-50 transition-colors"
              >
                {deleting ? "Deleting..." : "Yes, Delete Everything"}
              </button>
              <button
                onClick={() => setDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg bg-surface border border-border text-muted text-xs font-semibold hover:border-border-hi transition-colors"
              >
                Cancel
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
