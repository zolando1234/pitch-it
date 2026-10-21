import assert from "node:assert/strict";
import { test } from "node:test";
import {
  analyzeHand,
  countOnFingers,
  palmDirection,
  type Hands,
  type HandInfo,
  type World3,
} from "../src/lib/coach/pose/hands.ts";
import { LM, MetricsTracker } from "../src/lib/coach/pose/metrics.ts";
import { handLabel } from "../src/lib/coach/pose/renderer.ts";

/*
  Syntetická pravá ruka prstami hore: každý prst je buď vystretý (ext), alebo ohnutý (curl),
  palec vystretý do strany alebo zložený. Pixely = svetové body × 2000 (y dole, ako v obraze).
*/
type F = "ext" | "curl";
const BASE_X = [-0.03, -0.01, 0.01, 0.03];

function hand(thumb: boolean, fingers: [F, F, F, F]): { px: { x: number; y: number }[]; world: World3[] } {
  const w: World3[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  w[0] = { x: 0, y: 0.08, z: 0 };
  const thumbPts = thumb
    ? [{ x: -0.04, y: 0.06, z: 0 }, { x: -0.06, y: 0.04, z: 0 }, { x: -0.075, y: 0.02, z: 0 }, { x: -0.09, y: 0, z: 0 }]
    : [{ x: -0.02, y: 0.06, z: -0.01 }, { x: -0.02, y: 0.04, z: -0.02 }, { x: -0.01, y: 0.03, z: -0.03 }, { x: 0, y: 0.025, z: -0.03 }];
  thumbPts.forEach((p, i) => (w[1 + i] = p));
  fingers.forEach((f, i) => {
    const x = BASE_X[i];
    const b = 5 + i * 4;
    w[b] = { x, y: 0, z: 0 };
    if (f === "ext") {
      w[b + 1] = { x, y: -0.04, z: 0 };
      w[b + 2] = { x, y: -0.065, z: 0 };
      w[b + 3] = { x, y: -0.085, z: 0 };
    } else {
      w[b + 1] = { x, y: -0.035, z: 0 };
      w[b + 2] = { x, y: -0.035, z: -0.025 };
      w[b + 3] = { x, y: -0.015, z: -0.03 };
    }
  });
  return { px: w.map((p) => ({ x: 500 + p.x * 2000, y: 400 + p.y * 2000 })), world: w };
}

const read = (thumb: boolean, fingers: [F, F, F, F]) => {
  const h = hand(thumb, fingers);
  return analyzeHand(h.px, "right", h.world);
};

test("vztýčený prostredník je vulgárne gesto, nie počítanie", () => {
  const info = read(false, ["curl", "ext", "curl", "curl"]);
  assert.equal(info.gesture, "middle_finger");
  assert.equal(info.count, null);
  assert.equal(handLabel(info).startsWith("vulgárne gesto"), true);
});

test("počítanie na prstoch: od ukazováka aj od palca", () => {
  assert.equal(read(false, ["ext", "curl", "curl", "curl"]).count, 1);
  const two = read(false, ["ext", "ext", "curl", "curl"]);
  assert.equal(two.count, 2);
  assert.equal(two.gesture, "victory");
  assert.equal(read(false, ["ext", "ext", "ext", "curl"]).count, 3);
  assert.equal(read(true, ["ext", "ext", "curl", "curl"]).count, 3);
  assert.equal(read(false, ["ext", "ext", "ext", "ext"]).count, 4);
  assert.equal(read(true, ["ext", "ext", "ext", "ext"]).count, 5);
  assert.equal(read(true, ["ext", "ext", "ext", "ext"]).shape, "open");
  // rohy nie sú počítanie
  assert.equal(read(false, ["ext", "curl", "curl", "ext"]).count, null);
});

test("pištoľ z prstov: palec hore a ukazovák do strany", () => {
  const h = hand(true, ["ext", "curl", "curl", "curl"]);
  // ukazovák otočíme do strany (vodorovne)
  h.world[6] = { x: -0.07, y: 0, z: 0 };
  h.world[7] = { x: -0.095, y: 0, z: 0 };
  h.world[8] = { x: -0.115, y: 0, z: 0 };
  h.px = h.world.map((p) => ({ x: 500 + p.x * 2000, y: 400 + p.y * 2000 }));
  const info = analyzeHand(h.px, "right", h.world);
  assert.equal(info.gesture, "finger_gun");
  assert.equal(info.shape, "point");
});

test("smer dlane z normály a počítanie bez zdvihnutej ruky", () => {
  assert.equal(palmDirection({ x: 0, y: 0, z: -1 }), "front");
  assert.equal(palmDirection({ x: 0, y: 0, z: 1 }), "back");
  assert.equal(palmDirection({ x: 1, y: 0, z: 0 }), "edge");
  assert.equal(palmDirection({ x: 0, y: -0.9, z: -0.3 }), "up");
  assert.equal(palmDirection({ x: 0, y: 0.9, z: 0.3 }), "down");
  assert.equal(palmDirection(null), null);
  const f = { thumb: false, index: true, middle: true, ring: false, pinky: false };
  assert.equal(countOnFingers(f, true), 2);
  assert.equal(countOnFingers(f, false), null);
});

// ── Celé telo: čelom / chrbtom, vulgárne gesto v metrikách ─────────────────────

const W = 1280;
const H = 720;

function body(faceVisibility = 0.99) {
  const lm = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, z: 0, visibility: 0.99 }));
  const set = (i: number, x: number, y: number, v = 0.99) => (lm[i] = { x, y, z: 0, visibility: v });
  set(LM.nose, 0.5, 0.25, faceVisibility);
  set(LM.leftEye, 0.51, 0.23, faceVisibility);
  set(LM.rightEye, 0.49, 0.23, faceVisibility);
  set(LM.leftShoulder, 0.58, 0.4);
  set(LM.rightShoulder, 0.42, 0.4);
  set(LM.leftElbow, 0.62, 0.52);
  set(LM.rightElbow, 0.38, 0.52);
  set(LM.leftWrist, 0.62, 0.45);
  set(LM.rightWrist, 0.38, 0.45);
  set(LM.leftHip, 0.55, 0.7);
  set(LM.rightHip, 0.45, 0.7);
  set(LM.leftKnee, 0.55, 0.85);
  set(LM.rightKnee, 0.45, 0.85);
  set(LM.leftAnkle, 0.55, 0.97);
  set(LM.rightAnkle, 0.45, 0.97);
  const world = lm.map(() => ({ x: 0, y: 0, z: 0, visibility: 0.99 }));
  world[LM.leftShoulder] = { x: 0.18, y: -0.5, z: 0, visibility: 0.99 };
  world[LM.rightShoulder] = { x: -0.18, y: -0.5, z: 0, visibility: 0.99 };
  world[LM.nose] = { x: 0, y: -0.65, z: -0.12, visibility: 0.99 };
  return { lm, world };
}

