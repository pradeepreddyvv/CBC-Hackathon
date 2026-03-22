"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { SpeechmaticsSTT } from "@/lib/speechmatics";

// ── Types ───────────────────────────────────────────────────────

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
  onAnswerRecorded?: (questionIndex: number, answer: string, audioUrl?: string, durationSec?: number) => void;
  onFeedbackReceived?: (questionIndex: number, question: string, answer: string, analysis: Record<string, any>, humanizedFeedback: string, durationSec: number) => void;
  onSessionComplete?: (answers: AnswerRecord3D[], sessionAnalysis: Record<string, any>) => void;
  onInterviewStart?: () => void;
  companyName?: string;
  profile?: { name: string; background: string; targetRole: string; targetCompany: string; experience: string; skills: string; country?: string };
  userId?: string;
  sessionId?: string;
  role?: string;
}

type TtsState = {
  currentTurn: number;
  utterance: SpeechSynthesisUtterance | null;
};

// ── 3D Scene Builders (from user's InterviewReplay) ─────────────

function buildPerson(skinColor: number, suitColor: number, hairColor: number) {
  const group   = new THREE.Group();
  const skin    = new THREE.MeshLambertMaterial({ color: skinColor });
  const suit    = new THREE.MeshLambertMaterial({ color: suitColor });
  const hairMat = new THREE.MeshLambertMaterial({ color: hairColor });
  const dark    = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const white   = new THREE.MeshLambertMaterial({ color: 0xf0f0f0 });
  const pants   = new THREE.MeshLambertMaterial({ color: 0x0f1520 });
  const shoeMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, castShadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    if (castShadow) m.castShadow = true;
    group.add(m);
    return m;
  };

  // Head
  const head = add(new THREE.SphereGeometry(0.185, 24, 24), skin, 0, 1.08, 0);

  // Mouth
  const mouthMat = new THREE.MeshLambertMaterial({ color: 0x331111 });
  const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.015, 0.03), mouthMat);
  mouth.position.set(0, 1.01, 0.17);
  mouth.name = "mouth";
  group.add(mouth);

  // Hair cap
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.19, 20, 12), hairMat);
  hairCap.scale.y = 0.52;
  hairCap.position.set(0, 1.19, -0.01);
  group.add(hairCap);

  // Eyes
  [-0.075, 0.075].forEach(x => {
    add(new THREE.SphereGeometry(0.026, 8, 8), dark, x, 1.1, 0.158);
    const gleam = new THREE.Mesh(new THREE.SphereGeometry(0.008, 6, 6), white);
    gleam.position.set(x + 0.01, 1.112, 0.178);
    group.add(gleam);
  });

  // Nose
  add(new THREE.SphereGeometry(0.018, 6, 6), skin, 0, 1.055, 0.178);

  // Collar
  add(new THREE.BoxGeometry(0.095, 0.12, 0.015), white, 0, 0.895, 0.095);

  // Torso
  add(new THREE.BoxGeometry(0.36, 0.44, 0.22), suit, 0, 0.775, 0);

  // Shoulders
  [-0.22, 0.22].forEach(x => add(new THREE.BoxGeometry(0.14, 0.13, 0.22), suit, x, 0.935, 0));

  // Upper arms
  [-0.265, 0.265].forEach(x => add(new THREE.BoxGeometry(0.1, 0.3, 0.1), suit, x, 0.77, 0));

  // Forearms
  [-0.265, 0.265].forEach(x => add(new THREE.BoxGeometry(0.09, 0.1, 0.3), suit, x, 0.635, 0.15));

  // Hands
  [-0.265, 0.265].forEach(x => add(new THREE.SphereGeometry(0.058, 8, 8), skin, x, 0.635, 0.29));

  // Upper legs (sitting)
  [-0.11, 0.11].forEach(x => add(new THREE.BoxGeometry(0.12, 0.11, 0.44), pants, x, 0.5, 0.22));

  // Lower legs
  [-0.11, 0.11].forEach(x => add(new THREE.BoxGeometry(0.1, 0.38, 0.1), pants, x, 0.3, 0.45));

  // Shoes
  [-0.11, 0.11].forEach(x => add(new THREE.BoxGeometry(0.13, 0.07, 0.24), shoeMat, x, 0.12, 0.52));

  return { group, head, mouth };
}

