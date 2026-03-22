"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { SpeechmaticsSTT } from "@/lib/speechmatics";

// ── Types ───────────────────────────────────────────────────────

type Turn = {
  speaker: "interviewer" | "candidate";
  text: string;
  duration: number;
  words: string[];
  wordTimings: number[];
  globalStart: number;
};

type CharacterRig = {
  group: THREE.Group;
  head: THREE.Group;
  mouthGrp: THREE.Group;
  lLid: THREE.Mesh;
  rLid: THREE.Mesh;
  lUA: THREE.Mesh;
  rUA: THREE.Mesh;
};

type BubbleRig = {
  update: (text: string, color: string) => void;
};

type SceneRig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  iv: CharacterRig;
  cd: CharacterRig;
  ivBubble: BubbleRig;
  cdBubble: BubbleRig;
};

type RuntimeState = {
  playing: boolean;
  elapsed: number;
  lastT: number;
  blinkTimer: number;
  blinkState: 0 | 1 | 2;
  renderedTurn: number;
};

type TtsState = {
  currentTurn: number;
  utterance: SpeechSynthesisUtterance | null;
};

type InterviewMode = "intro" | "asking" | "recording" | "reviewing" | "feedback";

interface AnswerRecord3D {
  questionIndex: number;
  question: string;
  answer: string;
  audioUrl?: string;
  durationSec: number;
  analysis?: Record<string, any>;
  humanizedFeedback?: string;
}

interface Props {
  questions?: string[];
  onAnswerRecorded?: (questionIndex: number, answer: string, audioUrl?: string) => void;
  onSessionComplete?: (answers: AnswerRecord3D[], sessionAnalysis: Record<string, any>) => void;
  onInterviewStart?: () => void;
  companyName?: string;
  profile?: { name: string; background: string; targetRole: string; targetCompany: string; experience: string; skills: string; country?: string };
  userId?: string;
  sessionId?: string;
  role?: string;
}

// ── Helpers ─────────────────────────────────────────────────────

function fmt(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function makeMesh(geo: THREE.BufferGeometry, color: number): THREE.Mesh {
  return new THREE.Mesh(
    geo,
    new THREE.MeshStandardMaterial({ color, roughness: 0.65 })
  );
}

function buildChar(scene: THREE.Scene, isLeft: boolean): CharacterRig {
  const g = new THREE.Group();
  const skin = isLeft ? 0xc68642 : 0xfcd9b0;
  const shirt = isLeft ? 0x1e1b4b : 0x1d4ed8;
  const pants = isLeft ? 0x111827 : 0x1e3a5f;
  const hair = isLeft ? 0x555566 : 0x3b2000;

  const torso = makeMesh(new THREE.CylinderGeometry(0.27, 0.31, 0.82, 10), shirt);
  torso.position.y = 1.08;
  g.add(torso);

  const lUA = makeMesh(new THREE.CylinderGeometry(0.09, 0.08, 0.52, 8), shirt);
  lUA.position.set(-0.4, 1.18, 0);
  lUA.rotation.z = Math.PI / 10;
  g.add(lUA);

  const rUA = makeMesh(new THREE.CylinderGeometry(0.09, 0.08, 0.52, 8), shirt);
  rUA.position.set(0.4, 1.18, 0);
  rUA.rotation.z = -Math.PI / 10;
  g.add(rUA);

  const lLA = makeMesh(new THREE.CylinderGeometry(0.07, 0.065, 0.42, 8), skin);
  lLA.position.set(-0.5, 0.8, 0.1);
  lLA.rotation.x = 0.4;
  g.add(lLA);

  const rLA = makeMesh(new THREE.CylinderGeometry(0.07, 0.065, 0.42, 8), skin);
  rLA.position.set(0.5, 0.8, 0.1);
  rLA.rotation.x = 0.4;
  g.add(rLA);

  const lHand = makeMesh(new THREE.SphereGeometry(0.09, 8, 6), skin);
  lHand.position.set(-0.52, 0.6, 0.25);
  g.add(lHand);

  const rHand = makeMesh(new THREE.SphereGeometry(0.09, 8, 6), skin);
  rHand.position.set(0.52, 0.6, 0.25);
  g.add(rHand);

  const lLeg = makeMesh(new THREE.CylinderGeometry(0.12, 0.11, 0.78, 8), pants);
  lLeg.position.set(-0.15, 0.39, 0);
  g.add(lLeg);

  const rLeg = makeMesh(new THREE.CylinderGeometry(0.12, 0.11, 0.78, 8), pants);
  rLeg.position.set(0.15, 0.39, 0);
  g.add(rLeg);

  const lShoe = makeMesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), 0x111111);
  lShoe.position.set(-0.15, 0.05, 0.06);
  g.add(lShoe);

  const rShoe = makeMesh(new THREE.BoxGeometry(0.18, 0.1, 0.3), 0x111111);
  rShoe.position.set(0.15, 0.05, 0.06);
  g.add(rShoe);

  const neck = makeMesh(new THREE.CylinderGeometry(0.1, 0.12, 0.22, 8), skin);
  neck.position.y = 1.6;
  g.add(neck);

  const head = new THREE.Group();
  head.position.y = 1.82;
  g.add(head);

  const skull = makeMesh(new THREE.SphereGeometry(0.3, 16, 12), skin);
  skull.scale.y = 1.15;
  head.add(skull);

  const hairMesh = makeMesh(new THREE.SphereGeometry(0.31, 10, 8), hair);
  hairMesh.position.y = 0.17;
  hairMesh.scale.set(1, 0.5, 1);
  head.add(hairMesh);

  const lEye = makeMesh(new THREE.SphereGeometry(0.048, 8, 6), 0x111111);
  lEye.position.set(-0.11, 0.05, 0.26);
  head.add(lEye);

  const rEye = makeMesh(new THREE.SphereGeometry(0.048, 8, 6), 0x111111);
  rEye.position.set(0.11, 0.05, 0.26);
  head.add(rEye);

  const lLid = makeMesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
  lLid.position.set(-0.11, 0.05, 0.26);
  head.add(lLid);

  const rLid = makeMesh(new THREE.SphereGeometry(0.05, 8, 6), skin);
  rLid.position.set(0.11, 0.05, 0.26);
  head.add(rLid);

  const nose = makeMesh(new THREE.SphereGeometry(0.05, 6, 5), skin);
  nose.position.set(0, -0.04, 0.28);
  nose.scale.set(0.8, 0.7, 0.9);
  head.add(nose);

  const mouthGrp = new THREE.Group();
  mouthGrp.position.set(0, -0.13, 0.27);
  head.add(mouthGrp);

  const lips = makeMesh(new THREE.BoxGeometry(0.13, 0.04, 0.02), 0x8b3a2a);
  mouthGrp.add(lips);

  const inner = makeMesh(new THREE.BoxGeometry(0.09, 0.001, 0.02), 0x2d0000);
  inner.position.y = -0.02;
  mouthGrp.add(inner);

  // Glasses + tie for interviewer
  if (isLeft) {
    const geoT = new THREE.TorusGeometry(0.085, 0.011, 6, 20);
    const gM = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const gl = new THREE.Mesh(geoT, gM);
    gl.position.set(-0.11, 0.06, 0.26);
    gl.rotation.y = 0.1;
    head.add(gl);
    const gr = new THREE.Mesh(geoT, gM);
    gr.position.set(0.11, 0.06, 0.26);
    gr.rotation.y = -0.1;
    head.add(gr);
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.01, 0.01), gM);
    br.position.set(0, 0.06, 0.28);
    head.add(br);
    const tie = makeMesh(new THREE.BoxGeometry(0.08, 0.38, 0.04), 0x7c3aed);
    tie.position.set(0, 1.13, 0.26);
    g.add(tie);
  }

  scene.add(g);
  return { group: g, head, mouthGrp, lLid, rLid, lUA, rUA };
}

