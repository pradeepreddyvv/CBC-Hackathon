"use client";
import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";
import AppNav from "@/components/AppNav";
import { saveUserProfile, getProfile } from "@/lib/store";

const C = { cyan: "#22d3ee", violet: "#818cf8", success: "#34d399", warning: "#fbbf24", danger: "#f87171", text: "var(--text)", sec: "var(--text-sec)", tert: "var(--text-tert)" };
const card = { background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 20 };

const ROLE_OPTIONS = ["Software Engineer","Frontend Engineer","Backend Engineer","Full Stack","ML/AI Engineer","Data Scientist","DevOps/SRE","Mobile Developer","Product Manager","Data Engineer","Security Engineer","QA Engineer"];
const INTERVIEW_TYPES = [
  { id: "behavioral", label: "Behavioral", desc: "STAR stories, leadership, conflict resolution", icon: "💬" },
  { id: "technical", label: "Technical", desc: "Coding, algorithms, system knowledge", icon: "💻" },
  { id: "system_design", label: "System Design", desc: "Architecture, scalability, trade-offs", icon: "🏗️" },
  { id: "mixed", label: "Mixed", badge: "Recommended", desc: "All types — most realistic prep", icon: "🎯" },
];
const ROUND_TYPES = ["Phone Screen","Technical Round","System Design","Behavioral / Bar Raiser","Onsite Loop","Take-Home","Final Round","General Prep"];
const COMPANY_PRESETS = ["Google","Amazon","Meta","Microsoft","Apple","Netflix","Startup","Other"];
const EXP_OPTIONS = [{ v: "0-2", l: "0–2 yrs", sub: "New Grad" },{ v: "2-5", l: "2–5 yrs", sub: "Mid-Level" },{ v: "5-10", l: "5–10 yrs", sub: "Senior" },{ v: "10+", l: "10+ yrs", sub: "Staff+" }];

interface OnboardingData { name:string; country:string; resumeText:string; llmContext:string; targetRoles:string[]; background:string; experience:string; skills:string; interviewType:string; companyName:string; jobDescription:string; yearsExperience:string; roundType:string; targetSkills:string; researchResults:unknown; generatedQuestions:unknown[]; }

function Field({ label, value, onChange, placeholder, multiline, rows }: { label:string; value:string; onChange:(v:string)=>void; placeholder:string; multiline?:boolean; rows?:number }) {
  const [focused, setFocused] = useState(false);
  const base: React.CSSProperties = { width:"100%", background: focused ? "rgba(34,211,238,0.05)" : "rgba(255,255,255,0.04)", border: `1px solid ${focused ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.10)"}`, borderRadius:12, padding:"14px 16px", fontSize:15, color:C.text, outline:"none", fontFamily:"inherit", transition:"all 0.2s", boxSizing:"border-box" as const, boxShadow: focused ? "0 0 0 3px rgba(34,211,238,0.10)" : "none" };
  return (
    <div>
      <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.tert, marginBottom:8, letterSpacing:"0.05em", textTransform:"uppercase" }}>{label}</label>
      {multiline ? (
        <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} rows={rows||4} style={{ ...base, resize:"vertical" }} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} />
      ) : (
        <input type="text" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={base} onFocus={()=>setFocused(true)} onBlur={()=>setFocused(false)} />
      )}
    </div>
  );
}

