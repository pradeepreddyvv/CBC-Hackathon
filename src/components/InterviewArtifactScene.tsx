"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type BaseTurn = {
  speaker: "interviewer" | "candidate";
  text: string;
  duration: number;
};

type PreparedTurn = BaseTurn & {
  words: string[];
  wordTimings: number[];
  globalStart: number;
};

const SCRIPT_INPUT: BaseTurn[] = [
  {
    speaker: "interviewer",
    text: "Tell me about a time you led a challenging technical project. What was the situation, what did you do, and what was the outcome?",
    duration: 7000,
  },
  {
    speaker: "candidate",
    text: "Sure. At my last internship I led the optimization of our machine learning pipeline using Python and TensorFlow. I improved model accuracy by 20 percent by implementing batch normalization and tuning the learning rate schedule. We then deployed on AWS EC2 which reduced inference latency by 40 percent and enabled the product launch on schedule.",
    duration: 14000,
  },
];

const SCRIPT: PreparedTurn[] = (() => {
  let gDur = 0;
  return SCRIPT_INPUT.map((turn) => {
    const words = turn.text.split(" ");
    const prepared: PreparedTurn = {
      ...turn,
      words,
      wordTimings: words.map((_, i) => (i / words.length) * turn.duration),
      globalStart: gDur,
    };
    gDur += turn.duration;
    return prepared;
  });
})();

const TOTAL_DURATION = SCRIPT.reduce((sum, turn) => sum + turn.duration, 0);

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
    if (!text) {
      tex.needsUpdate = true;
      return;
    }

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
    wrap(text, 460)
      .slice(0, 3)
      .forEach((line, i) => ctx.fillText(line, 24, 44 + i * 34));

    tex.needsUpdate = true;
  }

  return { update };
}

