"use client";
import { useState, useEffect, useRef } from "react";

interface PomodoroTimerProps {
  durationMin?: number;
  onComplete?: () => void;
}

export default function PomodoroTimer({ durationMin = 5, onComplete }: PomodoroTimerProps) {
  const [remaining, setRemaining] = useState(durationMin * 60);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const total = durationMin * 60;
  const pct = ((total - remaining) / total) * 100;
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(r => {
          if (r <= 1) {
            setRunning(false);
            setCompleted(true);
            onComplete?.();
            return 0;
          }
          return r - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, remaining, onComplete]);

  const min = Math.floor(remaining / 60);
  const sec = remaining % 60;

  return (
    <div className="flex items-center gap-3 bg-surface border border-border rounded-lg px-3 py-2">
      <svg width="64" height="64" className="-rotate-90">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#2e3350" strokeWidth={3} />
        <circle
          cx="32" cy="32" r={radius} fill="none"
          stroke={completed ? "#22c55e" : "#ff6b6b"}
          strokeWidth={3} strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round" className="pomodoro-ring"
        />
      </svg>
      <div className="flex-1">
        <div className="text-lg font-bold tabular-nums" style={{ color: completed ? "#22c55e" : "#ff6b6b" }}>
          {completed ? "Done!" : `${min}:${sec.toString().padStart(2, "0")}`}
        </div>
        <div className="text-[10px] text-muted">
          {completed ? "Great focus session!" : running ? "Stay focused..." : "Focus timer"}
        </div>
      </div>
      {!completed && (
        <button
          onClick={() => {
            if (running) { setRunning(false); }
            else { setRunning(true); }
          }}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-card border border-border text-muted hover:text-white transition-colors"
        >
          {running ? "Pause" : "Start"}
        </button>
      )}
      {completed && (
        <button
          onClick={() => { setRemaining(total); setCompleted(false); }}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-green-900/50 text-green-400 hover:bg-green-900 transition-colors"
        >
          Reset
        </button>
      )}
    </div>
  );
}
