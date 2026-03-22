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

function makeMesh(geo: THREE.BufferGeometry, color: number): THREE.Mesh {
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.65 }));
}

function buildPerson(skinColor: number, suitColor: number, hairColor: number, isInterviewer = false) {
  const group = new THREE.Group();
  const skin = skinColor;
  const shirt = suitColor;
  const pants = isInterviewer ? 0x111827 : 0x1e3a5f;
  const hair = hairColor;
  const lipColor = isInterviewer ? 0x7a3028 : 0x9b4a42;
  const S = 0.62; // overall scale factor — smaller characters

  // Torso
  const torso = makeMesh(new THREE.CylinderGeometry(0.27 * S, 0.31 * S, 0.82 * S, 10), shirt);
  torso.position.y = 1.08 * S;
  group.add(torso);

  // Upper arms
  const lUA = makeMesh(new THREE.CylinderGeometry(0.09 * S, 0.08 * S, 0.52 * S, 8), shirt);
  lUA.position.set(-0.4 * S, 1.18 * S, 0);
  lUA.rotation.z = Math.PI / 10;
  group.add(lUA);

  const rUA = makeMesh(new THREE.CylinderGeometry(0.09 * S, 0.08 * S, 0.52 * S, 8), shirt);
  rUA.position.set(0.4 * S, 1.18 * S, 0);
  rUA.rotation.z = -Math.PI / 10;
  group.add(rUA);

  // Lower arms
  const lLA = makeMesh(new THREE.CylinderGeometry(0.07 * S, 0.065 * S, 0.42 * S, 8), skin);
  lLA.position.set(-0.5 * S, 0.8 * S, 0.1 * S);
  lLA.rotation.x = 0.4;
  group.add(lLA);

  const rLA = makeMesh(new THREE.CylinderGeometry(0.07 * S, 0.065 * S, 0.42 * S, 8), skin);
  rLA.position.set(0.5 * S, 0.8 * S, 0.1 * S);
  rLA.rotation.x = 0.4;
  group.add(rLA);

  // Hands
  const lHand = makeMesh(new THREE.SphereGeometry(0.07 * S, 8, 6), skin);
  lHand.position.set(-0.52 * S, 0.6 * S, 0.25 * S);
  group.add(lHand);

  const rHand = makeMesh(new THREE.SphereGeometry(0.07 * S, 8, 6), skin);
  rHand.position.set(0.52 * S, 0.6 * S, 0.25 * S);
  group.add(rHand);

  // Legs
  const lLeg = makeMesh(new THREE.CylinderGeometry(0.12 * S, 0.11 * S, 0.78 * S, 8), pants);
  lLeg.position.set(-0.15 * S, 0.39 * S, 0);
  group.add(lLeg);

  const rLeg = makeMesh(new THREE.CylinderGeometry(0.12 * S, 0.11 * S, 0.78 * S, 8), pants);
  rLeg.position.set(0.15 * S, 0.39 * S, 0);
  group.add(rLeg);

  // Shoes
  const lShoe = makeMesh(new THREE.BoxGeometry(0.18 * S, 0.1 * S, 0.3 * S), 0x111111);
  lShoe.position.set(-0.15 * S, 0.05 * S, 0.06 * S);
  group.add(lShoe);

  const rShoe = makeMesh(new THREE.BoxGeometry(0.18 * S, 0.1 * S, 0.3 * S), 0x111111);
  rShoe.position.set(0.15 * S, 0.05 * S, 0.06 * S);
  group.add(rShoe);

  // Neck
  const neck = makeMesh(new THREE.CylinderGeometry(0.08 * S, 0.1 * S, 0.18 * S, 8), skin);
  neck.position.y = 1.55 * S;
  group.add(neck);

  // Head group (for head animation)
  const headGrp = new THREE.Group();
  headGrp.position.y = 1.76 * S;
  group.add(headGrp);

  // Skull — slightly elongated oval
  const skull = makeMesh(new THREE.SphereGeometry(0.24 * S, 20, 16), skin);
  skull.scale.set(1, 1.18, 0.95);
  headGrp.add(skull);

  // Hair — fuller, wraps top and sides
  const hairTop = makeMesh(new THREE.SphereGeometry(0.25 * S, 14, 10), hair);
  hairTop.position.y = 0.1 * S;
  hairTop.scale.set(1.05, 0.55, 1.05);
  headGrp.add(hairTop);

  // Side hair (ears area)
  const hairL = makeMesh(new THREE.SphereGeometry(0.12 * S, 8, 6), hair);
  hairL.position.set(-0.18 * S, 0.06 * S, -0.04 * S);
  hairL.scale.set(0.5, 0.9, 0.8);
  headGrp.add(hairL);

  const hairR = makeMesh(new THREE.SphereGeometry(0.12 * S, 8, 6), hair);
  hairR.position.set(0.18 * S, 0.06 * S, -0.04 * S);
  hairR.scale.set(0.5, 0.9, 0.8);
  headGrp.add(hairR);

  // Back hair
  const hairBack = makeMesh(new THREE.SphereGeometry(0.22 * S, 10, 8), hair);
  hairBack.position.set(0, 0.04 * S, -0.1 * S);
  hairBack.scale.set(1, 0.6, 0.7);
  headGrp.add(hairBack);

  // Ears
  const lEar = makeMesh(new THREE.SphereGeometry(0.05 * S, 8, 6), skin);
  lEar.position.set(-0.22 * S, -0.01 * S, 0);
  lEar.scale.set(0.5, 0.8, 0.6);
  headGrp.add(lEar);

  const rEar = makeMesh(new THREE.SphereGeometry(0.05 * S, 8, 6), skin);
  rEar.position.set(0.22 * S, -0.01 * S, 0);
  rEar.scale.set(0.5, 0.8, 0.6);
  headGrp.add(rEar);

  // Eyebrows
  const browMat = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.8 });
  const lBrow = new THREE.Mesh(new THREE.BoxGeometry(0.08 * S, 0.015 * S, 0.02 * S), browMat);
  lBrow.position.set(-0.08 * S, 0.1 * S, 0.21 * S);
  lBrow.rotation.z = 0.08;
  headGrp.add(lBrow);

  const rBrow = new THREE.Mesh(new THREE.BoxGeometry(0.08 * S, 0.015 * S, 0.02 * S), browMat);
  rBrow.position.set(0.08 * S, 0.1 * S, 0.21 * S);
  rBrow.rotation.z = -0.08;
  headGrp.add(rBrow);

  // Eyes — white sclera + dark pupil
  const scleraMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f0, roughness: 0.3 });
  const lSclera = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S, 10, 8), scleraMat);
  lSclera.position.set(-0.08 * S, 0.045 * S, 0.2 * S);
  lSclera.scale.set(1.1, 0.85, 0.5);
  headGrp.add(lSclera);

  const rSclera = new THREE.Mesh(new THREE.SphereGeometry(0.04 * S, 10, 8), scleraMat);
  rSclera.position.set(0.08 * S, 0.045 * S, 0.2 * S);
  rSclera.scale.set(1.1, 0.85, 0.5);
  headGrp.add(rSclera);

  const lPupil = makeMesh(new THREE.SphereGeometry(0.022 * S, 8, 6), 0x1a1a1a);
  lPupil.position.set(-0.08 * S, 0.042 * S, 0.225 * S);
  headGrp.add(lPupil);

  const rPupil = makeMesh(new THREE.SphereGeometry(0.022 * S, 8, 6), 0x1a1a1a);
  rPupil.position.set(0.08 * S, 0.042 * S, 0.225 * S);
  headGrp.add(rPupil);

  // Nose — triangular/pointed shape using cone
  const nose = makeMesh(new THREE.ConeGeometry(0.03 * S, 0.08 * S, 6), skin);
  nose.position.set(0, -0.02 * S, 0.24 * S);
  nose.rotation.x = -Math.PI / 2;
  headGrp.add(nose);

  // Nose bridge
  const noseBridge = makeMesh(new THREE.BoxGeometry(0.025 * S, 0.07 * S, 0.03 * S), skin);
  noseBridge.position.set(0, 0.02 * S, 0.22 * S);
  headGrp.add(noseBridge);

  // Nostrils
  const lNostril = makeMesh(new THREE.SphereGeometry(0.013 * S, 6, 4), 0x8b6b50);
  lNostril.position.set(-0.018 * S, -0.05 * S, 0.24 * S);
  headGrp.add(lNostril);

  const rNostril = makeMesh(new THREE.SphereGeometry(0.013 * S, 6, 4), 0x8b6b50);
  rNostril.position.set(0.018 * S, -0.05 * S, 0.24 * S);
  headGrp.add(rNostril);

  // Mouth group (for mouth animation)
  const mouth = new THREE.Group();
  mouth.position.set(0, -0.1 * S, 0.21 * S);
  headGrp.add(mouth);

  // Upper lip
  const upperLip = makeMesh(new THREE.BoxGeometry(0.1 * S, 0.025 * S, 0.025 * S), lipColor);
  upperLip.position.y = 0.01 * S;
  upperLip.scale.set(1, 1, 1);
  mouth.add(upperLip);

  // Lower lip (slightly fuller)
  const lowerLip = makeMesh(new THREE.BoxGeometry(0.09 * S, 0.03 * S, 0.028 * S), lipColor);
  lowerLip.position.y = -0.015 * S;
  mouth.add(lowerLip);

  // Mouth interior (visible when speaking)
  const inner = makeMesh(new THREE.BoxGeometry(0.06 * S, 0.001, 0.02 * S), 0x2d0000);
  inner.position.y = -0.005 * S;
  mouth.add(inner);

  // Chin
  const chin = makeMesh(new THREE.SphereGeometry(0.08 * S, 8, 6), skin);
  chin.position.set(0, -0.18 * S, 0.14 * S);
  chin.scale.set(1, 0.5, 0.7);
  headGrp.add(chin);

  // Interviewer extras: glasses + tie
  if (isInterviewer) {
    const gM = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const geoT = new THREE.TorusGeometry(0.06 * S, 0.008 * S, 6, 20);

    const gl = new THREE.Mesh(geoT, gM);
    gl.position.set(-0.08 * S, 0.05 * S, 0.22 * S);
    gl.rotation.y = 0.1;
    headGrp.add(gl);

    const gr = new THREE.Mesh(geoT, gM);
    gr.position.set(0.08 * S, 0.05 * S, 0.22 * S);
    gr.rotation.y = -0.1;
    headGrp.add(gr);

    const br = new THREE.Mesh(new THREE.BoxGeometry(0.04 * S, 0.008 * S, 0.008 * S), gM);
    br.position.set(0, 0.05 * S, 0.24 * S);
    headGrp.add(br);

    // Temple arms
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.006 * S, 0.006 * S), gM);
    lArm.position.set(-0.16 * S, 0.05 * S, 0.12 * S);
    headGrp.add(lArm);
    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.16 * S, 0.006 * S, 0.006 * S), gM);
    rArm.position.set(0.16 * S, 0.05 * S, 0.12 * S);
    headGrp.add(rArm);

    const tie = makeMesh(new THREE.BoxGeometry(0.06 * S, 0.32 * S, 0.03 * S), 0x7c3aed);
    tie.position.set(0, 1.08 * S, 0.22 * S);
    group.add(tie);
  }

  return { group, head: headGrp, mouth };
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

