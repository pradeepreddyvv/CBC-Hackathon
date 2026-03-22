"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { UserProfile } from "@/lib/store";

type Turn = {
  speaker: string;
  text: string;
};

type InterviewFeedback = {
  overall_score: number;
  communication_score: number;
  content_score: number;
  confidence_score: number;
  summary: string;
  strengths: string[];
  improvements: string[];
  question_by_question: Array<{
    question: string;
    answer_quality: "strong" | "okay" | "weak";
    coaching_note: string;
  }>;
  next_practice_questions: string[];
};

export default function InterviewLab({ profile }: { profile: UserProfile }) {
  const [isRecording, setIsRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [language, setLanguage] = useState("en");
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>("");
  const [transcript, setTranscript] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [busy, setBusy] = useState<"idle" | "transcribing" | "feedback">("idle");
  const [error, setError] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl("");
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      streamRef.current?.getTracks().forEach(t => t.stop());
      cleanupAudio();
    };
  }, [cleanupAudio]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;

    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    setIsRecording(false);
  }, []);

  const startRecording = useCallback(async () => {
    try {
      setError("");
      setFeedback(null);
      setTranscript("");
      setTurns([]);
      cleanupAudio();
      setAudioBlob(null);
      setSeconds(0);

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";

      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      recorder.start(1000);
      setIsRecording(true);

      timerRef.current = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);
    } catch {
      setError("Microphone access failed. Allow mic permissions and try again.");
    }
  }, [cleanupAudio]);

  const transcribe = useCallback(async () => {
    if (!audioBlob) return;
    setBusy("transcribing");
    setError("");

    try {
      const form = new FormData();
      form.append("file", audioBlob, "interview.webm");
      form.append("language", language);

      const res = await fetch("/api/transcribe", {
        method: "POST",
        body: form,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transcription failed");

      setTranscript(data.transcript || "");
      setTurns(Array.isArray(data.turns) ? data.turns : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Transcription failed");
    } finally {
      setBusy("idle");
    }
  }, [audioBlob, language]);

  const generateFeedback = useCallback(async () => {
    if (!transcript.trim()) return;
    setBusy("feedback");
    setError("");

    try {
      const res = await fetch("/api/interview-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript,
          turns,
          company: profile.targetCompany,
          role: profile.targetRole,
          profile,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Feedback generation failed");
      setFeedback(data.feedback);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Feedback generation failed");
    } finally {
      setBusy("idle");
    }
  }, [profile, transcript, turns]);

  const onFileUpload = async (file: File | null) => {
    if (!file) return;
    cleanupAudio();
    setFeedback(null);
    setTranscript("");
    setTurns([]);
    setError("");
    setAudioBlob(file);
    setAudioUrl(URL.createObjectURL(file));
  };

  const format = (totalSec: number) => `${Math.floor(totalSec / 60)}:${String(totalSec % 60).padStart(2, "0")}`;

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-bold text-slate-200">Interview Mode (Full Conversation)</h2>
        <p className="text-xs text-muted">
          Record both interviewer and candidate audio, transcribe with speaker labels, then generate interview feedback.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={isRecording ? stopRecording : startRecording}
            className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              isRecording ? "bg-red-500 text-white" : "bg-accent text-white hover:bg-accent/80"
            }`}
          >
            {isRecording ? "Stop Recording" : "Start Recording"}
          </button>

          <div className="text-sm text-muted">
            {isRecording ? `Recording... ${format(seconds)}` : "Ready"}
          </div>

          <label className="text-xs text-muted">Language</label>
          <input
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="w-20 bg-surface border border-border rounded px-2 py-1 text-xs text-slate-200"
            placeholder="en"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          <span>Or upload audio file:</span>
          <input
            type="file"
            accept="audio/*,video/*"
            onChange={(e) => onFileUpload(e.target.files?.[0] || null)}
            className="text-xs"
          />
        </div>

        {audioUrl && (
          <audio controls src={audioUrl} className="w-full" />
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={transcribe}
            disabled={!audioBlob || busy !== "idle"}
            className="px-4 py-2 bg-accent2 text-bg rounded-lg text-sm font-semibold hover:bg-accent2/80 disabled:opacity-50"
          >
            {busy === "transcribing" ? "Transcribing..." : "Transcribe Conversation"}
          </button>

          <button
            onClick={generateFeedback}
            disabled={!transcript.trim() || busy !== "idle"}
            className="px-4 py-2 bg-card border border-border text-slate-200 rounded-lg text-sm font-semibold hover:border-accent disabled:opacity-50"
          >
            {busy === "feedback" ? "Generating Feedback..." : "Generate Interview Feedback"}
          </button>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>

      {turns.length > 0 && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-200 mb-2">Speaker Turns</h3>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {turns.map((turn, i) => (
              <div key={i} className="text-xs">
                <span className="font-semibold text-accent mr-2">{turn.speaker}:</span>
                <span className="text-slate-300">{turn.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {transcript && (
        <div className="bg-surface border border-border rounded-xl p-4">
          <h3 className="text-sm font-bold text-slate-200 mb-2">Full Transcript</h3>
          <p className="text-xs text-slate-300 whitespace-pre-wrap max-h-72 overflow-y-auto">{transcript}</p>
        </div>
      )}

      {feedback && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap gap-3">
            <Score label="Overall" value={feedback.overall_score} />
            <Score label="Communication" value={feedback.communication_score} />
            <Score label="Content" value={feedback.content_score} />
            <Score label="Confidence" value={feedback.confidence_score} />
          </div>

          <p className="text-sm text-slate-300">{feedback.summary}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h4 className="text-xs font-bold text-green-400 mb-2">Strengths</h4>
              <ul className="space-y-1">
                {feedback.strengths?.map((item, i) => (
                  <li key={i} className="text-xs text-slate-300">- {item}</li>
                ))}
              </ul>
            </div>
            <div>
              <h4 className="text-xs font-bold text-yellow-400 mb-2">Improvements</h4>
              <ul className="space-y-1">
                {feedback.improvements?.map((item, i) => (
                  <li key={i} className="text-xs text-slate-300">- {item}</li>
                ))}
              </ul>
            </div>
          </div>

          {feedback.question_by_question?.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-accent2 mb-2">Question-by-Question</h4>
              <div className="space-y-2">
                {feedback.question_by_question.map((item, i) => (
                  <div key={i} className="bg-surface rounded-lg p-3">
                    <p className="text-xs text-slate-200 font-semibold">{item.question}</p>
                    <p className="text-[11px] text-muted">Quality: {item.answer_quality}</p>
                    <p className="text-xs text-slate-300 mt-1">{item.coaching_note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {feedback.next_practice_questions?.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-accent mb-2">Next Practice Questions</h4>
              <ul className="space-y-1">
                {feedback.next_practice_questions.map((q, i) => (
                  <li key={i} className="text-xs text-slate-300">- {q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Score({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface rounded-lg px-3 py-2 min-w-24 text-center">
      <div className="text-xl font-bold text-accent">{Number.isFinite(value) ? value : 0}</div>
      <div className="text-[10px] text-muted uppercase tracking-wider">{label}</div>
    </div>
  );
}
