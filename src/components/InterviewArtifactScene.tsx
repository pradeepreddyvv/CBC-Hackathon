"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { SpeechmaticsSTT } from "@/lib/speechmatics";

// ── Types ───────────────────────────────────────────────────────

type CharacterRig = {
  group: THREE.Group;
  head: THREE.Group;
  mouthGrp: THREE.Group;
  lLid: THREE.Mesh;
  rLid: THREE.Mesh;
  lUA: THREE.Mesh;
  rUA: THREE.Mesh;
  speakerGlow: THREE.PointLight;
};

type SceneRig = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  iv: CharacterRig;
  cd: CharacterRig;
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

function makeMesh(geo: THREE.BufferGeometry, color: number, opts?: { roughness?: number; metalness?: number }): THREE.Mesh {
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness: opts?.roughness ?? 0.65,
    metalness: opts?.metalness ?? 0,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// ── Professional Character Builder ──────────────────────────────

function buildPerson(
  scene: THREE.Scene,
  skinColor: number,
  suitColor: number,
  hairColor: number,
  isInterviewer: boolean
): CharacterRig {
  const g = new THREE.Group();
  const shirtColor = isInterviewer ? 0xf0f0f0 : 0xe8e0d8;

  // Torso (suit jacket)
  const torso = makeMesh(new THREE.BoxGeometry(0.52, 0.62, 0.3), suitColor);
  torso.position.y = 1.08;
  g.add(torso);

  // Suit lapels
  const lapelL = makeMesh(new THREE.BoxGeometry(0.08, 0.4, 0.02), suitColor, { roughness: 0.4 });
  lapelL.position.set(-0.16, 1.18, 0.16);
  lapelL.rotation.z = 0.15;
  g.add(lapelL);
  const lapelR = makeMesh(new THREE.BoxGeometry(0.08, 0.4, 0.02), suitColor, { roughness: 0.4 });
  lapelR.position.set(0.16, 1.18, 0.16);
  lapelR.rotation.z = -0.15;
  g.add(lapelR);

  // Shirt collar
  const collarL = makeMesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), shirtColor);
  collarL.position.set(-0.1, 1.42, 0.12);
  collarL.rotation.z = 0.3;
  g.add(collarL);
  const collarR = makeMesh(new THREE.BoxGeometry(0.12, 0.06, 0.08), shirtColor);
  collarR.position.set(0.1, 1.42, 0.12);
  collarR.rotation.z = -0.3;
  g.add(collarR);

  // Shirt V-neck area
  const shirtFront = makeMesh(new THREE.BoxGeometry(0.18, 0.3, 0.02), shirtColor);
  shirtFront.position.set(0, 1.2, 0.155);
  g.add(shirtFront);

  // Upper arms
  const lUA = makeMesh(new THREE.CylinderGeometry(0.1, 0.09, 0.48, 8), suitColor);
  lUA.position.set(-0.38, 1.1, 0);
  lUA.rotation.z = Math.PI / 8;
  g.add(lUA);
  const rUA = makeMesh(new THREE.CylinderGeometry(0.1, 0.09, 0.48, 8), suitColor);
  rUA.position.set(0.38, 1.1, 0);
  rUA.rotation.z = -Math.PI / 8;
  g.add(rUA);

  // Lower arms (skin)
  const lLA = makeMesh(new THREE.CylinderGeometry(0.07, 0.065, 0.4, 8), skinColor);
  lLA.position.set(-0.46, 0.78, 0.15);
  lLA.rotation.x = 0.5;
  g.add(lLA);
  const rLA = makeMesh(new THREE.CylinderGeometry(0.07, 0.065, 0.4, 8), skinColor);
  rLA.position.set(0.46, 0.78, 0.15);
  rLA.rotation.x = 0.5;
  g.add(rLA);

  // Hands
  const lHand = makeMesh(new THREE.SphereGeometry(0.065, 8, 6), skinColor);
  lHand.position.set(-0.48, 0.62, 0.3);
  g.add(lHand);
  const rHand = makeMesh(new THREE.SphereGeometry(0.065, 8, 6), skinColor);
  rHand.position.set(0.48, 0.62, 0.3);
  g.add(rHand);

  // Legs (sitting)
  const lLeg = makeMesh(new THREE.CylinderGeometry(0.11, 0.1, 0.5, 8), suitColor);
  lLeg.position.set(-0.14, 0.55, 0.12);
  lLeg.rotation.x = Math.PI / 2.5;
  g.add(lLeg);
  const rLeg = makeMesh(new THREE.CylinderGeometry(0.11, 0.1, 0.5, 8), suitColor);
  rLeg.position.set(0.14, 0.55, 0.12);
  rLeg.rotation.x = Math.PI / 2.5;
  g.add(rLeg);

  // Shoes
  const lShoe = makeMesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), 0x1a1a1a, { roughness: 0.3, metalness: 0.2 });
  lShoe.position.set(-0.14, 0.32, 0.32);
  g.add(lShoe);
  const rShoe = makeMesh(new THREE.BoxGeometry(0.14, 0.08, 0.24), 0x1a1a1a, { roughness: 0.3, metalness: 0.2 });
  rShoe.position.set(0.14, 0.32, 0.32);
  g.add(rShoe);

  // Neck
  const neck = makeMesh(new THREE.CylinderGeometry(0.09, 0.1, 0.16, 8), skinColor);
  neck.position.y = 1.48;
  g.add(neck);

  // Head
  const head = new THREE.Group();
  head.position.y = 1.68;
  g.add(head);

  const skull = makeMesh(new THREE.SphereGeometry(0.24, 16, 12), skinColor);
  skull.scale.y = 1.12;
  head.add(skull);

  // Hair
  const hairMesh = makeMesh(new THREE.SphereGeometry(0.25, 12, 10), hairColor);
  hairMesh.position.y = 0.12;
  hairMesh.scale.set(1.02, 0.55, 1.02);
  head.add(hairMesh);

  // Side hair
  const sideHairL = makeMesh(new THREE.SphereGeometry(0.08, 8, 6), hairColor);
  sideHairL.position.set(-0.22, 0.02, 0);
  sideHairL.scale.set(0.6, 1, 0.8);
  head.add(sideHairL);
  const sideHairR = makeMesh(new THREE.SphereGeometry(0.08, 8, 6), hairColor);
  sideHairR.position.set(0.22, 0.02, 0);
  sideHairR.scale.set(0.6, 1, 0.8);
  head.add(sideHairR);

  // Eyes
  const eyeWhiteGeo = new THREE.SphereGeometry(0.042, 8, 6);
  const lEyeW = makeMesh(eyeWhiteGeo, 0xffffff);
  lEyeW.position.set(-0.09, 0.04, 0.2);
  head.add(lEyeW);
  const rEyeW = makeMesh(eyeWhiteGeo, 0xffffff);
  rEyeW.position.set(0.09, 0.04, 0.2);
  head.add(rEyeW);

  const pupilGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const lPupil = makeMesh(pupilGeo, 0x2d1b00);
  lPupil.position.set(-0.09, 0.04, 0.235);
  head.add(lPupil);
  const rPupil = makeMesh(pupilGeo, 0x2d1b00);
  rPupil.position.set(0.09, 0.04, 0.235);
  head.add(rPupil);

  // Eyelids
  const lLid = makeMesh(new THREE.SphereGeometry(0.045, 8, 6), skinColor);
  lLid.position.set(-0.09, 0.04, 0.22);
  head.add(lLid);
  const rLid = makeMesh(new THREE.SphereGeometry(0.045, 8, 6), skinColor);
  rLid.position.set(0.09, 0.04, 0.22);
  head.add(rLid);

  // Eyebrows
  const browGeo = new THREE.BoxGeometry(0.08, 0.015, 0.02);
  const lBrow = makeMesh(browGeo, hairColor);
  lBrow.position.set(-0.09, 0.1, 0.22);
  head.add(lBrow);
  const rBrow = makeMesh(browGeo, hairColor);
  rBrow.position.set(0.09, 0.1, 0.22);
  head.add(rBrow);

  // Nose
  const nose = makeMesh(new THREE.SphereGeometry(0.04, 6, 5), skinColor);
  nose.position.set(0, -0.02, 0.24);
  nose.scale.set(0.7, 0.65, 0.85);
  head.add(nose);

  // Ears
  const earGeo = new THREE.SphereGeometry(0.04, 6, 5);
  const lEar = makeMesh(earGeo, skinColor);
  lEar.position.set(-0.24, 0.02, 0);
  lEar.scale.set(0.5, 0.8, 0.6);
  head.add(lEar);
  const rEar = makeMesh(earGeo, skinColor);
  rEar.position.set(0.24, 0.02, 0);
  rEar.scale.set(0.5, 0.8, 0.6);
  head.add(rEar);

  // Mouth
  const mouthGrp = new THREE.Group();
  mouthGrp.position.set(0, -0.1, 0.22);
  head.add(mouthGrp);

  const lips = makeMesh(new THREE.BoxGeometry(0.1, 0.03, 0.02), 0x994433);
  mouthGrp.add(lips);
  const inner = makeMesh(new THREE.BoxGeometry(0.07, 0.001, 0.02), 0x3d0000);
  inner.position.y = -0.015;
  mouthGrp.add(inner);

  // Glasses for interviewer
  if (isInterviewer) {
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.2 });
    const glassGeo = new THREE.TorusGeometry(0.06, 0.008, 6, 20);
    const gl = new THREE.Mesh(glassGeo, glassMat);
    gl.position.set(-0.09, 0.05, 0.22);
    head.add(gl);
    const gr = new THREE.Mesh(glassGeo, glassMat);
    gr.position.set(0.09, 0.05, 0.22);
    head.add(gr);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.008, 0.008), glassMat);
    bridge.position.set(0, 0.05, 0.24);
    head.add(bridge);

    // Tie
    const tie = makeMesh(new THREE.BoxGeometry(0.06, 0.32, 0.03), 0x8b2252);
    tie.position.set(0, 1.12, 0.16);
    g.add(tie);
    const tieKnot = makeMesh(new THREE.SphereGeometry(0.035, 6, 5), 0x8b2252);
    tieKnot.position.set(0, 1.3, 0.16);
    g.add(tieKnot);
  }

  // Speaker glow light (activated when talking)
  const speakerGlow = new THREE.PointLight(isInterviewer ? 0x6366f1 : 0x10b981, 0, 3);
  speakerGlow.position.set(0, 1.8, 0.5);
  g.add(speakerGlow);

  scene.add(g);
  return { group: g, head, mouthGrp, lLid, rLid, lUA, rUA, speakerGlow };
}