function buildChair() {
  const group  = new THREE.Group();
  const body   = new THREE.MeshLambertMaterial({ color: 0x1e2535 });
  const metal  = new THREE.MeshLambertMaterial({ color: 0x778899 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(0.54, 0.07, 0.54), body, 0, 0.47, 0);
  add(new THREE.BoxGeometry(0.54, 0.64, 0.065), body, 0, 0.825, -0.265);
  add(new THREE.BoxGeometry(0.38, 0.2, 0.065), body, 0, 1.12, -0.265);

  const legGeo = new THREE.CylinderGeometry(0.026, 0.026, 0.46, 8);
  ([[-0.22, -0.22], [0.22, -0.22], [-0.22, 0.22], [0.22, 0.22]] as [number, number][]).forEach(([x, z]) => add(legGeo, metal, x, 0.23, z));

  [-0.285, 0.285].forEach(x => add(new THREE.BoxGeometry(0.065, 0.05, 0.36), body, x, 0.705, -0.075));

  return group;
}

function buildTable() {
  const group  = new THREE.Group();
  const wood   = new THREE.MeshLambertMaterial({ color: 0x3d2b1f });
  const edge   = new THREE.MeshLambertMaterial({ color: 0x4a3525 });
  const metal  = new THREE.MeshLambertMaterial({ color: 0x556677 });
  const screenMat = new THREE.MeshLambertMaterial({ color: 0x1a3a6a, emissive: 0x0a2050, emissiveIntensity: 0.7 });

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, px: number, py: number, pz: number, castShadow = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(px, py, pz);
    if (castShadow) m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  add(new THREE.BoxGeometry(1.65, 0.068, 0.75), wood, 0, 0.735, 0);
  add(new THREE.BoxGeometry(1.67, 0.03, 0.77), edge, 0, 0.715, 0);

  const legGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.73, 10);
  ([[-0.74, -0.31], [0.74, -0.31], [-0.74, 0.31], [0.74, 0.31]] as [number, number][]).forEach(([x, z]) => add(legGeo, metal, x, 0.365, z));

  // Laptop
  add(new THREE.BoxGeometry(0.36, 0.018, 0.26), new THREE.MeshLambertMaterial({ color: 0x252535 }), 0.52, 0.77, 0.08);
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 0.013), screenMat);
  screen.position.set(0.52, 0.89, -0.04);
  screen.rotation.x = -0.38;
  group.add(screen);

  // Notepad
  add(new THREE.BoxGeometry(0.27, 0.009, 0.34), new THREE.MeshLambertMaterial({ color: 0xf2edd8 }), -0.52, 0.772, 0.02, false);
  for (let i = 0; i < 4; i++) {
    add(new THREE.BoxGeometry(0.19, 0.004, 0.007), new THREE.MeshLambertMaterial({ color: 0xbbbbaa }), -0.52, 0.778, -0.12 + i * 0.07, false);
  }

  // Pen
  const pen = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.21, 8), new THREE.MeshLambertMaterial({ color: 0x223388 }));
  pen.rotation.z = Math.PI / 2;
  pen.position.set(-0.4, 0.775, 0.12);
  group.add(pen);

  // Water glass
  add(new THREE.CylinderGeometry(0.033, 0.026, 0.1, 12), new THREE.MeshLambertMaterial({ color: 0x88aabb, transparent: true, opacity: 0.45 }), 0.06, 0.79, -0.2, false);

  return group;
}

function buildOffice(scene: THREE.Scene) {
  const floorMat = new THREE.MeshLambertMaterial({ color: 0x0e0c08 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Rug
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 2.4), new THREE.MeshLambertMaterial({ color: 0x181228 }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.002;
  scene.add(rug);

  // Back wall
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), new THREE.MeshLambertMaterial({ color: 0x0d1322 }));
  wall.position.set(0, 4, -5);
  wall.receiveShadow = true;
  scene.add(wall);

  // Left wall
  const lw = new THREE.Mesh(new THREE.PlaneGeometry(14, 8), new THREE.MeshLambertMaterial({ color: 0x0a0f1c }));
  lw.rotation.y = Math.PI / 2;
  lw.position.set(-5, 4, 0);
  scene.add(lw);

  // Ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(16, 16), new THREE.MeshLambertMaterial({ color: 0x070a12 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.y = 4.5;
  scene.add(ceil);

  // Window
  const wFrame = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.5, 0.07), new THREE.MeshLambertMaterial({ color: 0x182030 }));
  wFrame.position.set(0, 2.6, -4.95);
  scene.add(wFrame);
  const wGlass = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.28), new THREE.MeshLambertMaterial({ color: 0x304070, emissive: 0x182848, emissiveIntensity: 1.4 }));
  wGlass.position.set(0, 2.6, -4.92);
  scene.add(wGlass);
  const wH = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.04, 0.02), new THREE.MeshLambertMaterial({ color: 0x182030 }));
  wH.position.set(0, 2.6, -4.91);
  scene.add(wH);
  const wV = new THREE.Mesh(new THREE.BoxGeometry(0.04, 1.28, 0.02), new THREE.MeshLambertMaterial({ color: 0x182030 }));
  wV.position.set(0, 2.6, -4.91);
  scene.add(wV);

  // Ceiling light panel
  const lightPanel = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.5), new THREE.MeshLambertMaterial({ color: 0x888899, emissive: 0xfff0cc, emissiveIntensity: 0.7 }));
  lightPanel.position.set(0, 4.46, 0);
  scene.add(lightPanel);

  // Bookshelf
  const shelfBody = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.0, 1.1), new THREE.MeshLambertMaterial({ color: 0x1a1208 }));
  shelfBody.position.set(4.0, 1.0, -1.6);
  shelfBody.castShadow = true;
  scene.add(shelfBody);
  const bookColors = [0x1e3a5f, 0x2d1b4e, 0x1a3a2a, 0x3a1a1a, 0x2a2a1a, 0x1a2a3a, 0x3a2a1a, 0x2a1a3a, 0x1e3030, 0x30201a];
  for (let row = 0; row < 3; row++) {
    let z = -2.1;
    for (let b = 0; b < 5; b++) {
      const w = 0.055 + Math.random() * 0.04;
      const h = 0.3 + Math.random() * 0.12;
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.22, h, w), new THREE.MeshLambertMaterial({ color: bookColors[(row * 5 + b) % bookColors.length] }));
      book.position.set(3.88, 0.18 + row * 0.48, z + w / 2);
      z += w + 0.01;
      book.castShadow = true;
      scene.add(book);
    }
  }

  // Plant
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.25, 12), new THREE.MeshLambertMaterial({ color: 0x5a3518 }));
  pot.position.set(-3.5, 0.125, -2.2);
  pot.castShadow = true;
  scene.add(pot);
  const plant = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshLambertMaterial({ color: 0x1a3a12 }));
  plant.scale.y = 1.25;
  plant.position.set(-3.5, 0.65, -2.2);
  plant.castShadow = true;
  scene.add(plant);
}