test("chrbtom ku kamere: tvár nevidno, ramená áno", () => {
  const front = new MetricsTracker();
  const f = body();
  assert.equal(front.update(f.lm, f.world, null, 1000, W, H).facing, "front");

  const back = new MetricsTracker();
  const b = body(0.05);
  const m = back.update(b.lm, b.world, null, 1000, W, H);
  assert.equal(m.facing, "back");
  assert.equal(m.turned, false);
});

test("prostredník v ruke sa prejaví ako vulgárne gesto v metrikách", () => {
  const tracker = new MetricsTracker();
  const { lm, world } = body();
  const h = hand(false, ["curl", "ext", "curl", "curl"]);
  const info: HandInfo = analyzeHand(
    h.px.map((p) => ({ x: p.x - 500 + 0.38 * W, y: p.y - 400 + 0.45 * H })),
    "right",
    h.world,
  );
  const hands: Hands = { left: null, right: info };
  const m = tracker.update(lm, world, hands, 1000, W, H);
  assert.equal(m.vulgar, true);
  assert.equal(m.rightHand?.gesture, "middle_finger");
});

// ── Pohyb po pódiu: chvenie a otáčanie nie je chodenie sem a tam ───────────────

function shifted(dx: number, turn = 0, jitter = 0) {
  const { lm, world } = body();
  for (const p of lm) p.x += dx + (Math.random() - 0.5) * jitter;
  // otočenie bokom: ramená sa v obraze zúžia, v 3D rozídu do hĺbky
  lm[LM.leftShoulder].x -= turn * 0.07;
  lm[LM.rightShoulder].x += turn * 0.07;
  world[LM.leftShoulder].z = -turn * 0.15;
  world[LM.rightShoulder].z = turn * 0.15;
  return { lm, world };
}

test("stáť na mieste s chvením a otáčaním nie je „chodíš sem a tam“", () => {
  const tracker = new MetricsTracker();
  let pacing = false;
  for (let t = 0; t <= 14000; t += 33) {
    const turn = Math.abs(Math.sin(t / 1500));
    const { lm, world } = shifted(0, turn, 0.012);
    pacing ||= tracker.update(lm, world, null, t, W, H).pacing;
  }
  assert.equal(pacing, false);
});

test("skutočná chôdza tam a späť po pódiu je „chodíš sem a tam“", () => {
  const tracker = new MetricsTracker();
  let pacing = false;
  for (let t = 0; t <= 14000; t += 33) {
    const { lm, world } = shifted(0.3 * Math.sin(t / 900));
    pacing ||= tracker.update(lm, world, null, t, W, H).pacing;
  }
  assert.equal(pacing, true);
});
