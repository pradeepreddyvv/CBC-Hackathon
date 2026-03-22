"use client";
import { createContext, useContext, useEffect, useState } from "react";

type Mode = "dark" | "light";
interface ThemeCtx { mode: Mode; toggle: () => void; }

const Ctx = createContext<ThemeCtx>({ mode: "dark", toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<Mode>("dark");

  useEffect(() => {
    const saved = (localStorage.getItem("theme") as Mode) || "dark";
    setMode(saved);
    document.documentElement.setAttribute("data-theme", saved);
  }, []);

  const toggle = () => {
    const next: Mode = mode === "dark" ? "light" : "dark";
    setMode(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return <Ctx.Provider value={{ mode, toggle }}>{children}</Ctx.Provider>;
}

export function useTheme() { return useContext(Ctx); }