// ── Speech Bubble Component ─────────────────────────────────────

function SpeechBubble({ text, side, visible, isQuestion }: { text: string; side: "left" | "right"; visible: boolean; isQuestion: boolean }) {
  const isLeft = side === "left";
  return (
    <div style={{
      maxWidth: 300, minWidth: 120,
      background: isQuestion ? "linear-gradient(135deg,#1e3a5f,#163050)" : "linear-gradient(135deg,#2d1b4e,#1f1038)",
      border: `1px solid ${isQuestion ? "rgba(96,165,250,0.35)" : "rgba(192,132,252,0.35)"}`,
      borderRadius: isLeft ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
      padding: "9px 13px", position: "relative",
      boxShadow: `0 6px 28px ${isQuestion ? "rgba(96,165,250,0.2)" : "rgba(192,132,252,0.2)"}`,
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.94)",
      transition: "all 0.4s cubic-bezier(0.34,1.2,0.64,1)",
      pointerEvents: "none" as const,
    }}>
      <div style={{ fontSize: 9, letterSpacing: 2, textTransform: "uppercase", marginBottom: 5, color: isQuestion ? "rgba(96,165,250,0.9)" : "rgba(192,132,252,0.9)" }}>
        {isQuestion ? "Interviewer" : "You"}
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.92)", lineHeight: 1.55 }}>{text}</div>
      <div style={{
        position: "absolute", bottom: -8,
        ...(isLeft ? { left: 14 } : { right: 14 }),
        width: 0, height: 0,
        borderLeft: "8px solid transparent", borderRight: "8px solid transparent",
        borderTop: `8px solid ${isQuestion ? "#163050" : "#1f1038"}`,
      }} />
    </div>
  );
}

// ── Score Ring for feedback ──────────────────────────────────────

function ScoreRing({ score, size = 60, stroke = 5 }: { score: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const [progress, setProgress] = useState(0);
  useEffect(() => { const t = setTimeout(() => setProgress(score), 400); return () => clearTimeout(t); }, [score]);
  const color = score >= 80 ? "#4ade80" : score >= 60 ? "#facc15" : "#f87171";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={circ - (circ * progress) / 100}
        style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.34,1.56,0.64,1)" }} />
    </svg>
  );
}

// ── Default questions ───────────────────────────────────────────

const DEFAULT_QUESTIONS = [
  "Tell me about a time you led a challenging technical project. What was the situation, what did you do, and what was the outcome?",
  "Describe a situation where you had to work with a difficult team member. How did you handle it?",
  "Tell me about a time you failed. What did you learn from it?",
];

// ── Main Component ──────────────────────────────────────────────