export default function OnboardingPage() {
  const { user, refreshUser, logout } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<OnboardingData>({ name:user?.name||"", country:"", resumeText:"", llmContext:"", targetRoles:[], background:"", experience:"", skills:"", interviewType:"mixed", companyName:"Google", jobDescription:"", yearsExperience:"0-2", roundType:"General Prep", targetSkills:"", researchResults:null, generatedQuestions:[] });
  const [isOtherCompany, setIsOtherCompany] = useState(false);
  const [autoFillJdLoading, setAutoFillJdLoading] = useState(false);
  const [prefilled, setPrefilled] = useState(false);
  const update = (fields: Partial<OnboardingData>) => setData(prev => ({ ...prev, ...fields }));
  const toggleRole = (role: string) => setData(prev => ({ ...prev, targetRoles: prev.targetRoles.includes(role) ? prev.targetRoles.filter(r=>r!==role) : [...prev.targetRoles, role] }));

  // Pre-fill from DB + localStorage on mount (resume parsing data, previous onboarding data)
  useEffect(() => {
    if (prefilled) return;
    // 1. Load from localStorage profile
    const localProfile = getProfile();
    const lp = localProfile.userProfile;
    if (lp?.name) {
      setData(prev => ({
        ...prev,
        name: lp.name || prev.name,
        background: lp.background || prev.background,
        experience: lp.experience || prev.experience,
        skills: lp.skills || prev.skills,
        country: lp.country || prev.country,
        companyName: lp.targetCompany || prev.companyName,
        targetRoles: lp.targetRole ? [lp.targetRole] : prev.targetRoles,
      }));
      if (lp.targetCompany && !COMPANY_PRESETS.includes(lp.targetCompany)) {
        setIsOtherCompany(true);
      }
    }
    // 2. Load session config
    try {
      const cfg = JSON.parse(localStorage.getItem("interview_session_config") || "{}");
      if (cfg.interviewType) setData(prev => ({ ...prev, interviewType: cfg.interviewType }));
      if (cfg.roundType) setData(prev => ({ ...prev, roundType: cfg.roundType }));
      if (cfg.jobDescription) setData(prev => ({ ...prev, jobDescription: cfg.jobDescription }));
      if (cfg.country) setData(prev => ({ ...prev, country: prev.country || cfg.country }));
    } catch { /* ignore */ }

    // 3. Fetch from DB (most authoritative)
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(resp => {
      if (!resp?.user) return;
      const u = resp.user;
      setData(prev => ({
        ...prev,
        name: u.name || prev.name,
        background: u.background || prev.background,
        experience: u.experience || prev.experience,
        skills: u.skills || prev.skills,
        country: u.country || prev.country,
        companyName: u.target_company || prev.companyName,
        targetRoles: u.target_roles?.length ? u.target_roles : (u.target_role ? [u.target_role] : prev.targetRoles),
        interviewType: u.interview_type || prev.interviewType,
        resumeText: u.resume_text || prev.resumeText,
        llmContext: u.llm_context || prev.llmContext,
      }));
      if (u.target_company && !COMPANY_PRESETS.includes(u.target_company)) {
        setIsOtherCompany(true);
      }
      setPrefilled(true);
    }).catch(() => { setPrefilled(true); });
  }, [prefilled]);

  const autoFill = useCallback(async () => {
    if (!data.resumeText && !data.llmContext) return;
    setLoading(true);
    try {
      const res = await fetch("/api/parse-profile", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ resume:data.resumeText, context:data.llmContext }) });
      const result = await res.json();
      if (result.profile) { const p = result.profile; update({ name:p.name||data.name, background:p.background||data.background, experience:p.experience||data.experience, skills:p.skills||data.skills }); }
    } catch(e) { console.error(e); } finally { setLoading(false); }
  }, [data.resumeText, data.llmContext, data.name, data.background, data.experience, data.skills]);

  const autoFillFromJD = useCallback(async () => {
    if (!data.jobDescription.trim()) return;
    setAutoFillJdLoading(true);
    try {
      const res = await fetch("/api/parse-profile", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ jobDescription:data.jobDescription }) });
      const result = await res.json();
      if (result.profile) {
        const p = result.profile;
        const fields: Partial<OnboardingData> = {};
        if (p.targetCompany && p.targetCompany !== "General") {
          const preset = COMPANY_PRESETS.find(c => c.toLowerCase() === p.targetCompany.toLowerCase());
          if (preset) { fields.companyName = preset; setIsOtherCompany(false); }
          else { fields.companyName = p.targetCompany; setIsOtherCompany(true); }
        }
        if (p.yearsExperience) {
          const yoe = p.yearsExperience;
          if (yoe <= 2) fields.yearsExperience = "0-2";
          else if (yoe <= 5) fields.yearsExperience = "2-5";
          else if (yoe <= 10) fields.yearsExperience = "5-10";
          else fields.yearsExperience = "10+";
        }
        if (p.roundType) {
          const matchedRound = ROUND_TYPES.find(r => r.toLowerCase().includes(p.roundType.toLowerCase()));
          if (matchedRound) fields.roundType = matchedRound;
        }
        if (p.keySkills) {
          fields.targetSkills = typeof p.keySkills === "string" ? p.keySkills : (p.keySkills as string[]).join(", ");
        }
        if (p.targetRole) {
          const matchedRole = ROLE_OPTIONS.find(r => r.toLowerCase().includes(p.targetRole.toLowerCase()));
          if (matchedRole && !data.targetRoles.includes(matchedRole)) {
            fields.targetRoles = [...data.targetRoles, matchedRole];
          }
        }
        update(fields);
      }
    } catch(e) { console.error("Auto-fill from JD error:", e); } finally { setAutoFillJdLoading(false); }
  }, [data.jobDescription, data.targetRoles]);

  // Fire-and-forget: run research in background and save results to localStorage when done
  const runResearchInBackground = useCallback(() => {
    fetch("/api/research", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ company:data.companyName, role:data.targetRoles[0]||"Software Engineer", interviewType:data.interviewType, roundType:data.roundType, skills:data.targetSkills||data.skills, yearsExperience:data.yearsExperience, country:data.country }) })
      .then(res => res.json())
      .then(result => {
        if (result.research) {
          // Update localStorage with research results so the home page can use them
          try {
            const config = JSON.parse(localStorage.getItem("interview_session_config") || "{}");
            config.researchResults = result.research;
            localStorage.setItem("interview_session_config", JSON.stringify(config));
          } catch { /* ignore */ }
        }
      })
      .catch(e => console.error("Background research error:", e));
  }, [data]);

  const finishOnboarding = async () => {
    setLoading(true);
    try {
      await fetch("/api/auth/profile", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ name:data.name, background:data.background, target_role:data.targetRoles[0]||"Software Engineer", target_company:data.companyName, experience:data.experience, skills:data.skills, resume_text:data.resumeText, llm_context:data.llmContext, target_roles:data.targetRoles, interview_type:data.interviewType, country:data.country, onboarded:true }) });
      // Also save to localStorage so profile page and home page can load it immediately
      saveUserProfile({ name:data.name, background:data.background, targetRole:data.targetRoles[0]||"Software Engineer", targetCompany:data.companyName, experience:data.experience, skills:data.skills, country:data.country });
      await refreshUser();
      // Save session config (research will be populated in background)
      localStorage.setItem("interview_session_config", JSON.stringify({ companyName:data.companyName, interviewType:data.interviewType, roundType:data.roundType, jobDescription:data.jobDescription, generatedQuestions:[], researchResults:null, country:data.country }));
      // Fire off research in background — results saved to localStorage when ready
      runResearchInBackground();
      router.push("/");
    } catch(e) { console.error(e); } finally { setLoading(false); }
  };

  const totalSteps = 3;
  const STEPS = [
    { label: "Profile", desc: "Your background & resume" },
    { label: "Interview Type", desc: "Behavioral, technical, mixed" },
    { label: "Company & Role", desc: "Target company & round" },
  ];
  return (
    <div style={{ minHeight:"100vh", background:"var(--bg)", fontFamily:"-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', sans-serif", position:"relative" }}>
      {/* Glow */}
      <div style={{ position:"fixed", top:-200, left:"50%", transform:"translateX(-50%)", width:800, height:800, borderRadius:"50%", background:"radial-gradient(ellipse, rgba(34,211,238,0.07) 0%, rgba(129,140,248,0.04) 45%, transparent 70%)", pointerEvents:"none", zIndex:0 }} />

      <AppNav
        user={user}
        showSetup={false}
        onTabChange={() => router.push("/")}
        onSignOut={() => { logout(); router.push("/login"); }}
      />

      {/* Two-column layout */}
      <div style={{ maxWidth:1400, margin:"0 auto", padding:"40px 32px 100px 48px", display:"grid", gridTemplateColumns:"280px 1fr", gap:36, position:"relative", zIndex:1 }}>

        {/* LEFT: Step sidebar */}
        <div style={{ height:"fit-content", position:"sticky", top:104 }}>
          <div style={{ ...card, padding:"28px 22px" }}>
            <div style={{ fontSize:12, fontWeight:700, color:C.tert, letterSpacing:"0.08em", textTransform:"uppercase", marginBottom:22 }}>Setup Progress</div>
            {STEPS.map((s, i) => {
              const n = i+1;
              const done = n < step;
              const active = n === step;
              return (
                <div key={s.label}>
                  <button onClick={()=>{ if(n <= step) setStep(n); }}
                    style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 14px", borderRadius:12, background:active?"rgba(34,211,238,0.08)":"transparent", border:`1px solid ${active?"rgba(34,211,238,0.2)":"transparent"}`, cursor:n<=step?"pointer":"default", width:"100%", textAlign:"left", fontFamily:"inherit", transition:"all 0.15s" }}>
                    <div style={{ width:32, height:32, borderRadius:"50%", background:active?C.cyan:done?C.success:"rgba(255,255,255,0.08)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:active||done?"#050a14":C.tert, flexShrink:0 }}>
                      {done ? "✓" : n}
                    </div>
                    <div>
                      <div style={{ fontSize:15, fontWeight:600, color:active?C.cyan:done?C.success:C.sec, lineHeight:1.2 }}>{s.label}</div>
                      <div style={{ fontSize:12, color:C.tert, marginTop:3 }}>{s.desc}</div>
                    </div>
                  </button>
                  {i < STEPS.length-1 && <div style={{ width:1, height:16, background:done?"rgba(52,211,153,0.25)":"rgba(255,255,255,0.06)", marginLeft:30, marginTop:2, marginBottom:2 }} />}
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT: Step content */}
        <main style={{ minWidth:0 }}>

        {/* ── STEP 1: Profile ── */}
        {step === 1 && (
          <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
            <div style={{ marginBottom:4 }}>
              <h2 style={{ fontSize:30, fontWeight:800, color:"var(--heading)", letterSpacing:"-0.03em", margin:"0 0 8px" }}>Your Profile</h2>
              <p style={{ fontSize:16, color:C.sec, margin:0 }}>Tell us about yourself so we can personalise your practice sessions.</p>
            </div>

            {/* Resume quick-fill */}
            <div style={{ ...card, padding:"28px 32px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.cyan, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:20 }}>Quick Fill from Resume</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:16 }}>
                {/* Upload */}
                <label style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:10, padding:"28px 20px", background:"var(--surface)", border:"2px dashed var(--border-hi)", borderRadius:14, cursor:"pointer", transition:"all 0.2s" }}
                  onMouseEnter={e=>{e.currentTarget.style.borderColor="rgba(34,211,238,0.4)"; e.currentTarget.style.background="rgba(34,211,238,0.04)";}}
                  onMouseLeave={e=>{e.currentTarget.style.borderColor="rgba(255,255,255,0.12)"; e.currentTarget.style.background="rgba(255,255,255,0.03)";}}>
                  <input type="file" accept=".pdf,.docx,.txt,.md" style={{ display:"none" }} onChange={async (e) => {
                    const file = e.target.files?.[0]; if (!file) return; setLoading(true);
                    try { const fd = new FormData(); fd.append("file", file); const res = await fetch("/api/parse-resume",{method:"POST",body:fd}); const r = await res.json(); if(r.text) update({resumeText:r.text}); else alert("Could not extract text. Try pasting instead."); }
                    catch { alert("Failed to parse resume."); } finally { setLoading(false); }
                  }} />
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={data.resumeText ? C.success : C.tert} strokeWidth="1.8" strokeLinecap="round"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:14, fontWeight:600, color: data.resumeText ? C.success : "white" }}>{loading ? "Parsing..." : data.resumeText ? "Resume loaded ✓" : "Upload Resume"}</div>
                    <div style={{ fontSize:12, color:C.tert, marginTop:3 }}>PDF, DOCX, or TXT</div>
                  </div>
                </label>

                {/* Paste */}
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <label style={{ fontSize:12, fontWeight:600, color:C.tert, letterSpacing:"0.05em", textTransform:"uppercase" }}>Or Paste Resume</label>
                  <textarea value={data.resumeText} onChange={e=>update({resumeText:e.target.value})} placeholder="Paste your resume text here..." rows={5}
                    style={{ flex:1, background:"var(--input-bg)", border:"1px solid var(--input-border)", borderRadius:12, padding:"12px 14px", fontSize:13, color:C.text, outline:"none", fontFamily:"inherit", resize:"none" }} />
                </div>
              </div>

              {/* LLM context */}
              <div style={{ marginBottom:16 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.tert, marginBottom:8, letterSpacing:"0.05em", textTransform:"uppercase" }}>AI-Generated Context (Optional)</label>
                <textarea value={data.llmContext} onChange={e=>update({llmContext:e.target.value})} placeholder="Paste output from ChatGPT / Claude summarising your background..." rows={3}
                  style={{ width:"100%", background:"var(--input-bg)", border:"1px solid var(--input-border)", borderRadius:12, padding:"12px 14px", fontSize:13, color:C.text, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" }} />
              </div>

              {(data.resumeText || data.llmContext) && (
                <button onClick={autoFill} disabled={loading} style={{ width:"100%", padding:"14px", borderRadius:12, background:"linear-gradient(135deg, #22d3ee, #818cf8)", color:"white", fontSize:15, fontWeight:700, border:"none", cursor:loading?"not-allowed":"pointer", fontFamily:"inherit", opacity:loading?0.7:1 }}>
                  {loading ? "Analysing..." : "✦ Auto-Fill from Resume"}
                </button>
              )}
            </div>

            {/* Manual fields */}
            <div style={{ ...card, padding:"28px 32px", display:"flex", flexDirection:"column", gap:18 }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.cyan, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:4 }}>Your Details</div>
              <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  <Field label="Name" value={data.name} onChange={v=>update({name:v})} placeholder="Your name" />
                  <Field label="Country" value={data.country} onChange={v=>update({country:v})} placeholder="e.g., United States, India" />
                </div>
                <Field label="Background" value={data.background} onChange={v=>update({background:v})} placeholder="e.g., CS student, 3 years backend engineer" />
                <Field label="Experience" value={data.experience} onChange={v=>update({experience:v})} placeholder="Key projects, achievements with metrics..." multiline rows={3} />
                <Field label="Skills" value={data.skills} onChange={v=>update({skills:v})} placeholder="Python, React, AWS, System Design..." />

                {/* Target Roles */}
                <div>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.tert, marginBottom:10, letterSpacing:"0.05em", textTransform:"uppercase" }}>Target Roles</label>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {ROLE_OPTIONS.map(role => {
                      const sel = data.targetRoles.includes(role);
                      return (
                        <button key={role} onClick={()=>toggleRole(role)} style={{ padding:"8px 16px", borderRadius:999, fontSize:13, fontWeight:600, border:`1px solid ${sel ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.10)"}`, background: sel ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.04)", color: sel ? C.cyan : C.sec, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                          {role}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Interview Type ── */}
        {step === 2 && (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <div>
              <h2 style={{ fontSize:30, fontWeight:800, color:"var(--heading)", letterSpacing:"-0.03em", margin:"0 0 8px" }}>Interview Type</h2>
              <p style={{ fontSize:16, color:C.sec, margin:0 }}>What type of interview are you preparing for?</p>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
              {INTERVIEW_TYPES.map(t => {
                const sel = data.interviewType === t.id;
                return (
                  <button key={t.id} onClick={()=>update({interviewType:t.id})} style={{ padding:"28px 24px", borderRadius:20, border:`1px solid ${sel ? "rgba(34,211,238,0.35)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(34,211,238,0.08)" : "rgba(17,25,45,0.85)", cursor:"pointer", fontFamily:"inherit", textAlign:"left", transition:"all 0.18s", position:"relative" }}>
                    {t.badge && <span style={{ position:"absolute", top:16, right:16, padding:"3px 10px", borderRadius:999, fontSize:10, fontWeight:700, background:"rgba(34,211,238,0.15)", color:C.cyan, letterSpacing:"0.04em" }}>{t.badge}</span>}
                    <div style={{ fontSize:36, marginBottom:14 }}>{t.icon}</div>
                    <div style={{ fontSize:17, fontWeight:700, color:"var(--heading)", marginBottom:6 }}>{t.label}</div>
                    <div style={{ fontSize:14, color:C.sec, lineHeight:1.5 }}>{t.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── STEP 3: Company & Role ── */}
        {step === 3 && (
          <div style={{ display:"flex", flexDirection:"column", gap:24 }}>
            <div>
              <h2 style={{ fontSize:30, fontWeight:800, color:"var(--heading)", letterSpacing:"-0.03em", margin:"0 0 8px" }}>Company & Role</h2>
              <p style={{ fontSize:16, color:C.sec, margin:0 }}>Tell us about the specific role you&apos;re targeting.</p>
            </div>

            {/* Company */}
            <div style={{ ...card, padding:"28px 32px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14 }}>Target Company</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom: isOtherCompany ? 14 : 0 }}>
                {COMPANY_PRESETS.map(c => {
                  const sel = c === "Other" ? isOtherCompany : (!isOtherCompany && data.companyName === c);
                  return (
                    <button key={c} onClick={()=>{ if(c==="Other"){setIsOtherCompany(true);update({companyName:""});}else{setIsOtherCompany(false);update({companyName:c});}}}
                      style={{ padding:"10px 20px", borderRadius:999, fontSize:14, fontWeight:600, border:`1px solid ${sel ? "rgba(34,211,238,0.4)" : "rgba(255,255,255,0.10)"}`, background: sel ? "rgba(34,211,238,0.12)" : "rgba(255,255,255,0.04)", color: sel ? C.cyan : C.sec, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                      {c}
                    </button>
                  );
                })}
              </div>
              {isOtherCompany && (
                <input type="text" value={data.companyName} onChange={e=>update({companyName:e.target.value})} placeholder="Enter company name" autoFocus
                  style={{ width:"100%", background:"var(--input-bg)", border:"1px solid rgba(34,211,238,0.35)", borderRadius:12, padding:"14px 16px", fontSize:15, color:C.text, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
              )}
            </div>

            {/* Experience level */}
            <div style={{ ...card, padding:"28px 32px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:16 }}>Experience Level</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10 }}>
                {EXP_OPTIONS.map(e => {
                  const sel = data.yearsExperience === e.v;
                  return (
                    <button key={e.v} onClick={()=>update({yearsExperience:e.v})} style={{ padding:"16px 12px", borderRadius:14, border:`1px solid ${sel ? "rgba(129,140,248,0.4)" : "rgba(255,255,255,0.08)"}`, background: sel ? "rgba(129,140,248,0.10)" : "rgba(255,255,255,0.03)", cursor:"pointer", fontFamily:"inherit", textAlign:"center", transition:"all 0.15s" }}>
                      <div style={{ fontSize:16, fontWeight:700, color: sel ? C.violet : "white", marginBottom:4 }}>{e.l}</div>
                      <div style={{ fontSize:12, color:C.tert }}>{e.sub}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Round type */}
            <div style={{ ...card, padding:"28px 32px" }}>
              <div style={{ fontSize:13, fontWeight:700, color:C.tert, textTransform:"uppercase", letterSpacing:"0.07em", marginBottom:14 }}>Interview Round</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {ROUND_TYPES.map(r => {
                  const sel = data.roundType === r;
                  return (
                    <button key={r} onClick={()=>update({roundType:r})} style={{ padding:"9px 18px", borderRadius:999, fontSize:13, fontWeight:600, border:`1px solid ${sel ? "rgba(251,191,36,0.4)" : "rgba(255,255,255,0.10)"}`, background: sel ? "rgba(251,191,36,0.10)" : "rgba(255,255,255,0.04)", color: sel ? C.warning : C.sec, cursor:"pointer", fontFamily:"inherit", transition:"all 0.15s" }}>
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* JD (Required) */}
            <div style={{ ...card, padding:"28px 32px", display:"flex", flexDirection:"column", gap:18 }}>
              <div>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:C.tert, marginBottom:8, letterSpacing:"0.05em", textTransform:"uppercase" }}>
                  Job Description <span style={{ color:C.danger }}>*</span>
                </label>
                <textarea value={data.jobDescription} onChange={e=>update({jobDescription:e.target.value})} placeholder="Paste the full job description here — we'll auto-fill company, skills, experience level, and more..." rows={6}
                  style={{ width:"100%", background:"rgba(255,255,255,0.04)", border:`1px solid ${!data.jobDescription.trim() ? "rgba(248,113,113,0.4)" : "rgba(255,255,255,0.10)"}`, borderRadius:12, padding:"14px 16px", fontSize:15, color:C.text, outline:"none", fontFamily:"inherit", resize:"vertical", boxSizing:"border-box" as const }} />
                {!data.jobDescription.trim() && (
                  <p style={{ fontSize:12, color:C.danger, marginTop:6 }}>Job description is required for personalized questions.</p>
                )}
              </div>
              {data.jobDescription.trim() && (
                <button onClick={autoFillFromJD} disabled={autoFillJdLoading}
                  style={{ width:"100%", padding:"14px", borderRadius:12, background:"linear-gradient(135deg, #22d3ee, #818cf8)", color:"white", fontSize:15, fontWeight:700, border:"none", cursor:autoFillJdLoading?"not-allowed":"pointer", fontFamily:"inherit", opacity:autoFillJdLoading?0.7:1, display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                  {autoFillJdLoading ? (
                    <><div style={{ width:16, height:16, border:"2px solid white", borderTopColor:"transparent", borderRadius:"50%", animation:"spin 0.7s linear infinite" }} />Analysing JD with AI...</>
                  ) : (
                    <>⚡ Auto-Fill from Job Description</>
                  )}
                </button>
              )}
            </div>

            {/* Skills */}
            <div style={{ ...card, padding:"28px 32px", display:"flex", flexDirection:"column", gap:18 }}>
              <Field label="Key Skills for This Role" value={data.targetSkills} onChange={v=>update({targetSkills:v})} placeholder="e.g., React, Node.js, distributed systems, leadership" />
            </div>
          </div>
        )}

        {/* Navigation */}
        <div style={{ display:"flex", justifyContent:"space-between", marginTop:40 }}>
          <button onClick={()=>setStep(s=>Math.max(1,s-1))} disabled={step===1}
            style={{ padding:"14px 28px", borderRadius:14, background:"rgba(255,255,255,0.05)", border:"1px solid rgba(255,255,255,0.10)", color:step===1?"rgba(255,255,255,0.2)":C.sec, fontSize:15, fontWeight:600, cursor:step===1?"not-allowed":"pointer", fontFamily:"inherit" }}>
            ← Back
          </button>
          {step < totalSteps ? (
            <button onClick={()=>setStep(s=>s+1)} disabled={(step===1&&!data.name)}
              style={{ padding:"14px 32px", borderRadius:14, background: (step===1&&!data.name)?"rgba(34,211,238,0.3)":"linear-gradient(135deg, #22d3ee, #818cf8)", color:"white", fontSize:15, fontWeight:700, border:"none", cursor:(step===1&&!data.name)?"not-allowed":"pointer", fontFamily:"inherit" }}>
              Continue →
            </button>
          ) : (
            <button onClick={finishOnboarding} disabled={loading||!data.jobDescription.trim()}
              style={{ padding:"14px 32px", borderRadius:14, background: (!data.jobDescription.trim())?"rgba(34,211,238,0.3)":"linear-gradient(135deg, #22d3ee, #818cf8)", color:"white", fontSize:15, fontWeight:700, border:"none", cursor:(loading||!data.jobDescription.trim())?"not-allowed":"pointer", fontFamily:"inherit", opacity:loading?0.7:1 }}>
              {loading ? "Saving..." : "Start Practising →"}
            </button>
          )}
        </div>
        </main>
      </div>
      <style>{`input::placeholder,textarea::placeholder{color:rgba(255,255,255,0.22)}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