// ── Office Chair ────────────────────────────────────────────────

function buildChair(scene: THREE.Scene, x: number, rotY: number) {
  const cg = new THREE.Group();
  const cushionColor = 0x1e293b;
  const metalColor = 0x888888;

  // Seat cushion
  const seat = makeMesh(new THREE.BoxGeometry(0.56, 0.08, 0.52), cushionColor, { roughness: 0.85 });
  seat.position.y = 0.52;
  cg.add(seat);

  // Back rest
  const back = makeMesh(new THREE.BoxGeometry(0.52, 0.58, 0.06), cushionColor, { roughness: 0.85 });
  back.position.set(0, 0.84, -0.24);
  cg.add(back);

  // Armrests
  const armGeo = new THREE.BoxGeometry(0.06, 0.04, 0.36);
  const lArm = makeMesh(armGeo, cushionColor);
  lArm.position.set(-0.28, 0.66, -0.04);
  cg.add(lArm);
  const rArm = makeMesh(armGeo, cushionColor);
  rArm.position.set(0.28, 0.66, -0.04);
  cg.add(rArm);

  // Armrest supports
  const supportGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.14, 6);
  const lSupport = makeMesh(supportGeo, metalColor, { metalness: 0.7 });
  lSupport.position.set(-0.28, 0.58, -0.04);
  cg.add(lSupport);
  const rSupport = makeMesh(supportGeo, metalColor, { metalness: 0.7 });
  rSupport.position.set(0.28, 0.58, -0.04);
  cg.add(rSupport);

  // Metal legs (4 legs)
  const legGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.52, 6);
  [[-0.2, 0.2], [0.2, 0.2], [-0.2, -0.2], [0.2, -0.2]].forEach(([px, pz]) => {
    const leg = makeMesh(legGeo, metalColor, { metalness: 0.8, roughness: 0.2 });
    leg.position.set(px, 0.26, pz);
    cg.add(leg);
  });

  cg.position.set(x, 0, 1.2);
  cg.rotation.y = rotY;
  scene.add(cg);
}