export default function InterviewArtifactScene() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  const stateRef = useRef<RuntimeState>({
    playing: false,
    elapsed: 0,
    lastT: 0,
    blinkTimer: 0,
    blinkState: 0,
    renderedTurn: -1,
  });

  const ttsRef = useRef<TtsState>({ currentTurn: -1, utterance: null });
  const sceneRef = useRef<SceneRig | null>(null);

  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [timeStr, setTimeStr] = useState(`0:00 / ${fmt(TOTAL_DURATION)}`);
  const [speakerInfo, setSpeakerInfo] = useState({ label: "Press Play to start", color: "#6366f1" });
  const [words, setWords] = useState({ turnIdx: 0, activeWord: -1, list: SCRIPT[0].words });

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

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x0f0c29, roughness: 0.8 })
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

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

    const tTop = new THREE.Mesh(
      new THREE.BoxGeometry(5, 0.12, 1.8),
      new THREE.MeshStandardMaterial({ color: 0x4a2c0a, roughness: 0.4, metalness: 0.15 })
    );
    tTop.position.set(0, 1.0, 0);
    tTop.castShadow = true;
    tTop.receiveShadow = true;
    scene.add(tTop);

    [
      [-1.8, -0.7],
      [-1.8, 0.7],
      [1.8, -0.7],
      [1.8, 0.7],
    ].forEach(([x, z]) => {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x2d1a05 })
      );
      leg.position.set(x, 0.6, z);
      scene.add(leg);
    });

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

    [
      [-2.2, 0.55],
      [2.2, -0.55],
    ].forEach(([cx, ry]) => {
      const cg = new THREE.Group();
      const cM = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.7 });
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.06, 0.7), cM);
      seat.position.y = 0.6;
      cg.add(seat);

      const back = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.65, 0.06), cM);
      back.position.set(0, 0.94, -0.3);
      cg.add(back);

      [
        [-0.28, 0.28],
        [0.28, 0.28],
        [-0.28, -0.28],
        [0.28, -0.28],
      ].forEach(([px, pz]) => {
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
      const st = stateRef.current;
      const dt = st.lastT ? ts - st.lastT : 0;
      st.lastT = ts;

      if (st.playing) {
        st.elapsed += dt;
        if (st.elapsed >= TOTAL_DURATION) {
          st.elapsed = TOTAL_DURATION;
          st.playing = false;
          setPlaying(false);
        }
      }

      let ti = 0;
      let te = 0;
      for (let i = 0; i < SCRIPT.length; i++) {
        if (st.elapsed >= SCRIPT[i].globalStart) {
          ti = i;
          te = st.elapsed - SCRIPT[i].globalStart;
        }
      }

      const turn = SCRIPT[ti];
      let wi = 0;
      for (let j = 0; j < turn.wordTimings.length; j++) {
        if (te >= turn.wordTimings[j]) wi = j;
      }

      if (st.renderedTurn !== ti) {
        st.renderedTurn = ti;
        setWords({ turnIdx: ti, activeWord: wi, list: turn.words });
      } else {
        setWords((prev) => (prev.activeWord === wi ? prev : { ...prev, activeWord: wi }));
      }

      const bubbleTxt = turn.words.slice(0, wi + 1).slice(-7).join(" ");
      const isIV = turn.speaker === "interviewer";
      if (st.playing || st.elapsed > 0) {
        ivBubble.update(isIV ? bubbleTxt : "", "#6366f1");
        cdBubble.update(!isIV ? bubbleTxt : "", "#10b981");
      }

      setProgress((st.elapsed / TOTAL_DURATION) * 100);
      setTimeStr(`${fmt(st.elapsed)} / ${fmt(TOTAL_DURATION)}`);
      setSpeakerInfo({
        label: isIV ? "Interviewer" : "Candidate",
        color: isIV ? "#6366f1" : "#10b981",
      });

      const ivT = st.playing && isIV;
      const cdT = st.playing && !isIV;

      [
        { ch: iv, talking: ivT },
        { ch: cd, talking: cdT },
      ].forEach(({ ch, talking }) => {
        const s = talking ? Math.abs(Math.sin(ts / 100)) * 0.9 + 0.1 : 0;
        ch.mouthGrp.scale.y = 1 + s * 2.5;
        ch.mouthGrp.position.y = -0.13 - s * 0.04;
      });

      [
        { ch: iv, talking: ivT, listening: cdT },
        { ch: cd, talking: cdT, listening: ivT },
      ].forEach(({ ch, talking, listening }) => {
        ch.head.position.y = talking ? 1.82 + Math.sin(ts / 180) * 0.025 : 1.82;
        ch.head.rotation.x = listening ? Math.sin(ts / 900) * 0.05 : 0;
      });

      iv.head.rotation.z = !ivT && cdT ? Math.sin(ts / 700) * 0.04 : 0;
      cd.head.rotation.z = !cdT && ivT ? Math.sin(ts / 700) * 0.04 : 0;

      [
        { ch: iv, talking: ivT },
        { ch: cd, talking: cdT },
      ].forEach(({ ch, talking }) => {
        const sw = talking ? Math.sin(ts / 400) * 0.18 : 0;
        ch.lUA.rotation.z = Math.PI / 10 + sw;
        ch.rUA.rotation.z = -(Math.PI / 10 + sw);
      });

      st.blinkTimer += dt;
      if (st.blinkTimer > 3400) {
        st.blinkTimer = 0;
        st.blinkState = 1;
      }

      if (st.blinkState === 1) {
        [iv.lLid, iv.rLid, cd.lLid, cd.rLid].forEach((l) => {
          l.scale.y = Math.max(0.05, l.scale.y - 0.28);
        });
        if (iv.lLid.scale.y <= 0.05) st.blinkState = 2;
      } else if (st.blinkState === 2) {
        [iv.lLid, iv.rLid, cd.lLid, cd.rLid].forEach((l) => {
          l.scale.y = Math.min(1, l.scale.y + 0.32);
        });
        if (iv.lLid.scale.y >= 1) st.blinkState = 0;
      }

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
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  const stopSpeech = () => {
    window.speechSynthesis?.cancel();
    ttsRef.current.currentTurn = -1;
    ttsRef.current.utterance = null;
  };

  const pickVoice = (voices: SpeechSynthesisVoice[], prefs: string[]): SpeechSynthesisVoice | null => {
    for (const p of prefs) {
      const v = voices.find((voice) => voice.name.includes(p) || voice.lang === p);
      if (v) return v;
    }
    return voices.find((voice) => voice.lang.startsWith("en")) || null;
  };

  const speakTurn = (turnIdx: number) => {
    if (!window.speechSynthesis) return;

    const st = stateRef.current;
    window.speechSynthesis.cancel();

    const turn = SCRIPT[turnIdx];
    const utter = new SpeechSynthesisUtterance(turn.text);
    utter.rate = 0.88;
    utter.pitch = turnIdx === 0 ? 0.8 : 1.0;
    utter.volume = 1;

    const voices = window.speechSynthesis.getVoices();
    const malePrefs = ["Google UK English Male", "Microsoft David", "Daniel", "Alex", "Arthur", "en-GB"];
    const femalePrefs = [
      "Google US English",
      "Microsoft Zira",
      "Samantha",
      "Karen",
      "Google UK English Female",
      "en-US",
    ];

    if (voices.length > 0) {
      utter.voice = turnIdx === 0 ? pickVoice(voices, malePrefs) : pickVoice(voices, femalePrefs);
    }

    ttsRef.current.currentTurn = turnIdx;
    ttsRef.current.utterance = utter;

    utter.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name !== "word") return;
      const spokenSoFar = turn.text.substring(0, e.charIndex + e.charLength).trim();
      const wi = spokenSoFar.split(/\s+/).length - 1;

      setWords({ turnIdx, activeWord: wi, list: turn.words });
      stateRef.current.elapsed = turn.globalStart + turn.wordTimings[Math.min(wi, turn.wordTimings.length - 1)];
    };

    utter.onend = () => {
      if (!st.playing) return;
      const next = turnIdx + 1;
      if (next < SCRIPT.length) {
        setTimeout(() => {
          if (st.playing) speakTurn(next);
        }, 400);
      }
    };

    window.speechSynthesis.speak(utter);
  };

  const togglePlay = () => {
    const st = stateRef.current;

    if (st.elapsed >= TOTAL_DURATION) {
      st.elapsed = 0;
      st.renderedTurn = -1;
      setWords({ turnIdx: 0, activeWord: -1, list: SCRIPT[0].words });
    }

    st.playing = !st.playing;
    setPlaying(st.playing);

    if (st.playing) {
      let startTurn = 0;
      for (let i = 0; i < SCRIPT.length; i++) {
        if (st.elapsed >= SCRIPT[i].globalStart) startTurn = i;
      }
      speakTurn(startTurn);
    } else {
      stopSpeech();
    }

    if (sceneRef.current) {
      sceneRef.current.ivBubble.update("", "#6366f1");
      sceneRef.current.cdBubble.update("", "#10b981");
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    stateRef.current.elapsed = ((e.clientX - rect.left) / rect.width) * TOTAL_DURATION;
    stateRef.current.renderedTurn = -1;

    if (stateRef.current.playing) {
      let startTurn = 0;
      for (let i = 0; i < SCRIPT.length; i++) {
        if (stateRef.current.elapsed >= SCRIPT[i].globalStart) startTurn = i;
      }
      speakTurn(startTurn);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        height: "100vh",
        background: "#1a1a2e",
        display: "flex",
        flexDirection: "column",
        position: "relative",
      }}
    >
      <div ref={mountRef} style={{ flex: 1, overflow: "hidden" }} />

      <div
        style={{
          position: "absolute",
          top: 14,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.72)",
          borderRadius: 999,
          padding: "6px 20px",
          color: speakerInfo.color,
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: 0.5,
          border: `1px solid ${speakerInfo.color}55`,
          backdropFilter: "blur(8px)",
        }}
      >
        {speakerInfo.label}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 110,
          left: "50%",
          transform: "translateX(-50%)",
          width: "82%",
          maxWidth: 700,
          background: "rgba(0,0,0,0.78)",
          borderRadius: 12,
          padding: "10px 18px",
          minHeight: 46,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: 4,
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(8px)",
        }}
      >
        {words.list.map((w, i) => (
          <span
            key={i}
            style={{
              fontSize: 15,
              borderRadius: 4,
              padding: "1px 3px",
              transition: "all 0.12s",
              color: i === words.activeWord ? "#fff" : i < words.activeWord ? "#94a3b8" : "#475569",
              fontWeight: i === words.activeWord ? 700 : 400,
              background: i === words.activeWord ? "rgba(99,102,241,0.55)" : "transparent",
              transform: i === words.activeWord ? "scale(1.12)" : "scale(1)",
              display: "inline-block",
            }}
          >
            {w}{" "}
          </span>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          bottom: 18,
          left: "50%",
          transform: "translateX(-50%)",
          width: "82%",
          maxWidth: 700,
          background: "rgba(15,12,41,0.92)",
          borderRadius: 16,
          padding: "13px 20px",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <button
          onClick={togglePlay}
          style={{
            width: 44,
            height: 44,
            borderRadius: "50%",
            border: "none",
            cursor: "pointer",
            background: "linear-gradient(135deg,#6366f1,#a855f7)",
            color: "white",
            fontSize: 18,
            flexShrink: 0,
            boxShadow: "0 4px 16px rgba(99,102,241,0.5)",
          }}
        >
          {playing ? "Pause" : "Play"}
        </button>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
          <div
            style={{
              color: speakerInfo.color,
              fontSize: 12,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 1,
            }}
          >
            {speakerInfo.label}
          </div>

          <div
            onClick={seek}
            style={{
              width: "100%",
              height: 6,
              background: "rgba(255,255,255,0.1)",
              borderRadius: 3,
              cursor: "pointer",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 3,
                background: "linear-gradient(90deg,#6366f1,#a855f7)",
                width: `${progress}%`,
              }}
            />
          </div>

          <div style={{ color: "#64748b", fontSize: 11 }}>{timeStr}</div>
        </div>
      </div>
    </div>
  );
}