function SpeechBubble({ text, side, visible, isQuestion, feedbackMode, fullText, spokenWordIdx, scrollRef }: {
  text: string; side: "left" | "right"; visible: boolean; isQuestion: boolean;
  feedbackMode?: boolean; fullText?: string; spokenWordIdx?: number; scrollRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const isLeft = side === "left";
  const isFeedback = feedbackMode && fullText;
  return (
    <div style={{
      width: isFeedback ? 380 : undefined,
      maxWidth: isFeedback ? 380 : 300,
      minWidth: isFeedback ? 300 : 120,
      background: "linear-gradient(160deg, rgba(15,23,42,0.96), rgba(30,41,59,0.94))",
      border: `1px solid ${isQuestion ? "rgba(96,165,250,0.35)" : "rgba(192,132,252,0.35)"}`,
      borderRadius: isLeft ? "16px 16px 16px 4px" : "16px 16px 4px 16px",
      padding: isFeedback ? "10px 14px" : "9px 13px", position: "relative",
      boxShadow: `0 10px 26px rgba(2,6,23,0.55)`,
      backdropFilter: "blur(10px)",
      opacity: visible ? 1 : 0,
      transform: visible ? "translateY(0) scale(1)" : "translateY(8px) scale(0.94)",
      transition: "all 0.4s cubic-bezier(0.34,1.2,0.64,1)",
      pointerEvents: "none" as const,
    }}>
      <div style={{
        display: "inline-block", padding: "2px 10px", borderRadius: 14, marginBottom: 6,
        background: isQuestion ? "rgba(96,165,250,0.25)" : "rgba(192,132,252,0.25)",
        fontSize: 9, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700,
        color: isQuestion ? "#93c5fd" : "#c4b5fd",
      }}>
        {isQuestion ? "Interviewer" : "Candidate"}
      </div>
      {isFeedback ? (
        <div ref={scrollRef} style={{
          fontSize: 14, lineHeight: 1.7,
          maxHeight: 96, overflowY: "auto", scrollBehavior: "smooth",
        }}>
          {fullText.split(" ").map((word, i) => (
            <span key={i} style={{
              display: "inline-block",
              fontSize: 14,
              borderRadius: 3,
              padding: "0 2px",
              transition: "all 0.12s",
              color: spokenWordIdx !== undefined && i === spokenWordIdx ? "#f8fafc"
                : spokenWordIdx !== undefined && i < spokenWordIdx ? "#facc15"
                : "#475569",
              fontWeight: spokenWordIdx !== undefined && i === spokenWordIdx ? 700 : 400,
              background: spokenWordIdx !== undefined && i === spokenWordIdx ? "rgba(56,189,248,0.35)" : "transparent",
              transform: spokenWordIdx !== undefined && i === spokenWordIdx ? "scale(1.08)" : "scale(1)",
            }}>
              {word}{" "}
            </span>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "#f8fafc", lineHeight: 1.55, fontWeight: 600 }}>{text}</div>
      )}
      <div style={{
        position: "absolute", bottom: -8,
        ...(isLeft ? { left: 14 } : { right: 14 }),
        width: 0, height: 0,
        borderLeft: "8px solid transparent", borderRight: "8px solid transparent",
        borderTop: "8px solid rgba(15,23,42,0.96)",
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
  const [feedbackFullText, setFeedbackFullText] = useState("");
  const feedbackBoxRef = useRef<HTMLDivElement | null>(null);
  const [feedbackQA, setFeedbackQA] = useState<{ q: string; a: string; tip?: string }[]>([]);
  const [feedbackQuestion, setFeedbackQuestion] = useState("");
  const [askingFeedback, setAskingFeedback] = useState(false);
  const recordingStartRef = useRef<number>(0);

  // Alternating question flow: Normal→FollowUp→Normal→FollowUp→Normal
  // We use 3 original questions and generate 2 follow-ups dynamically
  const originalQsRef = useRef<string[]>(interviewQs.slice(0, 3));
  const origQUsedRef = useRef(0); // which original Q index we've reached (0, 1, 2)
  const allQuestionsRef = useRef<string[]>([]);
  const followUpFlagsRef = useRef<boolean[]>([]);
  const allAnswersRef = useRef<AnswerRecord3D[]>([]);
  const [allQuestions, setAllQuestions] = useState<string[]>([]);
  const [followUpFlags, setFollowUpFlags] = useState<boolean[]>([]);
  const [generatingFollowUp, setGeneratingFollowUp] = useState(false);
  const [autoFeedbackDone, setAutoFeedbackDone] = useState(false);

  // Keep refs in sync with state
  useEffect(() => { allQuestionsRef.current = allQuestions; }, [allQuestions]);
  useEffect(() => { followUpFlagsRef.current = followUpFlags; }, [followUpFlags]);
  useEffect(() => { allAnswersRef.current = allAnswers; }, [allAnswers]);

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
    camera.position.set(0, 2.0, 4.2);
    camera.lookAt(0, 0.65, 0);
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
    glow.position.set(-1.3, 1.0, 0.1);
    scene.add(glow);
    glowRef.current = glow;

    // ── Environment ─────────────────────────────────────────────
    buildOffice(scene);
    scene.add(buildTable());

    // ── Interviewer (left) ──────────────────────────────────────
    const ivChair = buildChair();
    ivChair.position.set(-1.28, 0, 0.1);
    ivChair.rotation.y = Math.PI / 2;
    ivChair.scale.setScalar(0.75);
    scene.add(ivChair);

    const { group: ivGroup, head: ivHead, mouth: ivMouth } = buildPerson(0xc68642, 0x1e1b4b, 0x555566, true);
    ivGroup.position.set(-1.28, 0.08, 0.1);
    ivGroup.rotation.y = Math.PI / 2;
    scene.add(ivGroup);
    ivHeadRef.current = ivHead as any;
    ivMouthRef.current = ivMouth as any;

    // ── Candidate (right) ───────────────────────────────────────
    const cdChair = buildChair();
    cdChair.position.set(1.28, 0, 0.1);
    cdChair.rotation.y = -Math.PI / 2;
    cdChair.scale.setScalar(0.75);
    scene.add(cdChair);

    const { group: cdGroup, head: cdHead, mouth: cdMouth } = buildPerson(0xfcd9b0, 0x1d4ed8, 0x3b2000, false);
    cdGroup.position.set(1.28, 0.08, 0.1);
    cdGroup.rotation.y = -Math.PI / 2;
    scene.add(cdGroup);
    cdHeadRef.current = cdHead as any;
    cdMouthRef.current = cdMouth as any;

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
        leftWrapRef.current.style.top = `${ivY - 180}px`;
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

      // Head bobs (head is now a Group at y=1.09 after 0.62 scale)
      const headY = 1.76 * 0.62; // ~1.09
      if (ivHeadRef.current) {
        ivHeadRef.current.position.y = spk === 1 ? headY + Math.sin(t * 4.2) * 0.018 : headY;
        ivHeadRef.current.rotation.x = spk !== 1 && spk === 2 ? Math.sin(t * 0.9) * 0.05 : 0;
        ivHeadRef.current.rotation.z = spk !== 1 && spk === 2 ? Math.sin(t * 0.7) * 0.04 : 0;
      }
      if (cdHeadRef.current) {
        cdHeadRef.current.position.y = spk === 2 ? headY + Math.sin(t * 4.0 + 0.6) * 0.018 : headY;
        cdHeadRef.current.rotation.x = spk !== 2 && spk === 1 ? Math.sin(t * 0.9) * 0.05 : 0;
        cdHeadRef.current.rotation.z = spk !== 2 && spk === 1 ? Math.sin(t * 0.7) * 0.04 : 0;
      }

      // Mouth animation (mouth is now a Group — scale.y for open/close)
      const mouthY = -0.1 * 0.62; // ~-0.062
      if (ivMouthRef.current) {
        const s = spk === 1 ? Math.abs(Math.sin(t * 10.5)) * 0.9 + 0.1 : 0;
        ivMouthRef.current.scale.y = 1 + s * 2.5;
        ivMouthRef.current.position.y = mouthY - s * 0.025;
      }
      if (cdMouthRef.current) {
        const s = spk === 2 ? Math.abs(Math.sin(t * 9.8 + 0.4)) * 0.9 + 0.1 : 0;
        cdMouthRef.current.scale.y = 1 + s * 2.5;
        cdMouthRef.current.position.y = mouthY - s * 0.025;
      }

      // Speaker glow
      if (glowRef.current) {
        const g = glowRef.current;
        if (spk === 1) {
          g.position.set(-1.28, 1.05, 0.1);
          g.color.setHex(0x5080ff);
          g.intensity = 0.9 + Math.sin(t * 5.2) * 0.14;
        } else if (spk === 2) {
          g.position.set(1.28, 1.05, 0.1);
          g.color.setHex(0x9050ff);
          g.intensity = 0.9 + Math.sin(t * 5.0) * 0.14;
        } else {
          g.intensity = Math.max(0, g.intensity - 0.06);
        }
      }

      // Subtle camera breathe
      camera.position.x = Math.sin(t * 0.11) * 0.065;
      camera.position.y = 2.0 + Math.sin(t * 0.085) * 0.042;
      camera.lookAt(0, 0.65, 0);

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

  const askQuestion = useCallback((qIdx: number, directText?: string) => {
    if (!window.speechSynthesis) return;
    const questionText = directText || allQuestionsRef.current[qIdx];
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        question: allQuestionsRef.current[currentQIdx],
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
  }, [currentQIdx, onAnswerRecorded]);

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
        const feedbackText = data.humanized.spoken_feedback;
        setFeedbackFullText(feedbackText);
        const utter = new SpeechSynthesisUtterance(feedbackText);
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

        // Track word-by-word for the speech bubble above interviewer's head
        const feedbackWords = feedbackText.split(" ");
        setBubbleText(feedbackWords.slice(0, 7).join(" ") + "...");

        utter.onboundary = (e: SpeechSynthesisEvent) => {
          if (e.name !== "word") return;
          const spokenSoFar = feedbackText.substring(0, e.charIndex + e.charLength).trim();
          const wordIdx = spokenSoFar.split(/\s+/).length - 1;
          // Show a sliding window of recent words in the bubble
          setBubbleText(feedbackWords.slice(Math.max(0, wordIdx - 6), wordIdx + 1).join(" "));
          setSpokenWordIdx(wordIdx);
          // Auto-scroll the feedback box
          if (feedbackBoxRef.current) {
            const lineHeight = 22;
            const wordsPerLine = 10;
            const currentLine = Math.floor(wordIdx / wordsPerLine);
            feedbackBoxRef.current.scrollTop = Math.max(0, (currentLine - 1) * lineHeight);
          }
        };

        utter.onend = () => {
          setInterviewerTalking(false);
          setFeedbackSpeaking(false);
          setBubbleText(feedbackWords.slice(-7).join(" "));
        };
        window.speechSynthesis.speak(utter);
      }

    } catch (err) {
      console.error("[3D Mock] Feedback error:", err);
    } finally {
      setFeedbackLoading(false);
    }
  }, [allAnswers, companyName, role, profile, onFeedbackReceived]);

  const closeFeedback = useCallback(() => {
    window.speechSynthesis?.cancel();
    setFeedbackSpeaking(false);
    setInterviewerTalking(false);
    setMode("reviewing");
    setFeedbackData(null);
    setFeedbackFullText("");
    setSpokenWordIdx(-1);
    setFeedbackQA([]);
    setFeedbackQuestion("");
  }, []);

  const askAboutFeedback = useCallback(async () => {
    if (!feedbackQuestion.trim() || !feedbackData) return;
    const q = feedbackQuestion.trim();
    setFeedbackQuestion("");
    setAskingFeedback(true);

    try {
      const latest = allAnswers[allAnswers.length - 1];
      const res = await fetch("/api/mock-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "ask_about_feedback",
          company: companyName || "General",
          role: role || "Software Engineer",
          candidateQuestion: q,
          feedbackContext: feedbackData.analysis,
          question: latest?.question || "",
          answer: latest?.answer || "",
        }),
      });
      const data = await res.json();
      setFeedbackQA(prev => [...prev, { q, a: data.response || "Sorry, I couldn't process that.", tip: data.tip }]);

      // Speak the response
      if (data.response && window.speechSynthesis) {
        const utter = new SpeechSynthesisUtterance(data.response);
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
        setFeedbackFullText(data.response);
        setSpokenWordIdx(-1);

        const words = data.response.split(" ");
        setBubbleText(words.slice(0, 7).join(" ") + "...");

        utter.onboundary = (e: SpeechSynthesisEvent) => {
          if (e.name !== "word") return;
          const spokenSoFar = data.response.substring(0, e.charIndex + e.charLength).trim();
          const wordIdx = spokenSoFar.split(/\s+/).length - 1;
          setBubbleText(words.slice(Math.max(0, wordIdx - 6), wordIdx + 1).join(" "));
          setSpokenWordIdx(wordIdx);
          if (feedbackBoxRef.current) {
            const lineHeight = 22;
            const wordsPerLine = 10;
            const currentLine = Math.floor(wordIdx / wordsPerLine);
            feedbackBoxRef.current.scrollTop = Math.max(0, (currentLine - 1) * lineHeight);
          }
        };
        utter.onend = () => {
          setInterviewerTalking(false);
          setFeedbackSpeaking(false);
          setBubbleText(words.slice(-7).join(" "));
        };
        window.speechSynthesis.speak(utter);
      }
    } catch (err) {
      console.error("[3D Mock] Ask feedback error:", err);
      setFeedbackQA(prev => [...prev, { q, a: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setAskingFeedback(false);
    }
  }, [feedbackQuestion, feedbackData, allAnswers, companyName, role]);

  // ── Follow-up generation ──────────────────────────────────────
  const generateFollowUp = useCallback(async (): Promise<string> => {
    const answers = allAnswersRef.current;
    const latest = answers[answers.length - 1];
    if (!latest) return "";

    try {
      const res = await fetch("/api/mock-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "generate_followup",
          company: companyName || "General",
          role: role || "Software Engineer",
          profile,
          country: profile?.country || "",
          question: latest.question,
          answer: latest.answer,
          previousQA: answers.map(a => ({ question: a.question, answer: a.answer })),
        }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.followup_question || "";
      }
    } catch (err) {
      console.error("[3D Mock] Follow-up generation error:", err);
    }
    return "";
  }, [companyName, role, profile]);

  // ── Next question (alternating: Normal→FollowUp→Normal→FollowUp→Normal) ──
  const nextQuestion = useCallback(async () => {
    const isCurrentFollowUp = followUpFlagsRef.current[currentQIdx];

    if (!isCurrentFollowUp && origQUsedRef.current < originalQsRef.current.length - 1) {
      // Just answered a NORMAL question (not the last one) → generate follow-up
      setGeneratingFollowUp(true);
      setMode("asking");
      setBubbleText("");
      setTranscript("");

      const followUpText = await generateFollowUp();
      setGeneratingFollowUp(false);

      if (followUpText) {
        const nextIdx = allQuestionsRef.current.length;
        const newQs = [...allQuestionsRef.current, followUpText];
        const newFlags = [...followUpFlagsRef.current, true];
        allQuestionsRef.current = newQs;
        followUpFlagsRef.current = newFlags;
        setAllQuestions(newQs);
        setFollowUpFlags(newFlags);
        setCurrentQIdx(nextIdx);
        setAutoFeedbackDone(false);
        askQuestion(nextIdx, followUpText);
      } else {
        // Follow-up generation failed → skip to next normal question
        origQUsedRef.current += 1;
        const nextOriginal = originalQsRef.current[origQUsedRef.current];
        const nextIdx = allQuestionsRef.current.length;
        const newQs = [...allQuestionsRef.current, nextOriginal];
        const newFlags = [...followUpFlagsRef.current, false];
        allQuestionsRef.current = newQs;
        followUpFlagsRef.current = newFlags;
        setAllQuestions(newQs);
        setFollowUpFlags(newFlags);
        setCurrentQIdx(nextIdx);
        setAutoFeedbackDone(false);
        askQuestion(nextIdx, nextOriginal);
      }
    } else if (isCurrentFollowUp) {
      // Just answered a FOLLOW-UP → move to next normal question
      origQUsedRef.current += 1;
      if (origQUsedRef.current < originalQsRef.current.length) {
        const nextOriginal = originalQsRef.current[origQUsedRef.current];
        const nextIdx = allQuestionsRef.current.length;
        const newQs = [...allQuestionsRef.current, nextOriginal];
        const newFlags = [...followUpFlagsRef.current, false];
        allQuestionsRef.current = newQs;
        followUpFlagsRef.current = newFlags;
        setAllQuestions(newQs);
        setFollowUpFlags(newFlags);
        setCurrentQIdx(nextIdx);
        setTranscript("");
        setBubbleText("");
        setAutoFeedbackDone(false);
        askQuestion(nextIdx, nextOriginal);
      } else {
        // All done
        requestFeedback("session");
      }
    } else {
      // Last normal question → end session
      requestFeedback("session");
    }
  }, [currentQIdx, askQuestion, requestFeedback, generateFollowUp]);

  const startInterview = useCallback(() => {
    const origQs = (questions && questions.length > 0 ? questions : DEFAULT_QUESTIONS).slice(0, 3);
    originalQsRef.current = origQs;
    origQUsedRef.current = 0;

    const firstQ = origQs[0];
    allQuestionsRef.current = [firstQ];
    followUpFlagsRef.current = [false];

    setCurrentQIdx(0);
    setTranscript("");
    setBubbleText("");
    setAllAnswers([]);
    setFeedbackData(null);
    setAllQuestions([firstQ]);
    setFollowUpFlags([false]);
    setGeneratingFollowUp(false);
    setAutoFeedbackDone(false);
    onInterviewStart?.();
    askQuestion(0, firstQ);
  }, [askQuestion, questions, onInterviewStart]);

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const sc = (s: number) => s >= 80 ? "#4ade80" : s >= 60 ? "#facc15" : "#f87171";

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ fontFamily: "'DM Sans','Segoe UI',sans-serif", width: "100%", height: "100vh", background: "#060c16", display: "flex", flexDirection: "row", position: "relative", userSelect: "none" }}>
      {/* Left: 3D canvas (shrinks when feedback is open) */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", position: "relative", transition: "all 0.4s ease" }}>
      {/* Three.js canvas */}
      <div ref={mountRef} style={{ flex: 1, overflow: "hidden", position: "relative" }}>

        {/* Left bubble (interviewer) — positioned by 3D projection */}
        <div ref={leftWrapRef} style={{ position: "absolute", zIndex: 10, pointerEvents: "none" }}>
          <SpeechBubble
            text={activeSpeaker === "interviewer" ? bubbleText : ""}
            side="left"
            visible={!!bubbleText && activeSpeaker === "interviewer" && mode !== "intro"}
            isQuestion={true}
            feedbackMode={mode === "feedback" && !!feedbackFullText}
            fullText={mode === "feedback" ? feedbackFullText : undefined}
            spokenWordIdx={mode === "feedback" ? spokenWordIdx : undefined}
            scrollRef={feedbackBoxRef}
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

        {/* Progress dots — always 5 total (Normal→FollowUp→Normal→FollowUp→Normal) */}
        {mode !== "intro" && (
          <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", display: "flex", gap: 6, zIndex: 10 }}>
            {Array.from({ length: 5 }).map((_, i) => {
              const isFollowUp = i === 1 || i === 3;
              return (
                <div key={i} style={{
                  width: i === currentQIdx ? 20 : isFollowUp ? 8 : 6,
                  height: 6, borderRadius: 99,
                  background: i < currentQIdx ? "#4ade80"
                    : i === currentQIdx ? "rgba(255,255,255,0.9)"
                    : "rgba(255,255,255,0.18)",
                  border: isFollowUp ? "1px solid rgba(250,204,21,0.4)" : "none",
                  transition: "all 0.3s ease",
                }} />
              );
            })}
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
         mode === "asking" ? (generatingFollowUp ? "Preparing follow-up..." : followUpFlags[currentQIdx] ? "Follow-up question..." : "Interviewer is asking...") :
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
            {followUpFlags[currentQIdx] ? "Follow-up" : `Q${currentQIdx + 1}`} / 5
          </div>
        </div>
      )}

      {/* Transcript / question display (non-feedback modes only) */}
      {mode !== "intro" && mode !== "feedback" && (
        <div style={{
          position: "absolute", bottom: 110, left: "50%", transform: "translateX(-50%)",
          width: "88%", maxWidth: 750,
          background: "rgba(6,12,22,0.95)", borderRadius: 14, padding: "14px 20px",
          minHeight: 50, maxHeight: 200,
          overflowY: "auto", border: "1px solid rgba(255,255,255,0.1)", backdropFilter: "blur(12px)",
          zIndex: 20, boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {mode === "asking" && (
            <div style={{ color: "#e2e8f0", fontSize: 15, lineHeight: 1.7 }}>
              {generatingFollowUp ? (
                <div style={{ textAlign: "center", padding: "16px 0" }}>
                  <div style={{ color: "#facc15", fontSize: 14, fontWeight: 700, marginBottom: 8, animation: "pulse 1.5s infinite" }}>
                    Crafting a follow-up based on your answer...
                  </div>
                  <div style={{ color: "#64748b", fontSize: 12 }}>
                    The interviewer is preparing a deeper question to probe your response
                  </div>
                </div>
              ) : (
                <>
                  <span style={{ color: followUpFlags[currentQIdx] ? "#facc15" : "#60a5fa", fontWeight: 700, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.5, display: "block", marginBottom: 8 }}>
                    {followUpFlags[currentQIdx] ? "Follow-up Question" : `Question ${currentQIdx + 1}`}
                  </span>
                  <div style={{ fontSize: 16, lineHeight: 1.7, letterSpacing: 0.2 }}>
                    {(allQuestions[currentQIdx] || "").split(" ").map((word, i) => (
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
                </>
              )}
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
        {/* Intro — Ethics notice + Start button */}
        {mode === "intro" && (
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 10 }}>
            <div style={{
              display: "flex", gap: 12, padding: "10px 14px",
              background: "rgba(96,165,250,0.06)", borderRadius: 10,
              border: "1px solid rgba(96,165,250,0.12)",
            }}>
              <div style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>&#9432;</div>
              <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.6 }}>
                <span style={{ color: "#60a5fa", fontWeight: 700 }}>Practice tool, not professional advice.</span>{" "}
                AI feedback helps you practice — it doesn&apos;t replace human mentorship. Your audio is transcribed in real-time and never stored on our servers. We encourage authentic answers over scripted ones.
              </div>
            </div>
            <button onClick={startInterview} style={{
              width: "100%", padding: "14px 0", borderRadius: 12, border: "1px solid rgba(96,165,250,0.45)", cursor: "pointer",
              background: "linear-gradient(135deg,#1e3a5f,#163050)", color: "white",
              fontSize: 16, fontWeight: 700, boxShadow: "0 0 30px rgba(96,165,250,0.18)",
              letterSpacing: 0.5,
            }}>
              Start Interview (5 Questions)
            </button>
          </div>
        )}

        {/* Asking / Generating follow-up */}
        {mode === "asking" && (
          <div style={{ width: "100%", textAlign: "center", color: generatingFollowUp ? "#facc15" : "#60a5fa", fontSize: 14, fontWeight: 600 }}>
            <span style={{ display: "inline-block", animation: "pulse 1.5s infinite" }}>
              {generatingFollowUp ? "Generating follow-up question based on your answer..." : "Interviewer is speaking..."}
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
              flex: 1, padding: "14px 0", borderRadius: 12, cursor: "pointer",
              border: `1px solid ${!followUpFlags[currentQIdx] && origQUsedRef.current < originalQsRef.current.length - 1 ? "rgba(250,204,21,0.45)" : "rgba(96,165,250,0.45)"}`,
              background: !followUpFlags[currentQIdx] && origQUsedRef.current < originalQsRef.current.length - 1
                ? "linear-gradient(135deg,#3a2a0a,#2a1f08)"
                : "linear-gradient(135deg,#1e3a5f,#163050)",
              color: "white",
              fontSize: 16, fontWeight: 700,
              boxShadow: !followUpFlags[currentQIdx] && origQUsedRef.current < originalQsRef.current.length - 1
                ? "0 0 30px rgba(250,204,21,0.15)"
                : "0 0 30px rgba(96,165,250,0.18)",
            }}>
              {(() => {
                const isCurrentFollowUp = followUpFlags[currentQIdx];
                if (!isCurrentFollowUp && origQUsedRef.current < originalQsRef.current.length - 1) {
                  return "Next → Follow-up Question";
                } else if (isCurrentFollowUp && origQUsedRef.current + 1 < originalQsRef.current.length) {
                  return "Next Question";
                } else {
                  return "Finish & Get Session Feedback";
                }
              })()}
            </button>
          </div>
        )}

        {/* Feedback mode — controls are in the sidebar */}
        {mode === "feedback" && (
          <div style={{ width: "100%", textAlign: "center", color: feedbackSpeaking ? "#facc15" : "#64748b", fontSize: 13, fontWeight: 600 }}>
            {feedbackSpeaking ? "Interviewer is giving feedback..." : feedbackLoading ? "Analyzing your answer..." : "See feedback in the panel →"}
          </div>
        )}
      </div>

      </div>{/* end left wrapper */}

      {/* ═══ RIGHT SIDEBAR: Feedback Panel ═══ */}
      {mode === "feedback" && (
        <div style={{
          width: 400, minWidth: 400, height: "100vh", overflowY: "auto",
          background: "rgba(8,14,28,0.98)", borderLeft: "1px solid rgba(255,255,255,0.08)",
          padding: "20px 18px", display: "flex", flexDirection: "column", gap: 14,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <div style={{ color: "#facc15", fontSize: 13, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1.5 }}>
              {feedbackMode === "single" ? "Question Feedback" : "Session Analysis"}
            </div>
            <div style={{
              fontSize: 9, color: "#64748b", padding: "3px 8px", borderRadius: 6,
              background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
              display: "flex", alignItems: "center", gap: 4,
            }}>
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#6c63ff", display: "inline-block" }} />
              AI-Generated
            </div>
          </div>

          {feedbackLoading ? (
            <div style={{ textAlign: "center", padding: "40px 0" }}>
              <div style={{ color: "#facc15", fontSize: 14, fontWeight: 700, marginBottom: 8, animation: "pulse 1.5s infinite" }}>
                {feedbackMode === "single" ? "Analyzing your answer..." : "Analyzing full session..."}
              </div>
              <div style={{ color: "#64748b", fontSize: 12 }}>Gemini is analyzing, then Claude will humanize the feedback</div>
            </div>
          ) : feedbackData ? (
            <>
              {/* Humanized spoken feedback */}
              <div style={{ padding: "12px 14px", background: "rgba(250,204,21,0.06)", borderRadius: 10, borderLeft: "3px solid #facc15" }}>
                <div style={{ color: "#facc15", fontSize: 10, fontWeight: 700, marginBottom: 4, textTransform: "uppercase", letterSpacing: 1 }}>
                  Interviewer says{feedbackSpeaking ? " (speaking...)" : ""}:
                </div>
                <div style={{ color: "#e2e8f0", fontSize: 13, lineHeight: 1.6, fontStyle: "italic" }}>
                  &ldquo;{feedbackData.humanized?.spoken_feedback || "No feedback available"}&rdquo;
                </div>
              </div>

              {/* Score + badges */}
              {feedbackData.analysis && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  <div style={{ background: "rgba(96,165,250,0.08)", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ position: "relative", width: 52, height: 52 }}>
                      <ScoreRing score={(feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || 0} size={52} stroke={4} />
                      <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <span style={{ fontSize: 16, fontWeight: 800, color: sc((feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || 0) }}>
                          {(feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || "—"}
                        </span>
                      </div>
                    </div>
                    <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 600 }}>Overall<br />Score</div>
                  </div>
                  {(feedbackData.analysis as any).readiness_label && (
                    <div style={{ background: "rgba(74,222,128,0.08)", borderRadius: 10, padding: "10px 14px", flex: 1 }}>
                      <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Readiness</div>
                      <div style={{ color: "#4ade80", fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                        {(feedbackData.analysis as any).readiness_label}
                      </div>
                    </div>
                  )}
                  {(feedbackData.analysis as any).hiring_recommendation && (
                    <div style={{ background: "rgba(250,204,21,0.08)", borderRadius: 10, padding: "10px 14px", flex: 1 }}>
                      <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Recommendation</div>
                      <div style={{ color: "#facc15", fontSize: 15, fontWeight: 700, marginTop: 2 }}>
                        {(feedbackData.analysis as any).hiring_recommendation}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* STAR scores */}
              {(feedbackData.analysis as any)?.star_scores && (
                <div>
                  <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>STAR Framework</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    {Object.entries((feedbackData.analysis as any).star_scores).map(([key, val]) => (
                      <div key={key} style={{ flex: 1, textAlign: "center", background: "rgba(255,255,255,0.03)", borderRadius: 8, padding: "8px 4px" }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: sc(val as number) }}>{val as number}</div>
                        <div style={{ fontSize: 9, color: "#94a3b8", textTransform: "capitalize" }}>{key}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Dimension scores */}
              {(feedbackData.analysis as any)?.dimension_scores && (
                <div>
                  <div style={{ color: "#94a3b8", fontSize: 11, fontWeight: 700, marginBottom: 6 }}>Dimensions</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {Object.entries((feedbackData.analysis as any).dimension_scores).map(([key, val]) => (
                      <div key={key} style={{ display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.03)", borderRadius: 6, padding: "4px 8px" }}>
                        <span style={{ color: "#94a3b8", fontSize: 10, textTransform: "capitalize" }}>{key.replace(/_/g, " ")}</span>
                        <span style={{ color: sc(val as number), fontSize: 12, fontWeight: 700 }}>{val as number}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Strengths & improvements */}
              {((feedbackData.analysis as any)?.strengths || (feedbackData.analysis as any)?.strengths_to_leverage) && (
                <div style={{ display: "flex", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#4ade80", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>STRENGTHS</div>
                    {((feedbackData.analysis as any).strengths || (feedbackData.analysis as any).strengths_to_leverage || []).slice(0, 3).map((s: string, i: number) => (
                      <div key={i} style={{ color: "#94a3b8", fontSize: 11, marginBottom: 3 }}>+ {s}</div>
                    ))}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ color: "#f87171", fontSize: 10, fontWeight: 700, marginBottom: 4 }}>IMPROVE</div>
                    {((feedbackData.analysis as any).improvements || (feedbackData.analysis as any).top_3_focus_areas || []).slice(0, 3).map((s: string, i: number) => (
                      <div key={i} style={{ color: "#94a3b8", fontSize: 11, marginBottom: 3 }}>- {s}</div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ask about feedback */}
              {!feedbackLoading && (
                <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 12 }}>
                  <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, marginBottom: 8, textTransform: "uppercase", letterSpacing: 1 }}>
                    Ask about your feedback
                  </div>
                  {feedbackQA.map((qa, i) => (
                    <div key={i} style={{ marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                        <span style={{ color: "#c084fc", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>You:</span>
                        <span style={{ color: "#e2e8f0", fontSize: 12 }}>{qa.q}</span>
                      </div>
                      <div style={{ display: "flex", gap: 6 }}>
                        <span style={{ color: "#60a5fa", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>IV:</span>
                        <div>
                          <span style={{ color: "#94a3b8", fontSize: 12, lineHeight: 1.5 }}>{qa.a}</span>
                          {qa.tip && <div style={{ color: "#facc15", fontSize: 11, marginTop: 4, fontStyle: "italic" }}>Tip: {qa.tip}</div>}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: "flex", gap: 6 }}>
                    <input
                      type="text"
                      value={feedbackQuestion}
                      onChange={e => setFeedbackQuestion(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !askingFeedback) askAboutFeedback(); }}
                      placeholder="e.g. How can I improve my STAR structure?"
                      disabled={askingFeedback}
                      style={{
                        flex: 1, padding: "8px 12px", borderRadius: 8, fontSize: 12,
                        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.12)",
                        color: "#e2e8f0", outline: "none", fontFamily: "inherit",
                      }}
                    />
                    <button
                      onClick={askAboutFeedback}
                      disabled={askingFeedback || !feedbackQuestion.trim()}
                      style={{
                        padding: "8px 14px", borderRadius: 8, border: "none", cursor: askingFeedback ? "not-allowed" : "pointer",
                        background: askingFeedback ? "rgba(192,132,252,0.2)" : "linear-gradient(135deg,#7c3aed,#6d28d9)",
                        color: "white", fontSize: 12, fontWeight: 700, fontFamily: "inherit",
                      }}
                    >
                      {askingFeedback ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 10, height: 10, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "white", borderRadius: "50%", animation: "spin 0.7s linear infinite", display: "inline-block" }} />
                        </span>
                      ) : "Ask"}
                    </button>
                  </div>
                </div>
              )}

              {/* Feedback action buttons */}
              {(() => {
                const isCurrentFollowUp = followUpFlags[currentQIdx];
                const hasMore = isCurrentFollowUp
                  ? origQUsedRef.current + 1 < originalQsRef.current.length
                  : origQUsedRef.current < originalQsRef.current.length - 1;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {hasMore && (
                      <button onClick={() => { closeFeedback(); nextQuestion(); }} style={{
                        width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid rgba(96,165,250,0.45)", cursor: "pointer",
                        background: "linear-gradient(135deg,#1e3a5f,#163050)", color: "white",
                        fontSize: 14, fontWeight: 700,
                      }}>
                        {!isCurrentFollowUp ? "Next → Follow-up" : "Next Question"}
                      </button>
                    )}
                    <button onClick={() => { closeFeedback(); setMode("intro"); setBubbleText(""); }} style={{
                      width: "100%", padding: "12px 0", borderRadius: 10, border: "1px solid rgba(74,222,128,0.45)", cursor: "pointer",
                      background: hasMore ? "rgba(255,255,255,0.05)" : "linear-gradient(135deg,#1a3a2a,#163028)",
                      color: "white", fontSize: hasMore ? 12 : 14, fontWeight: 700,
                    }}>
                      {hasMore ? "End Interview" : "Interview Complete!"}
                    </button>
                  </div>
                );
              })()}
            </>
          ) : null}
        </div>
      )}

      {/* Ethical disclaimer */}
      <div style={{
        position: "absolute", bottom: 2, left: 12,
        color: "rgba(148,163,184,0.4)", fontSize: 9, zIndex: 5,
        pointerEvents: "none",
      }}>
        AI-generated feedback for practice purposes. Not a substitute for professional career advice.
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