// ── Desk with Props ─────────────────────────────────────────────

function buildTable(scene: THREE.Scene) {
  const tg = new THREE.Group();
  const woodColor = 0x5c3a1e;

  // Table top
  const top = makeMesh(new THREE.BoxGeometry(3.2, 0.08, 1.4), woodColor, { roughness: 0.35, metalness: 0.08 });
  top.position.y = 0.88;
  tg.add(top);

  // Table legs (metal)
  const legGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.84, 8);
  [[-1.4, -0.6], [-1.4, 0.6], [1.4, -0.6], [1.4, 0.6]].forEach(([x, z]) => {
    const leg = makeMesh(legGeo, 0x666666, { metalness: 0.8, roughness: 0.2 });
    leg.position.set(x, 0.44, z);
    tg.add(leg);
  });

  // Laptop (interviewer side)
  const laptopBase = makeMesh(new THREE.BoxGeometry(0.4, 0.02, 0.28), 0x333333, { metalness: 0.5 });
  laptopBase.position.set(-0.8, 0.93, -0.1);
  tg.add(laptopBase);
  const laptopScreen = makeMesh(new THREE.BoxGeometry(0.38, 0.26, 0.012), 0x222222, { metalness: 0.3 });
  laptopScreen.position.set(-0.8, 1.06, -0.24);
  laptopScreen.rotation.x = -0.15;
  tg.add(laptopScreen);
  // Screen glow
  const screenFace = makeMesh(new THREE.PlaneGeometry(0.34, 0.22), 0x334488);
  (screenFace.material as THREE.MeshStandardMaterial).emissive = new THREE.Color(0x334488);
  (screenFace.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.3;
  screenFace.position.set(-0.8, 1.06, -0.233);
  screenFace.rotation.x = -0.15;
  tg.add(screenFace);

  // Notepad
  const notepad = makeMesh(new THREE.BoxGeometry(0.18, 0.012, 0.24), 0xf5f0e0);
  notepad.position.set(-0.3, 0.928, 0.15);
  tg.add(notepad);
  // Pen
  const pen = makeMesh(new THREE.CylinderGeometry(0.008, 0.008, 0.18, 6), 0x1a1a88);
  pen.position.set(-0.18, 0.938, 0.15);
  pen.rotation.z = Math.PI / 2;
  pen.rotation.y = 0.3;
  tg.add(pen);

  // Water glass (candidate side)
  const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaddff, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.1 });
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.035, 0.12, 12), glassMat);
  glass.position.set(0.7, 0.95, 0.2);
  tg.add(glass);
  // Water
  const water = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.032, 0.08, 12),
    new THREE.MeshStandardMaterial({ color: 0x4488cc, transparent: true, opacity: 0.5 })
  );
  water.position.set(0.7, 0.94, 0.2);
  tg.add(water);

  scene.add(tg);
}

