"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AccessibilityMode, LearningStyle, getProfile, saveUserProfile } from "@/lib/store";

interface AccessibilityContextType {
  mode: AccessibilityMode;
  learningStyle: LearningStyle;
  ttsEnabled: boolean;
  setMode: (mode: AccessibilityMode) => void;
  setLearningStyle: (style: LearningStyle) => void;
  setTtsEnabled: (enabled: boolean) => void;
  speak: (text: string) => void;
  stopSpeaking: () => void;
}

const AccessibilityContext = createContext<AccessibilityContextType>({
  mode: "default",
  learningStyle: "mixed",
  ttsEnabled: false,
  setMode: () => {},
  setLearningStyle: () => {},
  setTtsEnabled: () => {},
  speak: () => {},
  stopSpeaking: () => {},
});

export const useAccessibility = () => useContext(AccessibilityContext);

// CSS class maps for each mode
const MODE_CLASSES: Record<AccessibilityMode, string> = {
  default: "",
  adhd: "adhd-mode",
  dyslexia: "dyslexia-mode",
  focus: "focus-mode",
};

export default function AccessibilityProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<AccessibilityMode>("default");
  const [learningStyle, setLearningStyleState] = useState<LearningStyle>("mixed");
  const [ttsEnabled, setTtsEnabledState] = useState(false);

  useEffect(() => {
    const p = getProfile();
    if (p.userProfile.accessibilityMode) setModeState(p.userProfile.accessibilityMode);
    if (p.userProfile.learningStyle) setLearningStyleState(p.userProfile.learningStyle);
    if (p.userProfile.ttsEnabled) setTtsEnabledState(p.userProfile.ttsEnabled);
  }, []);

  const persist = (updates: Partial<{ accessibilityMode: AccessibilityMode; learningStyle: LearningStyle; ttsEnabled: boolean }>) => {
    const p = getProfile();
    saveUserProfile({ ...p.userProfile, ...updates });
  };

  const setMode = (m: AccessibilityMode) => {
    setModeState(m);
    persist({ accessibilityMode: m });
  };

  const setLearningStyle = (s: LearningStyle) => {
    setLearningStyleState(s);
    persist({ learningStyle: s });
  };

  const setTtsEnabled = (e: boolean) => {
    setTtsEnabledState(e);
    persist({ ttsEnabled: e });
    if (!e) window.speechSynthesis?.cancel();
  };

  const speak = (text: string) => {
    if (!ttsEnabled || typeof window === "undefined") return;
    window.speechSynthesis?.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = mode === "adhd" ? 1.1 : mode === "dyslexia" ? 0.85 : 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis?.speak(utterance);
  };

  const stopSpeaking = () => {
    window.speechSynthesis?.cancel();
  };

  useEffect(() => {
    // Apply mode class to body
    document.body.classList.remove("adhd-mode", "dyslexia-mode", "focus-mode");
    const cls = MODE_CLASSES[mode];
    if (cls) document.body.classList.add(cls);
    return () => { document.body.classList.remove("adhd-mode", "dyslexia-mode", "focus-mode"); };
  }, [mode]);

  return (
    <AccessibilityContext.Provider value={{ mode, learningStyle, ttsEnabled, setMode, setLearningStyle, setTtsEnabled, speak, stopSpeaking }}>
      {children}
    </AccessibilityContext.Provider>
  );
}
