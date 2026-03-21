"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback, useEffect } from "react";

interface VoiceRecorderProps {
  onTranscript: (text: string) => void;
  onRecordingChange?: (isRecording: boolean) => void;
  disabled?: boolean;
}

export default function VoiceRecorder({ onTranscript, onRecordingChange, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [useManualInput, setUseManualInput] = useState(false);
  const [manualText, setManualText] = useState("");
  const recognitionRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullTranscriptRef = useRef("");

  // Check for Web Speech API support
  const hasSpeechAPI = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window) as boolean;

  const startRecording = useCallback(() => {
    if (!hasSpeechAPI) {
      setUseManualInput(true);
      return;
    }

    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    fullTranscriptRef.current = "";
    setTranscript("");
    setSeconds(0);

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript + " ";
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) fullTranscriptRef.current = final;
      setTranscript(fullTranscriptRef.current + interim);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-available") {
        setUseManualInput(true);
        stopRecording();
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording (handles browser auto-stop)
      if (isRecording && recognitionRef.current) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    onRecordingChange?.(true);

    timerRef.current = setInterval(() => {
      setSeconds(s => s + 1);
    }, 1000);
  }, [hasSpeechAPI, isRecording, onRecordingChange]);

  const stopRecording = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null; // Prevent auto-restart
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsRecording(false);
    onRecordingChange?.(false);

    const finalText = fullTranscriptRef.current.trim();
    if (finalText) {
      onTranscript(finalText);
    }
  }, [onRecordingChange, onTranscript]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;

  const handleManualSubmit = () => {
    if (manualText.trim()) {
      onTranscript(manualText.trim());
      setTranscript(manualText.trim());
    }
  };

  if (useManualInput || !hasSpeechAPI) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span>Type your answer instead</span>
          {hasSpeechAPI && (
            <button
              onClick={() => setUseManualInput(false)}
              className="text-accent hover:underline text-xs"
            >
              Switch to voice
            </button>
          )}
        </div>
        <textarea
          value={manualText}
          onChange={(e) => setManualText(e.target.value)}
          placeholder="Type your interview answer here... Use STAR format: Situation, Task, Action, Result"
          className="w-full h-40 bg-bg border border-border rounded-lg p-3 text-sm text-slate-200 resize-y focus:border-accent focus:outline-none"
          disabled={disabled}
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted">{manualText.split(/\s+/).filter(Boolean).length} words</span>
          <button
            onClick={handleManualSubmit}
            disabled={!manualText.trim() || disabled}
            className="px-4 py-2 bg-accent text-white rounded-lg text-sm font-semibold hover:bg-accent/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Submit Answer
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        {/* Record button */}
        <button
          onClick={isRecording ? stopRecording : startRecording}
          disabled={disabled}
          className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl transition-all flex-shrink-0 ${
            isRecording
              ? "bg-red-500 border-2 border-red-400 text-white recording-pulse"
              : "bg-card border-2 border-border text-muted hover:border-accent hover:text-accent"
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {isRecording ? "⏹" : "🎙️"}
        </button>

        <div className="flex-1">
          <div className="text-sm text-muted">
            {isRecording ? (
              <span className="text-red-400 font-semibold flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-red-500 recording-pulse"></span>
                Recording... Speak your answer
              </span>
            ) : transcript ? (
              "Recording complete — review below"
            ) : (
              "Press to record your answer"
            )}
          </div>
          {isRecording && (
            <div className="text-2xl font-bold text-warn tabular-nums mt-1">
              {formatTime(seconds)}
            </div>
          )}
        </div>

        <button
          onClick={() => setUseManualInput(true)}
          className="text-xs text-muted hover:text-accent"
        >
          Type instead
        </button>
      </div>

      {/* Live transcript */}
      {transcript && (
        <div className="bg-bg rounded-lg p-3 text-sm text-muted max-h-32 overflow-y-auto whitespace-pre-wrap">
          {transcript}
        </div>
      )}

      {/* Time guidance */}
      {isRecording && seconds > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-border rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${
                seconds < 30 ? "bg-yellow-500" : seconds <= 120 ? "bg-green-500" : "bg-red-500"
              }`}
              style={{ width: `${Math.min((seconds / 150) * 100, 100)}%` }}
            />
          </div>
          <span className="text-xs text-muted">
            {seconds < 30 ? "Keep going..." : seconds <= 120 ? "Good length" : "Consider wrapping up"}
          </span>
        </div>
      )}
    </div>
  );
}
