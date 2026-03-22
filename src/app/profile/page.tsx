"use client";
import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import { getProfile, saveUserProfile, UserProfile } from "@/lib/store";

const C = { cyan: "#22d3ee", violet: "#818cf8", success: "#34d399", warning: "#fbbf24", danger: "#f87171", text: "var(--text)", sec: "var(--text-sec)", tert: "var(--text-tert)" };
const card = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 20 };

const ROLE_OPTIONS = ["Software Engineer","Frontend Engineer","Backend Engineer","Full Stack","ML/AI Engineer","Data Scientist","DevOps/SRE","Mobile Developer","Product Manager","Data Engineer","Security Engineer","QA Engineer"];
const COMPANY_PRESETS = ["Google","Amazon","Meta","Microsoft","Apple","Netflix","Startup","Other"];
const ROUND_TYPES = ["Phone Screen","Technical Round","System Design","Behavioral / Bar Raiser","Onsite Loop","Take-Home","Final Round","General Prep"];
const INTERVIEW_TYPES = [
  { id: "behavioral", label: "Behavioral", desc: "STAR stories, leadership", icon: "💬" },
  { id: "technical", label: "Technical", desc: "Coding, algorithms", icon: "💻" },
  { id: "system_design", label: "System Design", desc: "Architecture, scalability", icon: "🏗️" },
  { id: "mixed", label: "Mixed", desc: "All types — most realistic", icon: "🎯", badge: "Recommended" },
];
const EXP_OPTIONS = [{ v: "0-2", l: "0–2 yrs", sub: "New Grad" },{ v: "2-5", l: "2–5 yrs", sub: "Mid-Level" },{ v: "5-10", l: "5–10 yrs", sub: "Senior" },{ v: "10+", l: "10+ yrs", sub: "Staff+" }];

function Field({ label, value, onChange, placeholder, multiline, rows, required }: { label: string; value: string; onChange: (v: string) => void; placeholder: string; multiline?: boolean; rows?: number; required?: boolean }) {
  const [focused, setFocused] = useState(false);
  const base: React.CSSProperties = { width: "100%", background: focused ? "rgba(34,211,238,0.05)" : "rgba(255,255,255,0.04)", border: `1px solid ${focused ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.10)"}`, borderRadius: 12, padding: "14px 16px", fontSize: 15, color: C.text, outline: "none", fontFamily: "inherit", transition: "all 0.2s", boxSizing: "border-box" as const, boxShadow: focused ? "0 0 0 3px rgba(34,211,238,0.10)" : "none" };
  return (
    <div>
      <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: C.tert, marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}{required && <span style={{ color: C.danger, marginLeft: 4 }}>*</span>}
      </label>
      {multiline ? (
        <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 4} style={{ ...base, resize: "vertical" }} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      ) : (
        <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={base} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      )}
    </div>
  );
}