// ── Professional Office ─────────────────────────────────────────

function buildOffice(scene: THREE.Scene) {
  const floorColor = 0x8b7355;
  const wallColor = 0xe8e0d0;
  const ceilingColor = 0xf5f5f0;

  // Floor (wood-look)
  const floor = makeMesh(new THREE.PlaneGeometry(12, 12), floorColor, { roughness: 0.6, metalness: 0.05 });
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // Back wall
  const backWall = makeMesh(new THREE.PlaneGeometry(12, 5), wallColor, { roughness: 0.9 });
  backWall.position.set(0, 2.5, -4);
  scene.add(backWall);

  // Left wall
  const leftWall = makeMesh(new THREE.PlaneGeometry(12, 5), wallColor, { roughness: 0.9 });
  leftWall.position.set(-6, 2.5, 0);
  leftWall.rotation.y = Math.PI / 2;
  scene.add(leftWall);

  // Right wall
  const rightWall = makeMesh(new THREE.PlaneGeometry(12, 5), wallColor, { roughness: 0.9 });
  rightWall.position.set(6, 2.5, 0);
  rightWall.rotation.y = -Math.PI / 2;
  scene.add(rightWall);

  // Ceiling
  const ceiling = makeMesh(new THREE.PlaneGeometry(12, 12), ceilingColor);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = 5;
  scene.add(ceiling);

  // Window (back wall, left side)
  const windowFrame = makeMesh(new THREE.BoxGeometry(2.4, 2.2, 0.08), 0x555555, { metalness: 0.3 });
  windowFrame.position.set(-2.2, 2.8, -3.96);
  scene.add(windowFrame);

  // Window glass (emissive to simulate outside light)
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2),
    new THREE.MeshStandardMaterial({
      color: 0x88bbee,
      emissive: 0x88bbee,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.7,
    })
  );
  windowGlass.position.set(-2.2, 2.8, -3.92);
  scene.add(windowGlass);

  // Window dividers
  const divH = makeMesh(new THREE.BoxGeometry(2.2, 0.04, 0.05), 0x555555, { metalness: 0.3 });
  divH.position.set(-2.2, 2.8, -3.93);
  scene.add(divH);
  const divV = makeMesh(new THREE.BoxGeometry(0.04, 2, 0.05), 0x555555, { metalness: 0.3 });
  divV.position.set(-2.2, 2.8, -3.93);
  scene.add(divV);

  // Ceiling light panel
  const lightPanel = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.04, 0.8),
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xfff8e8,
      emissiveIntensity: 0.5,
    })
  );
  lightPanel.position.set(0, 4.96, 0);
  scene.add(lightPanel);

  // Rug under table
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(4.5, 3.5),
    new THREE.MeshStandardMaterial({ color: 0x3d3244, roughness: 0.95 })
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.005, 0.5);
  scene.add(rug);

  // Bookshelf (back wall, right side)
  const shelfGroup = new THREE.Group();
  shelfGroup.position.set(2.5, 0, -3.8);

  // Shelf frame
  const shelfFrame = makeMesh(new THREE.BoxGeometry(1.2, 2.8, 0.35), 0x5c3a1e, { roughness: 0.5 });
  shelfFrame.position.y = 1.8;
  shelfGroup.add(shelfFrame);

  // Shelf boards
  for (let i = 0; i < 4; i++) {
    const board = makeMesh(new THREE.BoxGeometry(1.1, 0.03, 0.32), 0x6b4423);
    board.position.set(0, 0.6 + i * 0.7, 0.02);
    shelfGroup.add(board);
  }

  // Books on shelves
  const bookColors = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xe67e22, 0x1abc9c, 0xf39c12, 0x2c3e50];
  for (let shelf = 0; shelf < 3; shelf++) {
    const y = 0.76 + shelf * 0.7;
    const numBooks = 4 + Math.floor(Math.random() * 3);
    let xPos = -0.4;
    for (let b = 0; b < numBooks; b++) {
      const w = 0.04 + Math.random() * 0.06;
      const h = 0.2 + Math.random() * 0.12;
      const book = makeMesh(
        new THREE.BoxGeometry(w, h, 0.2),
        bookColors[(shelf * 5 + b) % bookColors.length]
      );
      book.position.set(xPos + w / 2, y + h / 2, 0);
      shelfGroup.add(book);
      xPos += w + 0.02;
    }
  }
  scene.add(shelfGroup);

  // Potted plant (corner)
  const potGroup = new THREE.Group();
  potGroup.position.set(-4.5, 0, -3);

  const pot = makeMesh(new THREE.CylinderGeometry(0.18, 0.14, 0.3, 8), 0x8b4513, { roughness: 0.8 });
  pot.position.y = 0.15;
  potGroup.add(pot);
  const soil = makeMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.03, 8), 0x3d2b1f);
  soil.position.y = 0.31;
  potGroup.add(soil);

  // Plant leaves
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), leafMat);
    const angle = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(angle) * 0.1, 0.45 + Math.random() * 0.2, Math.sin(angle) * 0.1);
    leaf.scale.set(1, 0.6, 0.8);
    potGroup.add(leaf);
  }
  // Center leaves
  const centerLeaf = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 5), leafMat);
  centerLeaf.position.y = 0.6;
  potGroup.add(centerLeaf);

  scene.add(potGroup);

  // Wall art / certificate frame (back wall center)
  const frameOuter = makeMesh(new THREE.BoxGeometry(1.0, 0.7, 0.04), 0x4a3520, { roughness: 0.4, metalness: 0.1 });
  frameOuter.position.set(0, 3.2, -3.96);
  scene.add(frameOuter);
  const frameInner = new THREE.Mesh(
    new THREE.PlaneGeometry(0.85, 0.55),
    new THREE.MeshStandardMaterial({ color: 0xf8f4e8 })
  );
  frameInner.position.set(0, 3.2, -3.93);
  scene.add(frameInner);
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
  const [followUpFlags, setFollowUpFlags] = useState<boolean[]>(interviewQs.map(() => false));
  const [autoFeedbackDone, setAutoFeedbackDone] = useState(false);

  // ── Three.js setup (Professional Scene) ────────────────────────

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd4c8b8);
    scene.fog = new THREE.FogExp2(0xd4c8b8, 0.04);

    const camera = new THREE.PerspectiveCamera(48, W / H, 0.1, 100);
    camera.position.set(0, 2.55, 4.8);
    camera.lookAt(0, 1.5, 0);

    // ── Lighting (Professional Studio) ──────────────────────────

    // Ambient fill
    scene.add(new THREE.AmbientLight(0xfff8f0, 0.35));

    // Key light (warm sun from window direction)
    const keyLight = new THREE.DirectionalLight(0xfff0d4, 1.8);
    keyLight.position.set(-4, 6, 2);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 20;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -2;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.radius = 4;
    scene.add(keyLight);

    // Fill light (cool blue from right)
    const fillLight = new THREE.DirectionalLight(0xc7d8ff, 0.5);
    fillLight.position.set(5, 3, 3);
    scene.add(fillLight);

    // Rim/back light
    const rimLight = new THREE.DirectionalLight(0xffeedd, 0.6);
    rimLight.position.set(0, 4, -4);
    scene.add(rimLight);

    // Ceiling light
    const ceilingLight = new THREE.PointLight(0xfff8e8, 0.6, 8);
    ceilingLight.position.set(0, 4.5, 0.5);
    scene.add(ceilingLight);

    // ── Build Office Environment ────────────────────────────────
    buildOffice(scene);
    buildTable(scene);
    buildChair(scene, -1.6, 0.4);
    buildChair(scene, 1.6, -0.4);

    // ── Characters ──────────────────────────────────────────────

    // Interviewer (left): darker skin, navy suit, dark hair
    const iv = buildPerson(scene, 0xc68642, 0x1a1a3e, 0x2a2030, true);
    iv.group.position.set(-1.6, 0, 0.7);
    iv.group.rotation.y = 0.4;

    // Candidate (right): lighter skin, charcoal suit, brown hair
    const cd = buildPerson(scene, 0xfcd9b0, 0x2d2d3a, 0x3b2000, false);
    cd.group.position.set(1.6, 0, 0.7);
    cd.group.rotation.y = -0.4;

    sceneRef.current = { renderer, scene, camera, iv, cd };

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
        const s = talking ? Math.abs(Math.sin(ts / 90)) * 0.85 + 0.15 : 0;
        ch.mouthGrp.scale.y = 1 + s * 2.8;
        ch.mouthGrp.position.y = -0.1 - s * 0.035;
        // Speaker glow
        ch.speakerGlow.intensity = talking ? 0.8 + Math.sin(ts / 300) * 0.3 : 0;
      });

      // Head bob/nod
      [
        { ch: sr.iv, talking: interviewerTalking, listening: candidateTalking },
        { ch: sr.cd, talking: candidateTalking, listening: interviewerTalking },
      ].forEach(({ ch, talking, listening }) => {
        ch.head.position.y = talking ? 1.68 + Math.sin(ts / 170) * 0.02 : 1.68;
        ch.head.rotation.x = listening ? Math.sin(ts / 800) * 0.045 : 0;
      });

      // Side tilt
      sr.iv.head.rotation.z = !interviewerTalking && candidateTalking ? Math.sin(ts / 650) * 0.035 : 0;
      sr.cd.head.rotation.z = !candidateTalking && interviewerTalking ? Math.sin(ts / 650) * 0.035 : 0;

      // Arm gesture
      [
        { ch: sr.iv, talking: interviewerTalking },
        { ch: sr.cd, talking: candidateTalking },
      ].forEach(({ ch, talking }) => {
        const sw = talking ? Math.sin(ts / 350) * 0.15 : 0;
        ch.lUA.rotation.z = Math.PI / 8 + sw;
        ch.rUA.rotation.z = -(Math.PI / 8 + sw);
      });

      // Eye blink
      st.blinkTimer += dt;
      if (st.blinkTimer > 3200) { st.blinkTimer = 0; st.blinkState = 1; }
      if (st.blinkState === 1) {
        [sr.iv.lLid, sr.iv.rLid, sr.cd.lLid, sr.cd.rLid].forEach((l) => {
          l.scale.y = Math.max(0.05, l.scale.y - 0.3);
        });
        if (sr.iv.lLid.scale.y <= 0.05) st.blinkState = 2;
      } else if (st.blinkState === 2) {
        [sr.iv.lLid, sr.iv.rLid, sr.cd.lLid, sr.cd.rLid].forEach((l) => {
          l.scale.y = Math.min(1, l.scale.y + 0.35);
        });
        if (sr.iv.lLid.scale.y >= 1) st.blinkState = 0;
      }

      // Gentle camera drift
      camera.position.x = Math.sin(ts / 10000) * 0.15;
      camera.position.y = 2.55 + Math.sin(ts / 7000) * 0.05;
      camera.lookAt(0, 1.5, 0);

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

  // ── Render ────────────────────────────────────────────────────

  return (
    <div style={{ width: "100%", height: "100vh", background: "#d4c8b8", display: "flex", flexDirection: "column", position: "relative" }}>
      {/* Three.js canvas */}
      <div ref={mountRef} style={{ flex: 1, overflow: "hidden" }} />

      {/* Speech bubble overlay (HTML-based) */}
      {bubbleText && mode !== "intro" && (
        <div style={{
          position: "absolute",
          top: activeSpeaker === "interviewer" ? 60 : 60,
          left: activeSpeaker === "interviewer" ? "8%" : "auto",
          right: activeSpeaker === "candidate" ? "8%" : "auto",
          maxWidth: 340,
          background: "rgba(255,255,255,0.95)",
          borderRadius: 16,
          padding: "12px 18px",
          border: `2px solid ${activeSpeaker === "interviewer" ? "#6366f1" : "#10b981"}`,
          boxShadow: `0 4px 20px ${activeSpeaker === "interviewer" ? "rgba(99,102,241,0.25)" : "rgba(16,185,129,0.25)"}`,
          fontSize: 14,
          color: "#1e293b",
          lineHeight: 1.5,
          fontWeight: 500,
          zIndex: 10,
          animation: "fadeIn 0.2s ease-out",
        }}>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: 1,
            color: activeSpeaker === "interviewer" ? "#6366f1" : "#10b981",
            marginBottom: 4,
          }}>
            {activeSpeaker === "interviewer" ? "Interviewer" : "You"}
          </div>
          {bubbleText}
          {/* Triangle pointer */}
          <div style={{
            position: "absolute",
            bottom: -10,
            left: activeSpeaker === "interviewer" ? 30 : "auto",
            right: activeSpeaker === "candidate" ? 30 : "auto",
            width: 0, height: 0,
            borderLeft: "10px solid transparent",
            borderRight: "10px solid transparent",
            borderTop: `10px solid ${activeSpeaker === "interviewer" ? "#6366f1" : "#10b981"}`,
          }} />
        </div>
      )}

      {/* Speaker label */}
      <div style={{
        position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
        background: "rgba(0,0,0,0.65)", borderRadius: 999, padding: "6px 20px",
        color: mode === "feedback" ? "#f59e0b" : activeSpeaker === "interviewer" ? "#6366f1" : "#10b981",
        fontSize: 13, fontWeight: 700, letterSpacing: 0.5,
        border: `1px solid ${mode === "feedback" ? "#f59e0b55" : activeSpeaker === "interviewer" ? "#6366f155" : "#10b98155"}`,
        backdropFilter: "blur(8px)",
        zIndex: 20,
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
          zIndex: 20,
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
                background: showQuestionText ? "rgba(99,102,241,0.85)" : "rgba(0,0,0,0.65)",
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
            background: "rgba(0,0,0,0.65)", borderRadius: 999, padding: "6px 16px",
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
          zIndex: 20,
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
                <span style={{ color: "#64748b", fontSize: 13, marginLeft: 10 }}>Listening to interviewer... tap i to read</span>
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
                      <div style={{ background: "rgba(99,102,241,0.12)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                        <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Score</div>
                        <div style={{ color: "#6366f1", fontSize: 22, fontWeight: 800 }}>
                          {(feedbackData.analysis as any).overall_score || (feedbackData.analysis as any).session_score || "—"}
                        </div>
                      </div>
                      {(feedbackData.analysis as any).readiness_label && (
                        <div style={{ background: "rgba(16,185,129,0.12)", borderRadius: 8, padding: "8px 14px", minWidth: 80 }}>
                          <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 600 }}>Readiness</div>
                          <div style={{ color: "#10b981", fontSize: 14, fontWeight: 700 }}>
                            {(feedbackData.analysis as any).readiness_label}
                          </div>
                        </div>
                      )}
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
        zIndex: 20,
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
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
