"use client";
import { useRouter } from "next/navigation";
import { useTheme } from "@/lib/theme-context";

const TABS = [
  { id: "practice", label: "Interview" },
  { id: "3d-interview", label: "3D Mock" },
  { id: "progress", label: "Progress" },
  { id: "history", label: "History" },
];

interface AppNavProps {
  user: { name?: string } | null;
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  showSetup?: boolean;
  onSignOut: () => void;
}

export default function AppNav({ user, activeTab, onTabChange, showSetup = true, onSignOut }: AppNavProps) {
  const router = useRouter();
  const { mode, toggle } = useTheme();
  const isLight = mode === "light";

  const handleTab = (id: string) => {
    if (onTabChange) onTabChange(id);
    else router.push("/");
  };

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 50, background: "var(--nav-bg)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid var(--border)", padding: "0 60px" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", height: 72, gap: 0 }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginRight: 48 }}>
          <div style={{ width: 36, height: 36, borderRadius: 11, background: "linear-gradient(135deg, #22d3ee, #818cf8)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <span style={{ fontSize: 17, fontWeight: 700, color: "var(--heading)", letterSpacing: "-0.02em" }}>InterviewCoach</span>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 6, flex: 1 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => handleTab(t.id)}
              style={{ padding: "10px 24px", borderRadius: 11, fontSize: 15, fontWeight: 500, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all 0.18s", background: activeTab === t.id ? "rgba(34,211,238,0.12)" : "transparent", color: activeTab === t.id ? "#22d3ee" : "var(--text-sec)", borderBottom: activeTab === t.id ? "1px solid rgba(34,211,238,0.35)" : "1px solid transparent" }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* User area */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* Theme toggle */}
          <button onClick={toggle} title={isLight ? "Switch to dark mode" : "Switch to light mode"}
            style={{ width: 36, height: 36, borderRadius: "50%", background: "var(--surface)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "all 0.2s" }}>
            {isLight ? (
              /* Moon icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-sec)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              /* Sun icon */
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-sec)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>

          <div style={{ width: 36, height: 36, borderRadius: "50%", background: "rgba(34,211,238,0.15)", border: "1px solid rgba(34,211,238,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#22d3ee" }}>
            {user?.name?.[0]?.toUpperCase() || "U"}
          </div>
          <span style={{ fontSize: 15, color: "var(--text-sec)" }}>{user?.name}</span>
          {showSetup && (
            <button onClick={() => router.push("/onboarding")} style={{ background: "none", border: "1px solid var(--border-hi)", borderRadius: 999, color: "var(--text-sec)", fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: "8px 18px" }}>Setup</button>
          )}
          <button onClick={onSignOut} style={{ background: "none", border: "1px solid rgba(248,113,113,0.25)", borderRadius: 999, color: "rgba(248,113,113,0.7)", fontSize: 14, cursor: "pointer", fontFamily: "inherit", padding: "8px 18px" }}>Sign out</button>
        </div>
      </div>
    </nav>
  );
}