function makeBubble(scene: THREE.Scene, side: "left" | "right"): BubbleRig {
  const cvs = document.createElement("canvas");
  cvs.width = 512;
  cvs.height = 200;
  const ctx = cvs.getContext("2d");
  const tex = new THREE.CanvasTexture(cvs);

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.4, 0.9),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );

  mesh.position.set(side === "left" ? -3.3 : 3.3, 3.6, -0.3);
  mesh.rotation.y = side === "left" ? 0.25 : -0.25;
  scene.add(mesh);

  function wrap(text: string, maxW: number): string[] {
    if (!ctx) return [];
    const ws = text.split(" ");
    const lines: string[] = [];
    let line = "";
    ws.forEach((w) => {
      const test = line ? `${line} ${w}` : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    });
    if (line) lines.push(line);
    return lines;
  }

  function update(text: string, color: string): void {
    if (!ctx) return;
    ctx.clearRect(0, 0, 512, 200);
    if (!text) { tex.needsUpdate = true; return; }

    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.roundRect(8, 8, 496, 156, 22);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.stroke();

    const tx = side === "left" ? 80 : 390;
    ctx.fillStyle = "rgba(255,255,255,0.96)";
    ctx.beginPath();
    ctx.moveTo(tx, 164);
    ctx.lineTo(tx + 18, 190);
    ctx.lineTo(tx + 36, 164);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(tx, 166);
    ctx.lineTo(tx + 18, 190);
    ctx.lineTo(tx + 36, 166);
    ctx.stroke();

    ctx.fillStyle = "#1e293b";
    ctx.font = "bold 25px system-ui, sans-serif";
    wrap(text, 460).slice(0, 3).forEach((line, i) => ctx.fillText(line, 24, 44 + i * 34));
    tex.needsUpdate = true;
  }

  return { update };
}

// ── Default questions ───────────────────────────────────────────

const DEFAULT_QUESTIONS = [
  "Tell me about a time you led a challenging technical project. What was the situation, what did you do, and what was the outcome?",
  "Describe a situation where you had to work with a difficult team member. How did you handle it?",
  "Tell me about a time you failed. What did you learn from it?",
];

// ── Main Component ──────────────────────────────────────────────