export default function ProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<UserProfile>({
    name: "", background: "", targetRole: "Software Engineer",
    targetCompany: "Google", experience: "", skills: "", country: "",
  });
  const [interviewType, setInterviewType] = useState("mixed");
  const [roundType, setRoundType] = useState("General Prep");
  const [yearsExperience, setYearsExperience] = useState("0-2");
  const [jobDescription, setJobDescription] = useState("");
  const [customCompany, setCustomCompany] = useState("");
  const [saved, setSaved] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [autoFillLoading, setAutoFillLoading] = useState(false);

  useEffect(() => {
    if (!loading && !user) { router.push("/login"); return; }

    const fetchFullUser = async () => {
      try {
        const res = await fetch("/api/auth/me");
        if (res.ok) {
          const data = await res.json();
          const u = data.user;
          if (u) {
            setProfile({
              name: u.name || "",
              background: u.background || "",
              targetRole: u.target_role || "Software Engineer",
              targetCompany: u.target_company || "Google",
              experience: u.experience || "",
              skills: u.skills || "",
              country: u.country || "",
            });
            if (u.target_company && !COMPANY_PRESETS.includes(u.target_company)) {
              setProfile(prev => ({ ...prev, targetCompany: "Other" }));
              setCustomCompany(u.target_company);
            }
          }
        }
      } catch {
        const p = getProfile();
        if (p.userProfile.name) {
          setProfile(p.userProfile);
        } else if (user) {
          setProfile(prev => ({ ...prev, name: user.name || prev.name }));
        }
      }
    };
    fetchFullUser();

    const config = localStorage.getItem("interview_session_config");
    if (config) {
      try {
        const parsed = JSON.parse(config);
        if (parsed.interviewType) setInterviewType(parsed.interviewType);
        if (parsed.roundType) setRoundType(parsed.roundType);
        if (parsed.jobDescription) setJobDescription(parsed.jobDescription);
      } catch { /* ignore */ }
    }
  }, [user, loading, router]);

  const autoFillFromJD = useCallback(async () => {
    if (!jobDescription.trim()) return;
    setAutoFillLoading(true);
    try {
      const res = await fetch("/api/parse-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });
      const result = await res.json();
      if (result.profile) {
        const p = result.profile;
        setProfile(prev => ({
          ...prev,
          targetCompany: p.targetCompany || prev.targetCompany,
          targetRole: p.targetRole || prev.targetRole,
          skills: p.keySkills || p.skills || prev.skills,
        }));
        if (p.yearsExperience) setYearsExperience(p.yearsExperience);
      }
    } catch (e) { console.error(e); } finally { setAutoFillLoading(false); }
  }, [jobDescription]);

  const saveAndGenerate = useCallback(async () => {
    const company = profile.targetCompany === "Other" ? customCompany || "General" : profile.targetCompany;
    const updatedProfile = { ...profile, targetCompany: company };

    saveUserProfile(updatedProfile);

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
        localStorage.setItem("interview_session_config", JSON.stringify({
          companyName: company,
          interviewType,
          roundType,
          jobDescription,
          country: updatedProfile.country,
          generatedQuestions: data.questions || [],
        }));
      }
    } catch (err) {
      console.error("Question generation error:", err);
    }
    setGeneratingQuestions(false);
    setSaved(true);
    setTimeout(() => router.push("/"), 1200);
  }, [profile, customCompany, jobDescription, interviewType, roundType, yearsExperience, user, router]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ width: 40, height: 40, border: "3px solid rgba(255,255,255,0.07)", borderTopColor: C.cyan, borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif", position: "relative" }}>
      {/* Glow */}
      <div style={{ position: "fixed", top: -200, left: "50%", transform: "translateX(-50%)", width: 800, height: 800, borderRadius: "50%", background: "radial-gradient(ellipse, rgba(34,211,238,0.07) 0%, rgba(129,140,248,0.04) 45%, transparent 70%)", pointerEvents: "none", zIndex: 0 }} />

      {/* Nav */}
      <nav style={{ position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 48px", background: "var(--nav-bg)", borderBottom: "1px solid var(--border)", backdropFilter: "blur(16px)" }}>
        <button onClick={() => router.push("/")} style={{ background: "none", border: "none", color: C.sec, fontSize: 14, cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          ← Back to Dashboard
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "linear-gradient(135deg, #22d3ee, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 3a4 4 0 100 8 4 4 0 000-8z" /></svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 700, color: "var(--heading)", letterSpacing: "-0.01em" }}>Profile & Settings</span>
        </div>
        <span style={{ fontSize: 13, color: C.tert }}>{user?.name}</span>
      </nav>

      <div style={{ maxWidth: 780, margin: "0 auto", padding: "40px 32px 100px", position: "relative", zIndex: 1 }}>

        {/* Personal Info */}
        <div style={{ ...card, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.cyan, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 20 }}>Personal Info</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Name" value={profile.name} onChange={v => setProfile(p => ({ ...p, name: v }))} placeholder="Your name" required />
              <Field label="Country" value={profile.country || ""} onChange={v => setProfile(p => ({ ...p, country: v }))} placeholder="e.g., United States, India" />
            </div>
            <Field label="Background" value={profile.background} onChange={v => setProfile(p => ({ ...p, background: v }))} placeholder="Brief career summary..." multiline rows={2} />
            <Field label="Experience" value={profile.experience} onChange={v => setProfile(p => ({ ...p, experience: v }))} placeholder="Work history, key projects, achievements with metrics..." multiline rows={3} />
            <Field label="Skills" value={profile.skills} onChange={v => setProfile(p => ({ ...p, skills: v }))} placeholder="React, Node.js, Python, AWS, System Design..." />
          </div>
        </div>

        {/* Target Company */}
        <div style={{ ...card, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>Target Company</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: profile.targetCompany === "Other" ? 14 : 0 }}>
            {COMPANY_PRESETS.map(c => {
              const sel = c === "Other" ? profile.targetCompany === "Other" : profile.targetCompany === c;
              return (
                <button key={c} onClick={() => { setProfile(p => ({ ...p, targetCompany: c })); if (c !== "Other") setCustomCompany(""); }}
                  style={{ padding: "10px 20px", borderRadius: 999, fontSize: 14, fontWeight: 600, border: `1px solid ${sel ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.10)"}`, background: sel ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.04)", color: sel ? C.cyan : C.sec, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {c}
                </button>
              );
            })}
          </div>
          {profile.targetCompany === "Other" && (
            <input type="text" value={customCompany} onChange={e => setCustomCompany(e.target.value)} placeholder="Enter company name" autoFocus
              style={{ width: "100%", background: "var(--input-bg)", border: "1px solid rgba(34,211,238,0.35)", borderRadius: 12, padding: "14px 16px", fontSize: 15, color: C.text, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          )}
        </div>

        {/* Target Role */}
        <div style={{ ...card, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>Target Role</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ROLE_OPTIONS.map(role => {
              const sel = profile.targetRole === role;
              return (
                <button key={role} onClick={() => setProfile(p => ({ ...p, targetRole: role }))}
                  style={{ padding: "8px 16px", borderRadius: 999, fontSize: 13, fontWeight: 600, border: `1px solid ${sel ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.10)"}`, background: sel ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.04)", color: sel ? C.cyan : C.sec, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {role}
                </button>
              );
            })}
          </div>
        </div>

        {/* Experience Level */}
        <div style={{ ...card, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>Experience Level</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10 }}>
            {EXP_OPTIONS.map(e => {
              const sel = yearsExperience === e.v;
              return (
                <button key={e.v} onClick={() => setYearsExperience(e.v)} style={{ padding: "16px 12px", borderRadius: 14, border: `1px solid ${sel ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(129,140,248,0.10)" : "rgba(255,255,255,0.03)", cursor: "pointer", fontFamily: "inherit", textAlign: "center", transition: "all 0.15s" }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: sel ? C.violet : "white", marginBottom: 4 }}>{e.l}</div>
                  <div style={{ fontSize: 12, color: C.tert }}>{e.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interview Type */}
        <div style={{ ...card, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>Interview Type</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            {INTERVIEW_TYPES.map(t => {
              const sel = interviewType === t.id;
              return (
                <button key={t.id} onClick={() => setInterviewType(t.id)} style={{ padding: "22px 20px", borderRadius: 16, border: `1px solid ${sel ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(34,211,238,0.08)" : "rgba(17,25,45,0.85)", cursor: "pointer", fontFamily: "inherit", textAlign: "left", transition: "all 0.18s", position: "relative" }}>
                  {t.badge && <span style={{ position: "absolute", top: 12, right: 12, padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, background: "rgba(34,211,238,0.15)", color: C.cyan }}>{t.badge}</span>}
                  <div style={{ fontSize: 28, marginBottom: 10 }}>{t.icon}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "var(--heading)", marginBottom: 4 }}>{t.label}</div>
                  <div style={{ fontSize: 13, color: C.sec, lineHeight: 1.5 }}>{t.desc}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Round Type */}
        <div style={{ ...card, padding: "28px 32px", marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.tert, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 14 }}>Interview Round</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {ROUND_TYPES.map(r => {
              const sel = roundType === r;
              return (
                <button key={r} onClick={() => setRoundType(r)} style={{ padding: "9px 18px", borderRadius: 999, fontSize: 13, fontWeight: 600, border: `1px solid ${sel ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.10)"}`, background: sel ? "rgba(251,191,36,0.10)" : "rgba(255,255,255,0.04)", color: sel ? C.warning : C.sec, cursor: "pointer", fontFamily: "inherit", transition: "all 0.15s" }}>
                  {r}
                </button>
              );
            })}
          </div>
        </div>

        {/* Job Description */}
        <div style={{ ...card, padding: "28px 32px", marginBottom: 20 }}>
          <Field label="Job Description" value={jobDescription} onChange={v => setJobDescription(v)} placeholder="Paste the full job description for tailored questions..." multiline rows={5} required />
          {jobDescription.trim() && (
            <button onClick={autoFillFromJD} disabled={autoFillLoading} style={{ marginTop: 14, width: "100%", padding: "14px", borderRadius: 12, background: autoFillLoading ? "rgba(34,211,238,0.3)" : "linear-gradient(135deg, #22d3ee, #818cf8)", color: "white", fontSize: 15, fontWeight: 700, border: "none", cursor: autoFillLoading ? "not-allowed" : "pointer", fontFamily: "inherit", opacity: autoFillLoading ? 0.7 : 1 }}>
              {autoFillLoading ? "Analysing JD..." : "✦ Auto-Fill from Job Description"}
            </button>
          )}
        </div>

        {/* Save Button */}
        <button onClick={saveAndGenerate} disabled={generatingQuestions || !profile.name}
          style={{
            width: "100%", padding: "18px", borderRadius: 16, border: "none", fontSize: 17, fontWeight: 700, cursor: generatingQuestions ? "not-allowed" : "pointer", fontFamily: "inherit", transition: "all 0.2s",
            background: generatingQuestions ? "rgba(34,211,238,0.3)" : saved ? "linear-gradient(135deg, #34d399, #22d3ee)" : "linear-gradient(135deg, #22d3ee, #818cf8)",
            color: "white",
            boxShadow: saved ? "0 8px 32px rgba(52,211,153,0.3)" : "0 8px 32px rgba(34,211,238,0.2)",
          }}>
          {generatingQuestions ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <span style={{ width: 18, height: 18, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
              Generating new questions...
            </span>
          ) : saved ? "Saved! Redirecting..." : "Save & Generate New Questions"}
        </button>

        <p style={{ fontSize: 13, color: C.tert, textAlign: "center", marginTop: 16 }}>
          Saving will generate new interview questions tailored to your updated company and role.
        </p>
      </div>
      <style>{`input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.22)}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