export default function InterviewArtifactScene({ questions, onAnswerRecorded, onFeedbackReceived, onSessionComplete, onInterviewStart, companyName, profile, userId, sessionId, role }: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const ttsRef = useRef<TtsState>({ currentTurn: -1, utterance: null });

  // 3D refs
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const ivHeadRef = useRef<THREE.Mesh | null>(null);
  const cdHeadRef = useRef<THREE.Mesh | null>(null);
  const ivMouthRef = useRef<THREE.Mesh | null>(null);
  const cdMouthRef = useRef<THREE.Mesh | null>(null);
  const glowRef = useRef<THREE.PointLight | null>(null);
  const activeSpeakerRef = useRef(0); // 0=none 1=interviewer 2=candidate
  const clockRef = useRef<THREE.Clock | null>(null);
  const animIdRef = useRef(0);

  // HTML bubble position refs
  const leftWrapRef = useRef<HTMLDivElement | null>(null);
  const rightWrapRef = useRef<HTMLDivElement | null>(null);

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
  const [spokenWordIdx, setSpokenWordIdx] = useState(-1);

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
  const [followUpFlags, setFollowUpFlags] = useState<boolean[]>(interviewQs.map(() => false));
  const [autoFeedbackDone, setAutoFeedbackDone] = useState(false);

  // Sync active speaker ref for 3D animation
  useEffect(() => {
    if (interviewerTalking) activeSpeakerRef.current = 1;
    else if (candidateTalking) activeSpeakerRef.current = 2;
    else activeSpeakerRef.current = 0;
  }, [interviewerTalking, candidateTalking]);

  // ── Three.js setup ────────────────────────────────────────────

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth || 700;
    const H = mount.clientHeight || 480;

    // Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x060c16);
    scene.fog = new THREE.FogExp2(0x060c16, 0.065);

    // Camera
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 50);
    camera.position.set(0, 2.55, 4.8);
    camera.lookAt(0, 0.85, 0);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // ── Lights ──────────────────────────────────────────────────
    scene.add(new THREE.AmbientLight(0x1a2240, 1.0));

    const key = new THREE.DirectionalLight(0xfff0d0, 1.9);
    key.position.set(3, 5.5, 4);
    key.castShadow = true;
    key.shadow.mapSize.setScalar(2048);
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 22;
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0x4070ff, 0.42);
    fill.position.set(-2, 3, -2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0x203080, 0.28);
    rim.position.set(0, 4, -5);
    scene.add(rim);

    const glow = new THREE.PointLight(0x5588ff, 0, 3.0);
    glow.position.set(-1.3, 1.35, 0.1);
    scene.add(glow);
    glowRef.current = glow;

    // ── Environment ─────────────────────────────────────────────
    buildOffice(scene);
    scene.add(buildTable());

    // ── Interviewer (left) ──────────────────────────────────────
    const ivChair = buildChair();
    ivChair.position.set(-1.28, 0, 0.1);
    ivChair.rotation.y = Math.PI / 2;
    scene.add(ivChair);

    const { group: ivGroup, head: ivHead, mouth: ivMouth } = buildPerson(0xf0c27f, 0x1e3a5f, 0x180e04);
    ivGroup.position.set(-1.28, 0, 0.1);
    ivGroup.rotation.y = Math.PI / 2;
    scene.add(ivGroup);
    ivHeadRef.current = ivHead;
    ivMouthRef.current = ivMouth;

    // ── Candidate (right) ───────────────────────────────────────
    const cdChair = buildChair();
    cdChair.position.set(1.28, 0, 0.1);
    cdChair.rotation.y = -Math.PI / 2;
    scene.add(cdChair);

    const { group: cdGroup, head: cdHead, mouth: cdMouth } = buildPerson(0xdba87a, 0x2d1b4e, 0x8B4513);
    cdGroup.position.set(1.28, 0, 0.1);
    cdGroup.rotation.y = -Math.PI / 2;
    scene.add(cdGroup);
    cdHeadRef.current = cdHead;
    cdMouthRef.current = cdMouth;

    clockRef.current = new THREE.Clock();

    // ── Bubble Position Updater ─────────────────────────────────
    const updateBubbles = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      const cam = cameraRef.current;
      const cvs = rendererRef.current.domElement;
      const cw = cvs.clientWidth;
      const ch = cvs.clientHeight;

      const ivPos = new THREE.Vector3();
      ivHead.getWorldPosition(ivPos);
      const iv2d = ivPos.clone().project(cam);
      const ivX = (iv2d.x * 0.5 + 0.5) * cw;
      const ivY = (-iv2d.y * 0.5 + 0.5) * ch;

      const cdPos = new THREE.Vector3();
      cdHead.getWorldPosition(cdPos);
      const cd2d = cdPos.clone().project(cam);
      const cdX = (cd2d.x * 0.5 + 0.5) * cw;
      const cdY = (-cd2d.y * 0.5 + 0.5) * ch;

      if (leftWrapRef.current) {
        leftWrapRef.current.style.left = `${ivX}px`;
        leftWrapRef.current.style.top = `${ivY - 155}px`;
        leftWrapRef.current.style.bottom = "auto";
      }
      if (rightWrapRef.current) {
        rightWrapRef.current.style.right = `${cw - cdX}px`;
        rightWrapRef.current.style.top = `${cdY - 155}px`;
        rightWrapRef.current.style.left = "auto";
        rightWrapRef.current.style.bottom = "auto";
      }
    };

    // ── Animation Loop ──────────────────────────────────────────
    const animate = () => {
      animIdRef.current = requestAnimationFrame(animate);
      const t = clockRef.current!.getElapsedTime();
      const spk = activeSpeakerRef.current;

      // Head bobs
      if (ivHeadRef.current) ivHeadRef.current.position.y = 1.08 + (spk === 1 ? Math.sin(t * 4.2) * 0.013 : Math.sin(t * 0.9) * 0.004);
      if (cdHeadRef.current) cdHeadRef.current.position.y = 1.08 + (spk === 2 ? Math.sin(t * 4.0 + 0.6) * 0.013 : Math.sin(t * 0.85 + 1.2) * 0.004);

      // Mouth animation — open/close when speaking
      if (ivMouthRef.current) {
        const openAmt = spk === 1
          ? 0.015 + Math.abs(Math.sin(t * 12.5)) * 0.035 + Math.abs(Math.sin(t * 7.3)) * 0.015
          : 0.015;
        ivMouthRef.current.scale.y = openAmt / 0.015;
        ivMouthRef.current.position.y = 1.01 - (openAmt - 0.015) * 0.5;
      }
      if (cdMouthRef.current) {
        const openAmt = spk === 2
          ? 0.015 + Math.abs(Math.sin(t * 11.8 + 0.4)) * 0.035 + Math.abs(Math.sin(t * 6.9 + 0.7)) * 0.015
          : 0.015;
        cdMouthRef.current.scale.y = openAmt / 0.015;
        cdMouthRef.current.position.y = 1.01 - (openAmt - 0.015) * 0.5;
      }

      // Speaker glow
      if (glowRef.current) {
        const g = glowRef.current;
        if (spk === 1) {
          g.position.set(-1.28, 1.4, 0.1);
          g.color.setHex(0x5080ff);
          g.intensity = 0.9 + Math.sin(t * 5.2) * 0.14;
        } else if (spk === 2) {
          g.position.set(1.28, 1.4, 0.1);
          g.color.setHex(0x9050ff);
          g.intensity = 0.9 + Math.sin(t * 5.0) * 0.14;
        } else {
          g.intensity = Math.max(0, g.intensity - 0.06);
        }
      }

      // Subtle camera breathe
      camera.position.x = Math.sin(t * 0.11) * 0.065;
      camera.position.y = 2.55 + Math.sin(t * 0.085) * 0.042;
      camera.lookAt(0, 0.85, 0);

      updateBubbles();
      renderer.render(scene, camera);
    };
    animIdRef.current = requestAnimationFrame(animate);

    // Resize
    const onResize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      cancelAnimationFrame(animIdRef.current);
      window.speechSynthesis?.cancel();
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setShowQuestionText(true);
    setSpokenWordIdx(-1);

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

    const words = questionText.split(" ");
    let wordIdx = 0;

    utter.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name !== "word") return;
      const spokenSoFar = questionText.substring(0, e.charIndex + e.charLength).trim();
      wordIdx = spokenSoFar.split(/\s+/).length - 1;
      setSpokenWordIdx(wordIdx);
      setBubbleText(words.slice(Math.max(0, wordIdx - 6), wordIdx + 1).join(" "));
    };

    utter.onend = () => {
      setInterviewerTalking(false);
      setSpokenWordIdx(words.length);
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

    const handleTranscript = (fullText: string) => {
      fullTranscriptRef.current = fullText;
      setTranscript(fullText);
      const words = fullText.trim().split(" ");
      setBubbleText(words.slice(-7).join(" "));
    };

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

    timerRef.current = setInterval(() => {
      setRecordingSeconds((s) => s + 1);
    }, 1000);
  }, [isRecording]);

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

    if (smSttRef.current) {
      const finalText = smSttRef.current.stop();
      if (finalText) fullTranscriptRef.current = finalText;
      smSttRef.current = null;
    }

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
      const record: AnswerRecord3D = {
        questionIndex: currentQIdx,
        question: allQuestions[currentQIdx],
        answer: finalText,
        audioUrl,
        durationSec,
      };
      setAllAnswers(prev => [...prev, record]);

      if (onAnswerRecorded) {
        setTimeout(() => onAnswerRecorded(currentQIdx, finalText, audioUrl, durationSec), 200);
      }
    }

    setMode("reviewing");
    setAutoFeedbackDone(false);
  }, [currentQIdx, onAnswerRecorded, allQuestions]);

  // ── Feedback functions ──────────────────────────────────────────

  const requestFeedback = useCallback(async (fMode: "single" | "session") => {
    setFeedbackMode(fMode);
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

      if (fMode === "single") {
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

      if (fMode === "single" && data.analysis) {
        setAllAnswers(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last) {
            last.analysis = data.analysis;
            last.humanizedFeedback = data.humanized?.spoken_feedback;
            // Sync feedback to DB
            if (onFeedbackReceived) {
              onFeedbackReceived(last.questionIndex, last.question, last.answer, data.analysis, data.humanized?.spoken_feedback || "", last.durationSec);
            }
          }
          return updated;
        });
      }

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

      if (data.analysis) {
        const weakAreas = fMode === "single"
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
  }, [allAnswers, allQuestions, companyName, role, profile, onFeedbackReceived]);

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
      const next = currentQIdx + 1;
      setCurrentQIdx(next);
      setTranscript("");
      setBubbleText("");
      setMode("asking");
      askQuestion(next);
    } else {
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

  const sc = (s: number) => s >= 80 ? "#4ade80" : s >= 60 ? "#facc15" : "#f87171";

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", width: "100%", height: "100vh", background: "#060c16", display: "flex", flexDirection: "column", position: "relative", userSelect: "none" }}>
      {/* Three.js canvas */}
      <div ref={mountRef} style={{ flex: 1, overflow: "hidden", position: "relative" }}>

        {/* Left bubble (interviewer) — positioned by 3D projection */}
        <div ref={leftWrapRef} style={{ position: "absolute", zIndex: 10, pointerEvents: "none" }}>
          <SpeechBubble
            text={activeSpeaker === "interviewer" ? bubbleText : ""}
            side="left"
            visible={!!bubbleText && activeSpeaker === "interviewer" && mode !== "intro"}
            isQuestion={true}
          />
        </div>

        {/* Right bubble (candidate) — positioned by 3D projection */}
        <div ref={rightWrapRef} style={{ position: "absolute", zIndex: 10, pointerEvents: "none" }}>
          <SpeechBubble
            text={activeSpeaker === "candidate" ? bubbleText : ""}
            side="right"
            visible={!!bubbleText && activeSpeaker === "candidate" && mode !== "intro"}
            isQuestion={false}
          />
        </div>

        {/* Progress dots */}
        {mode !== "intro" && (
          <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 10 }}>
            {allQuestions.map((_, i) => (
              <div key={i} style={{
                width: i === currentQIdx ? 20 : 6, height: 6, borderRadius: 99,
                background: i < currentQIdx ? "#4ade80" : i === currentQIdx ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.18)",
                transition: "all 0.3s ease",
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Speaker label */}
      <div style={{
        position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
        background: "rgba(6,12,22,0.85)", borderRadius: 999, padding: "6px 20px",
        color: mode === "feedback" ? "#facc15" : activeSpeaker === "interviewer" ? "#60a5fa" : "#c084fc",
        fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
        border: `1px solid ${mode === "feedback" ? "rgba(250,204,21,0.3)" : activeSpeaker === "interviewer" ? "rgba(96,165,250,0.3)" : "rgba(192,132,252,0.3)"}`,
        backdropFilter: "blur(8px)", zIndex: 20,
        marginTop: 26,
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
          position: "absolute", top: 44, right: 20,
          display: "flex", alignItems: "center", gap: 8, zIndex: 20,
        }}>
          {/* Feedback button */}
          {(mode === "reviewing" || mode === "recording" && !isRecording) && allAnswers.length > 0 && (
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowFeedbackMenu(v => !v)}
                title="Get interviewer feedback"
                style={{
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer",
                  background: "rgba(250,204,21,0.2)", color: "#facc15",
                  fontSize: 12, fontWeight: 700, border: "1px solid rgba(250,204,21,0.4)",
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                Feedback
              </button>
              {showFeedbackMenu && (
                <div style={{
                  position: "absolute", top: 40, right: 0, width: 200,
                  background: "rgba(6,12,22,0.95)", borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)", overflow: "hidden",
                  boxShadow: "0 8px 32px rgba(0,0,0,0.6)", zIndex: 100,
                }}>
                  <button
                    onClick={() => requestFeedback("single")}
                    style={{
                      width: "100%", padding: "12px 14px", border: "none", cursor: "pointer",
                      background: "transparent", color: "#e2e8f0", fontSize: 13, textAlign: "left",
                      borderBottom: "1px solid rgba(255,255,255,0.08)",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(250,204,21,0.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 700, color: "#facc15" }}>This Question</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Analyze your last answer</div>
                  </button>
                  <button
                    onClick={() => requestFeedback("session")}
                    style={{
                      width: "100%", padding: "12px 14px", border: "none", cursor: "pointer",
                      background: "transparent", color: "#e2e8f0", fontSize: 13, textAlign: "left",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = "rgba(250,204,21,0.1)")}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                  >
                    <div style={{ fontWeight: 700, color: "#facc15" }}>All Questions</div>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Full session analysis ({allAnswers.length} answers)</div>
                  </button>
                </div>
              )}
            </div>
          )}

          <div style={{
            background: "rgba(6,12,22,0.85)", borderRadius: 999, padding: "6px 16px",
            color: followUpFlags[currentQIdx] ? "#facc15" : "#94a3b8",
            fontSize: 12, fontWeight: 600,
            border: `1px solid ${followUpFlags[currentQIdx] ? "rgba(250,204,21,0.3)" : "rgba(255,255,255,0.1)"}`,
          }}>
            {followUpFlags[currentQIdx] ? "Follow-up" : `Q${currentQIdx + 1}`} / {allQuestions.length}
          </div>
        </div>
      )}

      {/* Transcript / question / feedback display */}
      {mode !== "intro" && (
        <div style={{
          position: "absolute", bottom: 110, left: "50%", transform: "translateX(-50%)",
          width: "88%", maxWidth: 750,
          background: "rgba(6,12,22,0.92)", borderRadius: 14, padding: "14px 20px",
          minHeight: 50, maxHeight: mode === "feedback" ? 380 : 280,
          overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)",
          zIndex: 20,
          boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}>
          {mode === "asking" && (
            <div style={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.7 }}>
              <span style={{ color: followUpFlags[currentQIdx] ? "#facc15" : "#60a5fa", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, display: "block", marginBottom: 8 }}>
                {followUpFlags[currentQIdx] ? "Follow-up Question" : `Question ${currentQIdx + 1}`}
              </span>
              <div style={{ fontSize: 16, lineHeight: 1.7, letterSpacing: 0.2 }}>
                {allQuestions[currentQIdx].split(" ").map((word, i) => (
                  <span key={i} style={{
                    color: spokenWordIdx >= i ? "#ffffff" : "rgba(148,163,184,0.5)",
                    fontWeight: spokenWordIdx === i ? 800 : spokenWordIdx >= i ? 600 : 400,
                    background: spokenWordIdx === i ? "rgba(96,165,250,0.25)" : "transparent",
                    borderRadius: spokenWordIdx === i ? 4 : 0,
                    padding: spokenWordIdx === i ? "1px 4px" : "0 1px",
                    transition: "all 0.15s ease",
                  }}>
                    {word}{" "}
                  </span>
                ))}
              </div>
            </div>
          )}
          {mode === "recording" && (
            <div>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 8, padding: "6px 10px", background: "rgba(96,165,250,0.08)", borderRadius: 8, borderLeft: "3px solid #60a5fa" }}>
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>Q:</span> {allQuestions[currentQIdx]}
              </div>
              <div style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.6 }}>
                {transcript || <span style={{ color: "#475569", fontStyle: "italic" }}>Listening... speak your answer</span>}
              </div>
            </div>
          )}
          {mode === "reviewing" && (
            <div>
              <div style={{ color: "#94a3b8", fontSize: 11, marginBottom: 4, padding: "5px 10px", background: "rgba(96,165,250,0.06)", borderRadius: 6, borderLeft: "3px solid #60a5fa" }}>
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>Q:</span> {allQuestions[currentQIdx]}
              </div>
              <div style={{ marginTop: 10, marginBottom: 8 }}>
                <span style={{ color: "#c084fc", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5 }}>Your Answer:</span>
              </div>
              <div style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.7, maxHeight: 180, overflowY: "auto", paddingRight: 6 }}>
                {transcript || "No transcript captured"}
              </div>
            </div>
          )}

          {/* Feedback display */}
          {mode === "feedback" && (
            <div>
              {feedbackLoading ? (
                <div style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ color: "#facc15", fontSize: 14, fontWeight: 700, marginBottom: 8, animation: "pulse 1.5s infinite" }}>
                    {feedbackMode === "single" ? "Analyzing your answer..." : "Analyzing full session..."}
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>Gemini is analyzing, then Claude will humanize the feedback</div>
                </div>
              ) : feedbackData ? (
                <div>
                  {/* Humanized spoken feedback */}
                  <div style={{ marginBottom: 12, padding: "10px 12px", background: "rgba(250,204,21,0.06)", borderRadius: 8, borderLeft: "3px solid #facc15" }}>
                    <div style={{ color: "#facc15", fontSize: 11, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                      Interviewer says{feedbackSpeaking ? " (speaking...)" : ""}:
                    </div>
                    <div style={{ color: "#e2e8f0", fontSize: 14, lineHeight: 1.6, fontStyle: "italic" }}>
                      &ldquo;{feedbackData.humanized?.spoken_feedback || "No feedback available"}&rdquo;
                    </div>
                  </div>

                  {/* Scores */}
                  {feedbackData.analysis && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                      <div style={{ background: "rgba(96,165,250,0.08)", borderRadius: 8, padding: "8px 14px", minWidth: 80, display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ position: "relative", width: 48, height: 48 }}>
                          <ScoreRing score={(feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || 0} size={48} stroke={4} />
                          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <span style={{ fontSize: 14, fontWeight: 800, color: sc((feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || 0) }}>
                              {(feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || "—"}
                            </span>
                          </div>
                        </div>
                        <div>
                          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Score</div>
                        </div>
                      </div>
                      {(feedbackData.analysis as any).readiness_label && (
                        <div style={{ background: "rgba(74,222,128,0.08)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Readiness</div>
                          <div style={{ color: "#4ade80", fontSize: 14, fontWeight: 700 }}>
                            {(feedbackData.analysis as any).readiness_label}
                          </div>
                        </div>
                      )}
                      {(feedbackData.analysis as any).hiring_recommendation && (
                        <div style={{ background: "rgba(250,204,21,0.08)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Recommendation</div>
                          <div style={{ color: "#facc15", fontSize: 14, fontWeight: 700 }}>
                            {(feedbackData.analysis as any).hiring_recommendation}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* STAR scores */}
                  {(feedbackData.analysis as any)?.star_scores && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>STAR Framework</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        {Object.entries((feedbackData.analysis as any).star_scores).map(([key, val]) => (
                          <div key={key} style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "6px 4px" }}>
                            <div style={{ fontSize: 18, fontWeight: 800, color: sc(val as number) }}>{val as number}</div>
                            <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "capitalize" }}>{key}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Dimension scores */}
                  {(feedbackData.analysis as any)?.dimension_scores && (
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Dimensions</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {Object.entries((feedbackData.analysis as any).dimension_scores).map(([key, val]) => (
                          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "3px 8px" }}>
                            <span style={{ color: "#94a3b8", fontSize: 10, textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</span>
                            <span style={{ color: sc(val as number), fontSize: 12, fontWeight: 700 }}>{val as number}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Strengths & improvements */}
                  {((feedbackData.analysis as any)?.strengths || (feedbackData.analysis as any)?.strengths_to_leverage) && (
                    <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#4ade80", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>STRENGTHS</div>
                        {((feedbackData.analysis as any).strengths || (feedbackData.analysis as any).strengths_to_leverage || []).slice(0, 3).map((s: string, i: number) => (
                          <div key={i} style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>+ {s}</div>
                        ))}
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ color: "#f87171", fontSize: 10, fontWeight: 700, marginBottom: 3 }}>IMPROVE</div>
                        {((feedbackData.analysis as any).improvements || (feedbackData.analysis as any).top_3_focus_areas || []).slice(0, 3).map((s: string, i: number) => (
                          <div key={i} style={{ color: "#94a3b8", fontSize: 11, marginBottom: 2 }}>- {s}</div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Adaptive questions notice */}
                  {adaptiveQs.length > 0 && (
                    <div style={{ background: "rgba(96,165,250,0.08)", borderRadius: 6, padding: "6px 10px", marginTop: 6 }}>
                      <div style={{ color: "#60a5fa", fontSize: 11, fontWeight: 700 }}>
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
        background: "rgba(6,12,22,0.92)", borderRadius: 16, padding: "13px 20px",
        border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(10px)",
        display: "flex", alignItems: "center", gap: 14, zIndex: 20,
      }}>
        {/* Intro — Start button */}
        {mode === "intro" && (
          <button onClick={startInterview} style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "1px solid rgba(96,165,250,0.45)", cursor: "pointer",
            background: "linear-gradient(135deg,#1e3a5f,#163050)", color: "white",
            fontSize: 16, fontWeight: 700, boxShadow: "0 0 30px rgba(96,165,250,0.18)",
            letterSpacing: 0.5,
          }}>
            Start Interview ({allQuestions.length} Questions)
          </button>
        )}

        {/* Asking */}
        {mode === "asking" && (
          <div style={{ width: "100%", textAlign: "center", color: "#60a5fa", fontSize: 14, fontWeight: 600 }}>
            <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>
              Interviewer is speaking...
            </span>
          </div>
        )}

        {/* Recording controls */}
        {mode === "recording" && !isRecording && (
          <button onClick={startRecording} style={{
            width: "100%", padding: "14px 0", borderRadius: 12, border: "1px solid rgba(74,222,128,0.45)", cursor: "pointer",
            background: "linear-gradient(135deg, #1a3a2a, #163028)", color: "white",
            fontSize: 16, fontWeight: 700, boxShadow: "0 0 30px rgba(74,222,128,0.18)",
          }}>
            Start Recording Your Answer
          </button>
        )}

        {mode === "recording" && isRecording && (
          <>
            <button onClick={stopRecording} style={{
              width: 48, height: 48, borderRadius: "50%", border: "2px solid #f87171", cursor: "pointer",
              background: "rgba(248,113,113,0.15)", color: "#f87171", fontSize: 20, flexShrink: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>
              ⏹
            </button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ color: "#f87171", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f87171", display: "inline-block", animation: "pulse 1s infinite" }} />
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
              flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid rgba(96,165,250,0.45)", cursor: "pointer",
              background: "linear-gradient(135deg,#1e3a5f,#163050)", color: "white",
              fontSize: 16, fontWeight: 700, boxShadow: "0 0 30px rgba(96,165,250,0.18)",
            }}>
              {currentQIdx < allQuestions.length - 1
                ? (followUpFlags[currentQIdx + 1] ? "Answer Follow-up" : "Next Question")
                : "Finish & Get Session Feedback"}
            </button>
          </div>
        )}

        {/* Feedback controls */}
        {mode === "feedback" && !feedbackLoading && feedbackData && (
          <div style={{ width: "100%", display: "flex", gap: 10 }}>
            {currentQIdx < allQuestions.length - 1 && (
              <button onClick={() => { closeFeedback(); nextQuestion(); }} style={{
                flex: 1, padding: "14px 0", borderRadius: 12, border: "1px solid rgba(96,165,250,0.45)", cursor: "pointer",
                background: "linear-gradient(135deg,#1e3a5f,#163050)", color: "white",
                fontSize: 16, fontWeight: 700,
              }}>
                Next Question
              </button>
            )}
            <button onClick={() => { closeFeedback(); setMode("intro"); setBubbleText(""); }} style={{
              flex: currentQIdx < allQuestions.length - 1 ? "none" : 1,
              padding: "14px 20px", borderRadius: 12, border: "1px solid rgba(74,222,128,0.45)", cursor: "pointer",
              background: currentQIdx < allQuestions.length - 1
                ? "rgba(255,255,255,0.05)"
                : "linear-gradient(135deg,#1a3a2a,#163028)",
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