export default function InterviewArtifactScene({ questions, onAnswerRecorded, onSessionComplete, onInterviewStart, companyName, profile, userId, sessionId, role }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const stateRef = useRef<RuntimeState>({
    playing: false, elapsed: 0, lastT: 0,
    blinkTimer: 0, blinkState: 0, renderedTurn: -1,
  });
  const ttsRef = useRef<TtsState>({ currentTurn: -1, utterance: null });
  const sceneRef = useRef<SceneRig | null>(null);

  // Interview state
  const interviewQs = questions && questions.length > 0 ? questions : DEFAULT_QUESTIONS;
  const [currentQIdx, setCurrentQIdx] = useState(0);
  const [mode, setMode] = useState<InterviewMode>("intro");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [interviewerTalking, setInterviewerTalking] = useState(false);
  const [candidateTalking, setCandidateTalking] = useState(false);

  // Speech recognition + audio recording refs
  const recognitionRef = useRef<any>(null);
  const smSttRef = useRef<SpeechmaticsSTT | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fullTranscriptRef = useRef("");

  // Active bubble text
  const [bubbleText, setBubbleText] = useState("");
  const [activeSpeaker, setActiveSpeaker] = useState<"interviewer" | "candidate">("interviewer");
  const [showQuestionText, setShowQuestionText] = useState(false);

  // Feedback state
  const [allAnswers, setAllAnswers] = useState<AnswerRecord3D[]>([]);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackData, setFeedbackData] = useState<{ analysis: Record<string, any>; humanized: Record<string, any> } | null>(null);
  const [feedbackMode, setFeedbackMode] = useState<"single" | "session">("single");
  const [showFeedbackMenu, setShowFeedbackMenu] = useState(false);
  const [feedbackSpeaking, setFeedbackSpeaking] = useState(false);
  const recordingStartRef = useRef<number>(0);

  // Adaptive questions
  const [adaptiveQs, setAdaptiveQs] = useState<string[]>([]);
  const [allQuestions, setAllQuestions] = useState<string[]>(interviewQs);
  const [followUpFlags, setFollowUpFlags] = useState<boolean[]>(interviewQs.map(() => false));  // track which Qs are follow-ups
  const [autoFeedbackDone, setAutoFeedbackDone] = useState(false); // prevent double-fire

  // ── Three.js setup ──────────────────────────────────────────

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    scene.fog = new THREE.Fog(0x1a1a2e, 20, 38);

    const camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 100);
    camera.position.set(0, 2.8, 9);
    camera.lookAt(0, 1.8, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.45));
    const key = new THREE.DirectionalLight(0xfff5e0, 1.2);
    key.position.set(4, 8, 6);
    key.castShadow = true;
    scene.add(key);
    const fill2 = new THREE.DirectionalLight(0xc7d8ff, 0.5);
    fill2.position.set(-5, 4, 2);
    scene.add(fill2);
    const spot = new THREE.SpotLight(0xfff0cc, 1.5, 12, Math.PI / 5, 0.4, 1.5);
    spot.position.set(0, 7, 1);
    spot.castShadow = true;
    scene.add(spot);

    // Floor
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x0f0c29, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Grid lines
    const gM = new THREE.MeshBasicMaterial({ color: 0x1e1b4b, transparent: true, opacity: 0.4 });
    for (let i = -14; i <= 14; i += 2) {
      const h = new THREE.Mesh(new THREE.PlaneGeometry(30, 0.02), gM);
      h.rotation.x = -Math.PI / 2;
      h.position.set(0, 0.001, i);
      scene.add(h);
      const v = new THREE.Mesh(new THREE.PlaneGeometry(0.02, 30), gM);
      v.rotation.x = -Math.PI / 2;
      v.position.set(i, 0.001, 0);
      scene.add(v);
    }

    // Wall
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 12),
      new THREE.MeshStandardMaterial({ color: 0x16213e, roughness: 0.9 })
    );
    wall.position.set(0, 6, -8);
    scene.add(wall);

    for (let x = -12; x <= 12; x += 3) {
      const p = new THREE.Mesh(
        new THREE.PlaneGeometry(2.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x1a1f4a })
      );
      p.position.set(x, 4, -7.95);
      scene.add(p);
    }

    // Table
    const tTop = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.12, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x4a2c0a, roughness: 0.4, metalness: 0.15 })
    );
    tTop.position.set(0, 1.0, 0);
    tTop.castShadow = true;
    tTop.receiveShadow = true;
    scene.add(tTop);

    [[-1.8, -0.7], [-1.8, 0.7], [1.8, -0.7], [1.8, 0.7]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x2d1a05 })
      );
      leg.position.set(x, 0.6, z);
      scene.add(leg);
    });

    // Microphone
    const micB = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.2, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })
    );
    micB.position.set(0, 1.07, 0);
    scene.add(micB);
    const micS = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.35, 8),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
    );
    micS.position.set(0, 1.24, 0);
    scene.add(micS);
    const micH = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 12, 8),
      new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7 })
    );
    micH.position.set(0, 1.45, 0);
    scene.add(micH);

    // Chairs
    [[-2.2, 0.55], [2.2, -0.55]].forEach(([cx, ry]) => {
      const cg = new THREE.Group();
      const cM = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), cM);
      seat.position.y = 0.6;
      cg.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 0.06), cM);
      back.position.set(0, 0.94, -0.3);
      cg.add(back);
      [[-0.28, 0.28], [0.28, 0.28], [-0.28, -0.28], [0.28, -0.28]].forEach(([px, pz]) => {
        const leg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6),
          new THREE.MeshStandardMaterial({ color: 0x334155 })
        );
        leg.position.set(px, 0.3, pz);
        cg.add(leg);
      });
      cg.position.set(cx, 0, 1.4);
      cg.rotation.y = ry;
      scene.add(cg);
    });

    // Characters
    const iv = buildChar(scene, true);
    iv.group.position.set(-2.2, 0, 0.6);
    iv.group.rotation.y = 0.55;

    const cd = buildChar(scene, false);
    cd.group.position.set(2.2, 0, 0.6);
    cd.group.rotation.y = -0.55;

    const ivBubble = makeBubble(scene, "left");
    const cdBubble = makeBubble(scene, "right");

    sceneRef.current = { renderer, scene, camera, iv, cd, ivBubble, cdBubble };

    const handleResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", handleResize);

    let rafId = 0;

    function animate(ts: number) {
      rafId = requestAnimationFrame(animate);
      const sr = sceneRef.current;
      if (!sr) return;
      const st = stateRef.current;
      const dt = st.lastT ? ts - st.lastT : 0;
      st.lastT = ts;

      if (st.playing) st.elapsed += dt;

      // Mouth animation
      [
        { ch: sr.iv, talking: interviewerTalking },
        { ch: sr.cd, talking: candidateTalking },
      ].forEach(({ ch, talking }) => {
        const s = talking ? Math.abs(Math.sin(ts / 100)) * 0.9 + 0.1 : 0;
        ch.mouthGrp.scale.y = 1 + s * 2.5;
        ch.mouthGrp.position.y = -0.13 - s * 0.04;
      });

      // Head bob/nod
      [
        { ch: sr.iv, talking: interviewerTalking, listening: candidateTalking },
        { ch: sr.cd, talking: candidateTalking, listening: interviewerTalking },
      ].forEach(({ ch, talking, listening }) => {
        ch.head.position.y = talking ? 1.82 + Math.sin(ts / 180) * 0.025 : 1.82;
        ch.head.rotation.x = listening ? Math.sin(ts / 900) * 0.05 : 0;
      });

      // Side tilt
      sr.iv.head.rotation.z = !interviewerTalking && candidateTalking ? Math.sin(ts / 700) * 0.04 : 0;
      sr.cd.head.rotation.z = !candidateTalking && interviewerTalking ? Math.sin(ts / 700) * 0.04 : 0;

      // Arm gesture
      [
        { ch: sr.iv, talking: interviewerTalking },
        { ch: sr.cd, talking: candidateTalking },
      ].forEach(({ ch, talking }) => {
        const sw = talking ? Math.sin(ts / 400) * 0.18 : 0;
        ch.lUA.rotation.z = Math.PI / 10 + sw;
        ch.rUA.rotation.z = -(Math.PI / 10 + sw);
      });

      // Eye blink
      st.blinkTimer += dt;
      if (st.blinkTimer > 3400) { st.blinkTimer = 0; st.blinkState = 1; }
      if (st.blinkState === 1) {
        [sr.iv.lLid, sr.iv.rLid, sr.cd.lLid, sr.cd.rLid].forEach((l) => {
          l.scale.y = Math.max(0.05, l.scale.y - 0.28);
        });
        if (sr.iv.lLid.scale.y <= 0.05) st.blinkState = 2;
      } else if (st.blinkState === 2) {
        [sr.iv.lLid, sr.iv.rLid, sr.cd.lLid, sr.cd.rLid].forEach((l) => {
          l.scale.y = Math.min(1, l.scale.y + 0.32);
        });
        if (sr.iv.lLid.scale.y >= 1) st.blinkState = 0;
      }

      // Camera drift
      camera.position.x = Math.sin(ts / 8000) * 0.22;
      camera.position.y = 2.8 + Math.sin(ts / 6000) * 0.07;
      camera.lookAt(0, 1.8, 0);

      renderer.render(scene, camera);
    }

    rafId = requestAnimationFrame(animate);

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
      window.speechSynthesis?.cancel();
      if (mount.contains(renderer.domElement)) {
        mount.removeChild(renderer.domElement);
      }
      renderer.dispose();
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update bubbles when text changes
  useEffect(() => {
    if (!sceneRef.current) return;
    const { ivBubble, cdBubble } = sceneRef.current;
    if (activeSpeaker === "interviewer") {
      ivBubble.update(bubbleText, "#6366f1");
      cdBubble.update("", "#10b981");
    } else {
      ivBubble.update("", "#6366f1");
      cdBubble.update(bubbleText, "#10b981");
    }
  }, [bubbleText, activeSpeaker]);

  // ── TTS: Interviewer asks question ────────────────────────────

  const pickVoice = (voices: SpeechSynthesisVoice[], prefs: string[]): SpeechSynthesisVoice | null => {
    for (const p of prefs) {
      const v = voices.find((voice) => voice.name.includes(p) || voice.lang === p);
      if (v) return v;
    }
    return voices.find((voice) => voice.lang.startsWith("en")) || null;
  };

  const askQuestion = useCallback((qIdx: number) => {
    if (!window.speechSynthesis) return;
    const questionText = allQuestions[qIdx];
    if (!questionText) return;

    setMode("asking");
    setInterviewerTalking(true);
    setCandidateTalking(false);
    setActiveSpeaker("interviewer");
    setShowQuestionText(false);

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(questionText);
    utter.rate = 0.88;
    utter.pitch = 0.8;
    utter.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const malePrefs = ["Google UK English Male", "Microsoft David", "Daniel", "Alex", "Arthur", "en-GB"];
    if (voices.length > 0) {
      utter.voice = pickVoice(voices, malePrefs);
    }

    // Show words as they're spoken
    const words = questionText.split(" ");
    let wordIdx = 0;

    utter.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name !== "word") return;
      const spokenSoFar = questionText.substring(0, e.charIndex + e.charLength).trim();
      wordIdx = spokenSoFar.split(/\s+/).length - 1;
      setBubbleText(words.slice(Math.max(0, wordIdx - 6), wordIdx + 1).join(" "));
    };

    utter.onend = () => {
      setInterviewerTalking(false);
      setBubbleText(words.slice(-7).join(" "));
      setMode("recording");
    };

    ttsRef.current = { currentTurn: qIdx, utterance: utter };
    window.speechSynthesis.speak(utter);
  }, [allQuestions]);

  // ── Voice recording ───────────────────────────────────────────

  const startRecording = useCallback(async () => {
    setIsRecording(true);
    setCandidateTalking(true);
    setActiveSpeaker("candidate");
    setRecordingSeconds(0);
    fullTranscriptRef.current = "";
    setTranscript("");
    setBubbleText("");
    recordingStartRef.current = Date.now();

    // Start audio recording (for replay)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
    } catch { /* ignore */ }

    // Transcript update handler (shared by both STT engines)
    const handleTranscript = (fullText: string) => {
      fullTranscriptRef.current = fullText;
      setTranscript(fullText);
      const words = fullText.trim().split(" ");
      setBubbleText(words.slice(-7).join(" "));
    };

    // Try Speechmatics STT first, fall back to browser SpeechRecognition
    const smApiKey = process.env.NEXT_PUBLIC_SPEECHMATICS_API_KEY;
    if (smApiKey) {
      const stt = new SpeechmaticsSTT({
        apiKey: smApiKey,
        language: "en",
        sampleRate: 16000,
        enablePartials: true,
        onTranscript: (text) => handleTranscript(text),
        onError: (err) => {
          console.warn("[Speechmatics] STT error, falling back to browser:", err);
          startBrowserSTT(handleTranscript);
        },
        onStarted: () => console.log("[Speechmatics] STT started"),
      });
      smSttRef.current = stt;
      stt.start();
    } else {
      startBrowserSTT(handleTranscript);
    }

    // Timer
    timerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
  }, [isRecording]);

  // Browser SpeechRecognition fallback
  const startBrowserSTT = useCallback((onText: (text: string) => void) => {
    const SpeechRecognitionAPI = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let final = "";
      let interim = "";
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) final += result[0].transcript + " ";
        else interim += result[0].transcript;
      }
      if (final) fullTranscriptRef.current = final;
      onText(fullTranscriptRef.current + interim);
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try { recognition.start(); } catch { /* ignore */ }
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    setCandidateTalking(false);

    // Stop Speechmatics STT
    if (smSttRef.current) {
      const finalText = smSttRef.current.stop();
      if (finalText) fullTranscriptRef.current = finalText;
      smSttRef.current = null;
    }

    // Stop browser SpeechRecognition
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    let audioUrl: string | undefined;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      const recorder = mediaRecorderRef.current;
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        audioUrl = URL.createObjectURL(blob);
        recorder.stream.getTracks().forEach((t) => t.stop());
      };
      recorder.stop();
      mediaRecorderRef.current = null;
    }

    const finalText = fullTranscriptRef.current.trim();
    const durationSec = Math.round((Date.now() - recordingStartRef.current) / 1000);

    if (finalText) {
      // Save answer record
      const record: AnswerRecord3D = {
        questionIndex: currentQIdx,
        question: allQuestions[currentQIdx],
        answer: finalText,
        audioUrl,
        durationSec,
      };
      setAllAnswers(prev => [...prev, record]);

      if (onAnswerRecorded) {
        setTimeout(() => onAnswerRecorded(currentQIdx, finalText, audioUrl), 200);
      }
    }

    setMode("reviewing");
    setAutoFeedbackDone(false);
  }, [currentQIdx, onAnswerRecorded, allQuestions]);

  // ── Feedback functions ──────────────────────────────────────────

  const requestFeedback = useCallback(async (mode: "single" | "session") => {
    setFeedbackMode(mode);
    setFeedbackLoading(true);
    setFeedbackData(null);
    setMode("feedback");
    setShowFeedbackMenu(false);
    setActiveSpeaker("interviewer");
    setInterviewerTalking(false);

    try {
      const basePayload = {
        company: companyName || "General",
        role: role || "Software Engineer",
        profile,
        country: profile?.country || "",
      };

      let res: Response;

      if (mode === "single") {
        // Get latest answer
        const latest = allAnswers[allAnswers.length - 1];
        if (!latest) { setFeedbackLoading(false); setMode("reviewing"); return; }

        res = await fetch("/api/mock-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            action: "analyze_question",
            question: latest.question,
            answer: latest.answer,
            questionIndex: latest.questionIndex,
            durationSec: latest.durationSec,
          }),
        });
      } else {
        // Full session analysis
        res = await fetch("/api/mock-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...basePayload,
            action: "analyze_session",
            questionsAndAnswers: allAnswers.map(a => ({
              question: a.question,
              answer: a.answer,
              durationSec: a.durationSec,
              questionAnalysis: a.analysis,
            })),
          }),
        });
      }

      if (!res.ok) throw new Error(`Feedback API ${res.status}`);
      const data = await res.json();
      setFeedbackData(data);

      // Update answer record with analysis
      if (mode === "single" && data.analysis) {
        setAllAnswers(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last) {
            last.analysis = data.analysis;
            last.humanizedFeedback = data.humanized?.spoken_feedback;
          }
          return updated;
        });
      }

      // Speak the humanized feedback via TTS
      if (data.humanized?.spoken_feedback && window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(data.humanized.spoken_feedback);
        utter.rate = 0.9;
        utter.pitch = 0.85;
        const voices = window.speechSynthesis.getVoices();
        const malePrefs = ["Google UK English Male", "Microsoft David", "Daniel", "Alex", "Arthur", "en-GB"];
        for (const p of malePrefs) {
          const v = voices.find(voice => voice.name.includes(p) || voice.lang === p);
          if (v) { utter.voice = v; break; }
        }
        setInterviewerTalking(true);
        setFeedbackSpeaking(true);
        setBubbleText(data.humanized.spoken_feedback.substring(0, 80) + "...");

        utter.onend = () => {
          setInterviewerTalking(false);
          setFeedbackSpeaking(false);
        };
        window.speechSynthesis.speak(utter);
      }

      // Fetch adaptive follow-up questions based on weak areas
      if (data.analysis) {
        const weakAreas = mode === "single"
          ? (data.analysis.weak_areas || [])
          : (data.analysis.adaptive_question_topics || data.analysis.top_3_focus_areas || []);

        if (weakAreas.length > 0) {
          try {
            const aqRes = await fetch("/api/mock-feedback", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                ...basePayload,
                action: "adaptive_questions",
                weakAreas,
                previousQuestions: allQuestions,
                count: 2,
              }),
            });
            if (aqRes.ok) {
              const aqData = await aqRes.json();
              if (aqData.questions?.length) {
                const newQTexts = aqData.questions.map((q: any) => q.text);
                setAdaptiveQs(prev => [...prev, ...newQTexts]);
                setAllQuestions(prev => [...prev, ...newQTexts]);
                setFollowUpFlags(prev => [...prev, ...newQTexts.map(() => true)]);
              }
            }
          } catch { /* ignore adaptive failure */ }
        }
      }
    } catch (err) {
      console.error("[3D Mock] Feedback error:", err);
    } finally {
      setFeedbackLoading(false);
    }
  }, [allAnswers, allQuestions, companyName, role, profile]);

  const closeFeedback = useCallback(() => {
    window.speechSynthesis?.cancel();
    setFeedbackSpeaking(false);
    setInterviewerTalking(false);
    setMode("reviewing");
    setFeedbackData(null);
  }, []);

  const nextQuestion = useCallback(() => {
    if (currentQIdx < allQuestions.length - 1) {
      const next = currentQIdx + 1;
      setCurrentQIdx(next);
      setTranscript("");
      setBubbleText("");
      setMode("asking");
      askQuestion(next);
    } else if (adaptiveQs.length > 0) {
      // There are adaptive questions queued
      const next = currentQIdx + 1;
      setCurrentQIdx(next);
      setTranscript("");
      setBubbleText("");
      setMode("asking");
      askQuestion(next);
    } else {
      // Session complete — trigger final session analysis
      requestFeedback("session");
    }
  }, [currentQIdx, allQuestions.length, adaptiveQs.length, askQuestion, requestFeedback]);

  const startInterview = useCallback(() => {
    setCurrentQIdx(0);
    setTranscript("");
    setBubbleText("");
    setAllAnswers([]);
    setFeedbackData(null);
    setAdaptiveQs([]);
    setAllQuestions(interviewQs);
    setFollowUpFlags(interviewQs.map(() => false));
    setAutoFeedbackDone(false);
    onInterviewStart?.();
    askQuestion(0);
  }, [askQuestion, interviewQs, onInterviewStart]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", height: "100vh", background: "#1a1a2e", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Three.js canvas */}
      <div ref={mountRef} style={{ flex: 1, overflow: "hidden" }} />

      {/* Speaker label */}
      <div style={{
        position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.72)", borderRadius: 999, padding: "6px 20px",
        color: mode === "feedback" ? "#f59e0b" : activeSpeaker === "interviewer" ? "#6366f1" : "#10b981",
        fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
        border: `1px solid ${mode === "feedback" ? "#f59e0b55" : activeSpeaker === "interviewer" ? "#6366f155" : "#10b98155"}`,
        backdropFilter: "blur(8px)",
      }}>
        {mode === "intro" ? `${companyName || "Mock"} Interview` :
         mode === "asking" ? (followUpFlags[currentQIdx] ? "Follow-up question..." : "Interviewer is asking...") :
         mode === "recording" ? "Your turn — speak your answer" :
         mode === "feedback" ? (feedbackLoading ? "Analyzing..." : "Interviewer Feedback") :
         "Review your answer"}
      </div>

      {/* Question counter + info button + feedback button */}
      {mode !== "intro" && (
        <div style={{
          position: "absolute", top: 14, right: 20,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {/* Feedback button (visible in reviewing mode) */}
          {(mode === "reviewing" || mode === "recording" && !isRecording) && allAnswers.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowFeedbackMenu(v => !v)}
                title="Get interviewer feedback"
                style={{
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(245,158,11,0.85)", color: "#fff",
                  fontSize: 12, fontWeight: 700, border: "1px solid #f59e0b",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                Feedback
              </button>
              {showFeedbackMenu && (
                <div style={{
                  position: "absolute", top: 40, right: 0, width: 200,
                  background: "rgba(15,12,41,0.95)", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.15)", overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 100,
                }}>
                  <button
                    onClick={() => requestFeedback("single")}
                    style={{
                      width: "100%", padding: "12px 14px", border: "none", cursor: "pointer",
                      background: "transparent", color: "#e2e8f0", fontSize: 13, textAlign: "left",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.15)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 700, color: "#f59e0b" }}>This Question</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Analyze your last answer</div>
                  </button>
                  <button
                    onClick={() => requestFeedback("session")}
                    style={{
                      width: "100%", padding: "12px 14px", border: "none", cursor: "pointer",
                      background: "transparent", color: "#e2e8f0", fontSize: 13, textAlign: "left",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(245,158,11,0.15)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 700, color: "#f59e0b" }}>All Questions</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Full session analysis ({allAnswers.length} answers)</div>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* "i" button to toggle question text visibility */}
          {(mode === "asking" || mode === "recording") && (
            <button
              onClick={() => setShowQuestionText((v) => !v)}
              title={showQuestionText ? "Hide question text" : "Show question text"}
              style={{
                width: 34, height: 34, borderRadius: "50%", cursor: "pointer",
                background: showQuestionText ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.72)",
                color: showQuestionText ? "#fff" : "#94a3b8",
                fontSize: 18, fontWeight: 800, fontFamily: "serif", fontStyle: "italic",
                display: "flex", alignItems: "center", justifyContent: "center",
                backdropFilter: "blur(8px)",
                border: `1px solid ${showQuestionText ? "#6366f1" : "rgba(255,255,255,0.1)"}`,
                transition: "all 0.2s",
              }}
            >
              i
            </button>
          )}
          <div style={{
            background: "rgba(0,0,0,0.72)", borderRadius: 999, padding: "6px 16px",
            color: "#94a3b8", fontSize: 12, fontWeight: 600,
            border: "1px solid rgba(255,255,255,0.1)",
          }}>
            {followUpFlags[currentQIdx] ? "Follow-up" : `Q${currentQIdx + 1}`} / {allQuestions.length}
          </div>
        </div>
      )}

      {/* Transcript / question / feedback display */}
      {mode !== "intro" && (
        <div style={{
          position: "absolute", bottom: 100, left: "50%", transform: "translateX(-50%)",
          width: "88%", maxWidth: 750,
          background: "rgba(0,0,0,0.78)", borderRadius: 12, padding: "12px 18px",
          minHeight: 50, maxHeight: mode === "feedback" ? 350 : 160,
          overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(8px)",
        }}>
          {mode === "asking" && (
            <div style={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.5 }}>
              <span style={{ color: followUpFlags[currentQIdx] ? "#f59e0b" : "#6366f1", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
                {followUpFlags[currentQIdx] ? "Follow-up Question" : `Question ${currentQIdx + 1}`}
              </span>
              {showQuestionText ? (
                <>
                  <br />
                  {allQuestions[currentQIdx]}
                </>
              ) : (
                <span style={{ color: "#64748b", fontSize: 13, marginLeft: 10 }}>Listening to interviewer... tap ⓘ to read</span>
              )}
            </div>
          )}
          {mode === "recording" && (
            <div>
              {showQuestionText && (
                <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6, padding: "4px 8px", background: "rgba(99,102,241,0.1)", borderRadius: 6, borderLeft: "2px solid #6366f1" }}>
                  <span style={{ color: "#6366f1", fontWeight: 700 }}>Q:</span> {allQuestions[currentQIdx]}
                </div>
              )}
              <div style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.5 }}>
                {transcript || <span style={{ color: "#475569", fontStyle: "italic" }}>Listening... speak your answer</span>}
              </div>
            </div>
          )}
          {mode === "reviewing" && (
            <div>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 6 }}>
                <span style={{ color: "#10b981", fontWeight: 700 }}>Your Answer:</span>
              </div>
              <div style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.5, maxHeight: 100, overflowY: "auto" }}>
                {transcript || "No transcript captured"}
              </div>
            </div>
          )}

          {/* Feedback display */}
          {mode === "feedback" && (
            <div>
              {feedbackLoading ? (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ color: "#f59e0b", fontSize: 14, fontWeight: 700, marginBottom: 8, animation: "pulse 1.5s infinite" }}>
                    {feedbackMode === "single" ? "Analyzing your answer..." : "Analyzing full session..."}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>Gemini is analyzing, then Claude will humanize the feedback</div>
                </div>
              ) : feedbackData ? (
                <div>
                  {/* Humanized spoken feedback */}
                  <div style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(245,158,11,0.1)", borderRadius: 8, borderLeft: "3px solid #f59e0b" }}>
                    <div style={{ color: "#f59e0b", fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                      Interviewer says{feedbackSpeaking ? " (speaking...)" : ""}:
                    </div>
                    <div style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.6, fontStyle: "italic" }}>
                      &ldquo;{feedbackData.humanized?.spoken_feedback || "No feedback available"}&rdquo;
                    </div>
                  </div>

                  {/* Score and analysis */}
                  {feedbackData.analysis && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      {/* Overall score */}
                      <div style={{ background: "rgba(99,102,241,0.12)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                        <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Score</div>
                        <div style={{ color: "#6366f1", fontSize: 22, fontWeight: 800 }}>
                          {(feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || "—"}
                        </div>
                      </div>
                      {/* Readiness (session mode) */}
                      {(feedbackData.analysis as any).readiness_label && (
                        <div style={{ background: "rgba(16,185,129,0.12)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Readiness</div>
                          <div style={{ color: "#10b981", fontSize: 14, fontWeight: 700 }}>
                            {(feedbackData.analysis as any).readiness_label}
                          </div>
                        </div>
                      )}
                      {/* Hiring recommendation (session mode) */}
                      {(feedbackData.analysis as any).hiring_recommendation && (
                        <div style={{ background: "rgba(245,158,11,0.12)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Recommendation</div>
                          <div style={{ color: "#f59e0b", fontSize: 14, fontWeight: 700 }}>
                            {(feedbackData.analysis as any).hiring_recommendation}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Dimension scores (single question mode) */}
                  {(feedbackData.analysis as any)?.dimension_scores && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Dimension Scores</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Object.entries((feedbackData.analysis as any).dimension_scores).map(([key, val]) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.05)", borderRadius: 6, padding: "3px 8px" }}>
                            <span style={{ color: "#94a3b8", fontSize: 10, textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</span>
                            <span style={{ color: (val as number) >= 70 ? "#10b981" : (val as number) >= 50 ? "#f59e0b" : "#ef4444", fontSize: 12, fontWeight: 700 }}>{val as number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths & improvements */}
                  {((feedbackData.analysis as any)?.strengths || (feedbackData.analysis as any)?.strengths_to_leverage) && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#10b981", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>STRENGTHS</div>
                        {((feedbackData.analysis as any).strengths || (feedbackData.analysis as any).strengths_to_leverage || []).slice(0, 3).map((s: string, i: number) => (
                          <div key={i} style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>+ {s}</div>
                        ))}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#ef4444", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>IMPROVE</div>
                        {((feedbackData.analysis as any).improvements || (feedbackData.analysis as any).top_3_focus_areas || []).slice(0, 3).map((s: string, i: number) => (
                          <div key={i} style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>- {s}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Adaptive questions notice */}
                  {adaptiveQs.length > 0 && (
                    <div style={{ background: "rgba(99,102,241,0.1)", borderRadius: 6, padding: "6px 10px", marginTop: 6 }}>
                      <div style={{ color: "#6366f1", fontSize: 11, fontWeight: 700 }}>
                        +{adaptiveQs.length} follow-up questions added based on your weak areas
                      </div>
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Controls bar */}
      <div style={{
        position: "absolute", bottom: 18, left: "50%", transform: "translateX(-50%)",
        width: "88%", maxWidth: 750,
        background: "rgba(15,12,41,0.92)", borderRadius: 16, padding: "13px 20px",
        border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", gap: 14,
      }}>
        {/* Intro — Start button */}
        {mode === "intro" && (
          <button onClick={startInterview} style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg,#6366f1,#a855f7)", color: "white",
            fontSize: 16, fontWeight: 700, boxShadow: "0 4px 16px rgba(99,102,241,0.5)",
          }}>
            Start Interview ({allQuestions.length} Questions)
          </button>
        )}

        {/* Asking — interviewer speaking */}
        {mode === "asking" && (
          <div style={{ width: "100%", textAlign: "center", color: "#6366f1", fontSize: 14, fontWeight: 600 }}>
            <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>
              Interviewer is speaking...
            </span>
          </div>
        )}

        {/* Recording controls */}
        {mode === "recording" && !isRecording && (
          <button onClick={startRecording} style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "none", cursor: "pointer",
            background: "linear-gradient(135deg, #10b981, #059669)", color: "white",
            fontSize: 16, fontWeight: 700, boxShadow: "0 4px 16px rgba(16,185,129,0.5)",
          }}>
            Start Recording Your Answer
          </button>
        )}

        {mode === "recording" && isRecording && (
          <>
            <button onClick={stopRecording} style={{
              width: 48, height: 48, borderRadius: "50%", border: "2px solid #ef4444", cursor: "pointer",
              background: "rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 20, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              ⏹
            </button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ color: "#ef4444", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#ef4444", display: "inline-block", animation: "pulse 1s infinite" }} />
                Recording...
              </div>
              <div style={{ color: "#e2e8f0", fontSize: 24, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmtTime(recordingSeconds)}
              </div>
              <div style={{ color: "#64748b", fontSize: 11 }}>
                {recordingSeconds < 30 ? "Keep going..." : recordingSeconds <= 120 ? "Good length" : "Consider wrapping up"}
              </div>
            </div>
            <div style={{ color: "#94a3b8", fontSize: 11, textAlign: "right" }}>
              {transcript.split(/\s+/).filter(Boolean).length} words
            </div>
          </>
        )}

        {/* Review controls */}
        {mode === "reviewing" && (
          <div style={{ width: "100%", display: "flex", gap: 10 }}>
            <button onClick={nextQuestion} style={{
              flex: 1, padding: "14px 0", borderRadius: 12, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg,#6366f1,#a855f7)", color: "white",
              fontSize: 16, fontWeight: 700, boxShadow: "0 4px 16px rgba(99,102,241,0.5)",
            }}>
              {currentQIdx < allQuestions.length - 1
                ? (followUpFlags[currentQIdx + 1] ? "Answer Follow-up →" : "Next Question →")
                : "Finish & Get Session Feedback"}
            </button>
          </div>
        )}

        {/* Feedback controls */}
        {mode === "feedback" && !feedbackLoading && feedbackData && (
          <div style={{ width: "100%", display: "flex", gap: 10 }}>
            {currentQIdx < allQuestions.length - 1 && (
              <button onClick={() => { closeFeedback(); nextQuestion(); }} style={{
                flex: 1, padding: "14px 0", borderRadius: 12, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg,#6366f1,#a855f7)", color: "white",
                fontSize: 16, fontWeight: 700, boxShadow: "0 4px 16px rgba(99,102,241,0.5)",
              }}>
                Next Question →
              </button>
            )}
            <button onClick={() => { closeFeedback(); setMode("intro"); setBubbleText(""); }} style={{
              flex: currentQIdx < allQuestions.length - 1 ? "none" : 1,
              padding: "14px 20px", borderRadius: 12, border: "none", cursor: "pointer",
              background: currentQIdx < allQuestions.length - 1
                ? "rgba(255,255,255,0.08)"
                : "linear-gradient(135deg,#10b981,#059669)",
              color: "white",
              fontSize: currentQIdx < allQuestions.length - 1 ? 13 : 16,
              fontWeight: 700,
            }}>
              {currentQIdx < allQuestions.length - 1 ? "End Interview" : "Interview Complete!"}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </div>
  );
}
