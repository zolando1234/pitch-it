import type { Landmark, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { CONFIG } from "./config";
import type { HandInfo, Hands } from "./hands";

export const LM = {
  nose: 0,
  leftEye: 2,
  rightEye: 5,
  leftEar: 7,
  rightEar: 8,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  // body ruky z modelu pózy (hrubé, ale vieme z nich, či je ruka zakrytá)
  leftPinky: 17,
  rightPinky: 18,
  leftIndex: 19,
  rightIndex: 20,
  leftThumb: 21,
  rightThumb: 22,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

export type Point = { x: number; y: number };

/**
 * Postoj nôh z bodov v pixeloch. `facing` je znamienko (ľavé rameno x − pravé rameno x):
 * pri pohľade do kamery majú ľavý členok a koleno rovnakú stranu ako ľavé rameno.
 * Prekrížené = ľavá noha je na strane pravej (o aspoň `legsCrossedMargin` šírok ramien).
 */
export function legsPose(
  p: { leftKnee: Point | null; rightKnee: Point | null; leftAnkle: Point | null; rightAnkle: Point | null },
  sw: number,
  facing: number,
): { legsVisible: boolean; legsCrossed: boolean; narrowStance: boolean } {
  const legsVisible = !!p.leftKnee && !!p.rightKnee;
  if (!legsVisible || facing === 0) return { legsVisible, legsCrossed: false, narrowStance: false };
  const swapped = (l: Point, r: Point) => ((l.x - r.x) * Math.sign(facing)) / sw < -CONFIG.legsCrossedMargin;
  const anklesCrossed = !!p.leftAnkle && !!p.rightAnkle && swapped(p.leftAnkle, p.rightAnkle);
  const kneesCrossed = swapped(p.leftKnee!, p.rightKnee!);
  const narrowStance =
    !anklesCrossed && !!p.leftAnkle && !!p.rightAnkle && Math.abs(p.leftAnkle.x - p.rightAnkle.x) / sw < CONFIG.narrowStance;
  return { legsVisible, legsCrossed: anklesCrossed || kneesCrossed, narrowStance };
}
export type Zone = { top: number; bottom: number; left: number; right: number };
/** Strany sú z pohľadu rečníka (= ako v zrkadle na obrazovke). */
export type Side = "left" | "center" | "right";
/** v ktorej ruke rečník drží mikrofón (z jeho pohľadu); auto = rozpoznať podľa ruky pri ústach */
export type MicHand = "auto" | "left" | "right";
export type HiddenKind = "pocket" | "behind" | "unseen" | null;
export type Facing = "front" | "side" | "back";
export type Highlight = "wide" | "hold" | "planted" | "sweep" | "palms" | "count";

export type Metrics = {
  /** šírka ramien v pixeloch */
  sw: number;
  shoulderRatio: number;

  // gestá
  leftWrist: Point | null;
  rightWrist: Point | null;
  /** zápästia, ktoré vidno a nie sú vo vrecku / za chrbtom */
  visibleWrists: number;
  hidden: { left: boolean; right: boolean };
  /** kde je skrytá ruka: vo vrecku, za chrbtom, alebo ju kamera nevidí (mimo záberu, zakrytá) */
  hiddenKind: Record<"left" | "right", HiddenKind>;
  /** v režime s mikrofónom: ruka, ktorá drží mikrofón (vyradená z hodnotenia gest) */
  micSide: "left" | "right" | null;
  /** mikrofón je príliš ďaleko od úst */
  micAway: boolean;
  leftHand: HandInfo | null;
  rightHand: HandInfo | null;
  handsOnHips: boolean;
  figLeaf: boolean;
  fists: boolean;
  pointing: boolean;
  palmsAway: boolean;
  /** otvorená ruka dlaňou dole (tlmenie, príkaz) */
  palmsDown: boolean;
  wringing: boolean;
  /** vulgárne gesto (vztýčený prostredník) */
  vulgar: boolean;
  /** V chrbtom ruky k publiku (v UK, Írsku, Austrálii urážka) */
  vBackhand: boolean;
  thumbDown: boolean;
  fingerGun: boolean;
  /** počet gest za minútu (null, kým nemáme dosť dát) */
  gesturesPerMin: number | null;
  zone: Zone;
  wristsInZone: number;
  handsLow: boolean;
  handsHigh: boolean;
  spread: number | null;
  crossed: boolean;
  clasped: boolean;
  faceTouch: boolean;
  tRex: boolean;
  oneHand: boolean;
  activity3s: number;
  activity5s: number;
  fidget: boolean;
  repetitive: boolean;
  noHold: boolean;

  // hlava a pohľad
  nose: Point;
  /** natočenie hlavy, kladné = rečník pozerá doprava */
  gazeYaw: number;
  gaze: Side;
  gazeShare: Record<Side, number>;
  gazeSpanMs: number;
  gazeStuck: boolean;
  gazeDarting: boolean;
  /** sklon hlavy oproti kalibrácii (kladné = dole) */
  headPitch: number;
  calibrated: boolean;
  headDown: boolean;
  nodding: boolean;

  // postoj
  shoulderTilt: number;
  /** stojí bokom (nie chrbtom) */
  turned: boolean;
  /** čelom / bokom / chrbtom ku kamere */
  facing: Facing;
  /** natočenie ramien od kamery v stupňoch (0 = čelom, 90 = bokom); null bez 3D bodov */
  turnDeg: number | null;
  /** kamera vidí kolená (nohy sa dajú hodnotiť) */
  legsVisible: boolean;
  /** prekrížené nohy (členky alebo kolená) */
  legsCrossed: boolean;
  /** chodidlá tesne pri sebe */
  narrowStance: boolean;

  // pohyb po pódiu
  hipsVisible: boolean;
  /** poloha na pódiu 0 (rečníkova ľavá) .. 1 (pravá) */
  stageX: number;
  stage: Side;
  walking: boolean;
  pacing: boolean;
  nearEdge: boolean;
  sway: boolean;
  msSinceStep: number;

  /** dobré momenty, ktoré sa stali práve v tomto snímku */
  highlights: Highlight[];
};

type Frame = {
  t: number;
  lw: Point | null;
  rw: Point | null;
  lwSpeed: number;
  rwSpeed: number;
  body: Point;
  noseRelY: number;
  fingerMotion: number;
  sw: number;
  /** stabilná šírka ramien (maximum za posledné ~3 s): pri natočení bokom sa skutočná šírka zúži */
  refSw: number;
};

/** Riedka dlhá história (10 Hz) pre pohľad a pohyb po pódiu. */
type LongSample = { t: number; gaze: Side; bodyX: number; sw: number };

const HISTORY_MS = 8000;
const LONG_HISTORY_MS = 20000;
const LONG_SAMPLE_MS = 100;

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const sideOf = (v: number, threshold: number): Side =>
  v < -threshold ? "left" : v > threshold ? "right" : "center";

/** Drží históriu snímok a počíta z nej metriky pohybu. */
export class MetricsTracker {
  private micMode = false;
  private micHand: MicHand = "auto";
  private micSide: "left" | "right" | null = null;
  private micDist = { left: 1, right: 1 };

  /**
   * Rečník drží mikrofón: jedna ruka sa nehodnotí ako gestikulujúca.
   * Pravák ho zvyčajne drží v ľavej ruke (pravou gestikuluje), ľavák naopak.
   */
  setMicMode(on: boolean, hand: MicHand = "auto") {
    this.micMode = on;
    this.micHand = hand;
    this.micSide = hand === "auto" ? null : hand;
  }

  private frames: Frame[] = [];
  private long: LongSample[] = [];
  private smoothYaw = 0;
  private stepAnchor: Point | null = null;
  private lastStepAt = 0;
  private pendingStep = false;
  private plantedSince: number | null = null;
  private wristsStillSince: number | null = null;
  private holdFired = false;
  private startT: number | null = null;
  private gestureOnsets: number[] = [];
  private gestureMoving = false;
  private gestureCalmSince: number | null = null;
  private palmSamples: { t: number; facing: boolean }[] = [];
  private countSince: number | null = null;
  private prevHands: Hands = { left: null, right: null };
  private prevHandsT = -Infinity;
  private pocketFramesL = 0;
  private pocketFramesR = 0;
  private pitchSamples: number[] = [];
  private pitchBaseline: number | null = null;

  /** úplný reset vrátane kalibrácie (nový tréning) */
  resetAll() {
    this.reset();
    this.startT = null;
    this.gestureOnsets = [];
    this.pitchSamples = [];
    this.pitchBaseline = null;
  }

  /** mäkký reset, keď človek zmizne zo záberu (kalibrácia ostáva) */
  reset() {
    this.gestureMoving = false;
    this.gestureCalmSince = null;
    this.palmSamples = [];
    this.countSince = null;
    this.prevHands = { left: null, right: null };
    this.prevHandsT = -Infinity;
    this.pocketFramesL = this.pocketFramesR = 0;
    this.frames = [];
    this.long = [];
    this.smoothYaw = 0;
    this.stepAnchor = null;
    this.lastStepAt = 0;
    this.pendingStep = false;
    this.plantedSince = null;
    this.wristsStillSince = null;
    this.holdFired = false;
  }

  update(
    lm: NormalizedLandmark[],
    world: Landmark[] | undefined,
    hands: Hands | null,
    t: number,
    width: number,
    height: number,
  ): Metrics {
    const px = (i: number): Point => ({ x: lm[i].x * width, y: lm[i].y * height });
    const vis = (i: number) => (lm[i].visibility ?? 1) >= CONFIG.minVisibility;
    const highlights: Highlight[] = [];

    const ls = px(LM.leftShoulder);
    const rs = px(LM.rightShoulder);
    const sw = Math.max(dist(ls, rs), 1);
    const shoulderMid = { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    const nose = px(LM.nose);
    const prev = this.frames[this.frames.length - 1];
    const dt = prev ? Math.max((t - prev.t) / 1000, 0.001) : 0;

    this.startT ??= t;

    // ── Telo ───────────────────────────────────────────────
    const hipsVisible = vis(LM.leftHip) && vis(LM.rightHip);
    const lh = px(LM.leftHip);
    const rh = px(LM.rightHip);
    const hip = hipsVisible ? { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 } : null;
    // poloha na pódiu podľa stredu ramien: boky na spodnom okraji záberu blikajú a bod by preskakoval
    // medzi bokmi a ramenami, čo vyzerá ako chôdza
    const body = shoulderMid;
    // pohyb delíme stabilnou šírkou ramien: pri otočení bokom sa sw zúži a malý posun by vyzeral ako veľký krok
    const refSw = Math.max(sw, ...this.frames.slice(-90).map((f) => f.refSw * 0.995));

    // ── Dlane (HandLandmarker beží len na každom druhom snímku) ──
    let fingerMotion = 0;
    if (hands) {
      const hdt = (t - this.prevHandsT) / 1000;
      if (hdt > 0 && hdt < 0.3) fingerMotion = fingerMotionBetween(this.prevHands, hands) / hdt;
      else fingerMotion = prev?.fingerMotion ?? 0;
      this.prevHands = hands;
      this.prevHandsT = t;
    } else {
      fingerMotion = prev?.fingerMotion ?? 0;
    }
    const handsFresh: Hands = t - this.prevHandsT < 300 ? this.prevHands : { left: null, right: null };

    // ── Mikrofón: ruku bližšie k ústam berieme ako ruku s mikrofónom ──
    let micAway = false;
    if (this.micMode) {
      for (const side of ["left", "right"] as const) {
        const i = side === "left" ? LM.leftWrist : LM.rightWrist;
        const d = vis(i) ? dist(px(i), nose) / sw : 3;
        this.micDist[side] += (d - this.micDist[side]) * 0.1;
      }
      const closer = this.micDist.left <= this.micDist.right ? "left" : "right";
      // prepneme len pri jasnom rozdiele, aby ruka s mikrofónom neskákala
      // a len vtedy, keď je nová ruka naozaj pri ústach (nie keď mikrofón len spustíš dole)
      if (this.micHand !== "auto") {
        this.micSide = this.micHand;
      } else if (
        !this.micSide ||
        (this.micDist[this.micSide] - this.micDist[closer] > CONFIG.micSwitchMargin &&
          this.micDist[closer] < CONFIG.micHoldDistance)
      ) {
        this.micSide = closer;
      }
      const mi = this.micSide === "left" ? LM.leftWrist : LM.rightWrist;
      micAway = dist(px(mi), nose) / sw > CONFIG.micMaxDistance;
    }
    const micSide = this.micMode ? this.micSide : null;
    const hd: Hands = micSide ? { ...handsFresh, [micSide]: null } : handsFresh;

    // ── Natočenie tela (potrebujeme ho skôr: bokom alebo chrbtom telo zakrýva ruky) ──
    let turned = false;
    let turnDeg: number | null = null;
    let noseBehind = false;
    if (world) {
      const wl = world[LM.leftShoulder];
      const wr = world[LM.rightShoulder];
      turned = Math.abs(wl.z - wr.z) / Math.max(Math.abs(wl.x - wr.x), 0.01) > CONFIG.turnedRatio;
      turnDeg = Math.round((Math.atan2(Math.abs(wl.z - wr.z), Math.abs(wl.x - wr.x)) * 180) / Math.PI);
      // nos za rovinou ramien = hlava je otočená od kamery
      noseBehind = world[LM.nose].z - (wl.z + wr.z) / 2 > CONFIG.backNoseDepth;
    }
    // chrbtom: model nevidí tvár (nos, oči), hoci ramená vidí
    const faceVis = Math.max(...[LM.nose, LM.leftEye, LM.rightEye].map((i) => lm[i].visibility ?? 1));
    const shouldersSeen = vis(LM.leftShoulder) && vis(LM.rightShoulder);
    const back = shouldersSeen && (faceVis < CONFIG.backFaceVisibility || noseBehind);
    const facing: Facing = back ? "back" : turned ? "side" : "front";
    if (back) turned = false;

    // ── Skryté ruky (vrecká, za chrbtom, v bok) ────────────
    // MediaPipe si polohu zápästia "domyslí" aj vtedy, keď ruku nevidno, preto
    // kontrolujeme geometriu: zápästie pri bedre + ohnutý lakeť + žiadna viditeľná dlaň.
    const elbowSpread = Math.abs(px(LM.leftElbow).x - px(LM.rightElbow).x) / sw;
    const armAt = (side: "left" | "right") => {
      const L = side === "left";
      const w = px(L ? LM.leftWrist : LM.rightWrist);
      const e = px(L ? LM.leftElbow : LM.rightElbow);
      const sh = L ? ls : rs;
      const h = L ? lh : rh;
      const nearHip =
        !!hip &&
        (dist(w, h) / sw < CONFIG.pocketHipDistance ||
          (Math.abs(w.x - hip.x) / sw < 0.5 && Math.abs(w.y - hip.y) / sw < 0.35));
      // body prstov z modelu pózy sú pri ruke vo vrecku zakryté (nízka viditeľnosť)
      const fingerVis = Math.max(
        ...(L ? [LM.leftPinky, LM.leftIndex, LM.leftThumb] : [LM.rightPinky, LM.rightIndex, LM.rightThumb]).map(
          (i) => lm[i]?.visibility ?? 1,
        ),
      );
      return {
        nearHip,
        bent: angleAt(sh, e, w) < CONFIG.pocketElbowAngle,
        fingersHidden: fingerVis < CONFIG.pocketFingerVisibility,
      };
    };
    const armL = armAt("left");
    const armR = armAt("right");
    const handsOnHips =
      !micSide &&
      armL.nearHip && armR.nearHip && armL.bent && armR.bent && elbowSpread >= CONFIG.handsOnHipsElbowSpread;
    // zápästia spojené vpredu a dobre viditeľné = zopnuté ruky (fig leaf), nie ruky za chrbtom
    const rawGap = dist(px(LM.leftWrist), px(LM.rightWrist)) / sw;
    const claspedInFront =
      rawGap < CONFIG.claspedSpread * 1.3 &&
      (lm[LM.leftWrist].visibility ?? 0) > CONFIG.frontVisibility &&
      (lm[LM.rightWrist].visibility ?? 0) > CONFIG.frontVisibility;
    const isHidden = (side: "left" | "right") => {
      const L = side === "left";
      if (side === micSide) return false;
      // bokom alebo chrbtom ruku zakryje vlastné telo: to nie je vrecko
      if (facing !== "front") {
        if (L) this.pocketFramesL = 0;
        else this.pocketFramesR = 0;
        return false;
      }
      if (!vis(L ? LM.leftWrist : LM.rightWrist)) return true;
      const a = L ? armL : armR;
      const pocketLike = a.nearHip && (a.bent || a.fingersHidden) && !hd[side] && !handsOnHips && !claspedInFront;
      // ruka musí pri bedre zostať chvíľu, inak je to len gesto, ktoré tadiaľ prešlo
      const frames = pocketLike ? (L ? ++this.pocketFramesL : ++this.pocketFramesR) : 0;
      if (!pocketLike) {
        if (L) this.pocketFramesL = 0;
        else this.pocketFramesR = 0;
      }
      return frames >= CONFIG.pocketMinFrames;
    };
    const hidden = { left: isHidden("left"), right: isHidden("right") };
    // za chrbtom: zápästie je vo svetových súradniciach za rovinou bokov (z rastie od kamery)
    const kindOf = (side: "left" | "right"): HiddenKind => {
      if (!hidden[side]) return null;
      const wi = side === "left" ? LM.leftWrist : LM.rightWrist;
      const wv = lm[wi].visibility ?? 1;
      if (world && wv >= 0.2) {
        const hipZ = (world[LM.leftHip].z + world[LM.rightHip].z) / 2;
        if (world[wi].z - hipZ > CONFIG.behindBackDepth) return "behind";
      }
      return vis(wi) || wv >= 0.2 ? "pocket" : "unseen";
    };
    const hiddenKind = { left: kindOf("left"), right: kindOf("right") };

    // ruka s mikrofónom sa do gest nepočíta
    // body už prichádzajú vyhladené (One Euro filter v LandmarkSmoother)
    const lw = hidden.left || micSide === "left" ? null : px(LM.leftWrist);
    const rw = hidden.right || micSide === "right" ? null : px(LM.rightWrist);
    const speed = (a: Point | null, b: Point | null | undefined) =>
      a && b && dt ? dist(a, b) / sw / dt : 0;
    const lwSpeed = speed(lw, prev?.lw);
    const rwSpeed = speed(rw, prev?.rw);

    this.frames.push({ t, lw, rw, lwSpeed, rwSpeed, body, noseRelY: (shoulderMid.y - nose.y) / sw, fingerMotion, sw, refSw });
    while (this.frames.length && t - this.frames[0].t > HISTORY_MS) this.frames.shift();

    // ── Power zóna ─────────────────────────────────────────
    const hipY = hip ? hip.y : shoulderMid.y + CONFIG.estimatedTorsoLength * sw;
    const zone: Zone = {
      top: shoulderMid.y + CONFIG.zoneTopOffset * sw,
      bottom: hipY + CONFIG.zoneBottomOffset * sw,
      left: shoulderMid.x - CONFIG.zoneHalfWidth * sw,
      right: shoulderMid.x + CONFIG.zoneHalfWidth * sw,
    };
    const inZone = (p: Point | null) =>
      !!p && p.y >= zone.top && p.y <= zone.bottom && p.x >= zone.left && p.x <= zone.right;
    const wrists = [lw, rw].filter((p): p is Point => !!p);
    const wristsInZone = [lw, rw].filter(inZone).length;
    const handsLow = wrists.length > 0 && wrists.every((p) => p.y > zone.bottom);
    const handsHigh = wrists.some((p) => p.y < nose.y - 0.2 * sw);

    // Prekrížené ruky: ľavé zápästie na pravej strane tela a naopak
    const dir = Math.sign(ls.x - rs.x) || 1;
    const crossed =
      !!lw &&
      !!rw &&
      (lw.x - shoulderMid.x) * dir < -0.1 * sw &&
      (rw.x - shoulderMid.x) * dir > 0.1 * sw &&
      lw.y > shoulderMid.y &&
      rw.y > shoulderMid.y &&
      lw.y < hipY + 0.2 * sw &&
      rw.y < hipY + 0.2 * sw;

    const spread = lw && rw ? Math.abs(lw.x - rw.x) / sw : null;
    const wristGap = lw && rw ? dist(lw, rw) / sw : null;
    const clasped = wristGap !== null && wristGap < CONFIG.claspedSpread && !crossed;
    const faceTouch = wrists.some((p) => dist(p, nose) / sw < CONFIG.faceTouchDistance);

    const elbowsVisible = vis(LM.leftElbow) && vis(LM.rightElbow);
    const activity3s = this.activity(t, 3000);
    const activity5s = this.activity(t, 5000);
    const tRex =
      !micSide &&
      elbowsVisible &&
      elbowSpread < CONFIG.tRexElbowSpread &&
      wristsInZone > 0 &&
      activity3s > CONFIG.frozenSpeed;

    const lAct = this.activity(t, 5000, (f) => f.lw);
    const rAct = this.activity(t, 5000, (f) => f.rw);
    const oneHand =
      !micSide &&
      ((lAct > CONFIG.oneHandActive && rAct < CONFIG.oneHandIdle) ||
        (rAct > CONFIG.oneHandActive && lAct < CONFIG.oneHandIdle));

    // Podržané gesto: ruky sa zastavili v zóne po výraznom pohybe
    const wristsStill = wrists.length > 0 && lwSpeed < CONFIG.stillWristSpeed && rwSpeed < CONFIG.stillWristSpeed;
    if (!wristsStill) {
      this.wristsStillSince = null;
      this.holdFired = false;
    } else {
      this.wristsStillSince ??= t;
      if (
        !this.holdFired &&
        t - this.wristsStillSince >= CONFIG.holdMs &&
        wristsInZone > 0 &&
        this.activity(this.wristsStillSince, 2000) > 0.8
      ) {
        this.holdFired = true;
        highlights.push("hold");
      }
    }
    if (spread !== null && spread > CONFIG.wideSpread && wristsInZone === 2) highlights.push("wide");

    const figLeaf = clasped && wrists.every((p) => p.y > hipY - 0.15 * sw);

    // ── Tvar dlaní ─────────────────────────────────────────
    const handsInZone = [hd.left, hd.right].filter((h): h is HandInfo => !!h && inZone(h.pts[0]));
    const fists = handsInZone.some((h) => h.shape === "fist");
    const pointing = handsInZone.some((h) => h.shape === "point");
    const wringing =
      wristGap !== null &&
      wristGap < CONFIG.wringingGap &&
      this.avgFingerMotion(t, 1000) > CONFIG.wringingMotion;

    // dlane k publiku: pozeráme podiel snímok s dlaňou ku kamere za posledné sekundy
    if (hands && handsInZone.length) {
      this.palmSamples.push({ t, facing: handsInZone.some((h) => h.palmFacing) });
    }
    while (this.palmSamples.length && t - this.palmSamples[0].t > CONFIG.palmsWindowMs) this.palmSamples.shift();
    const palmSpan = this.palmSamples.length ? t - this.palmSamples[0].t : 0;
    const palmsAway =
      this.palmSamples.length >= 20 &&
      palmSpan > CONFIG.palmsWindowMs * 0.7 &&
      this.palmSamples.filter((x) => x.facing).length / this.palmSamples.length < CONFIG.palmsAwayShare &&
      activity3s > 0.3;

    const palmsDown = handsInZone.some((h) => h.shape === "open" && h.palm === "down");

    // vulgárne a negatívne gestá: kdekoľvek v zábere, nielen v power zóne
    const anyHand = [hd.left, hd.right].filter((h): h is HandInfo => !!h);
    const vulgar = anyHand.some((h) => h.gesture === "middle_finger");
    const vBackhand = anyHand.some((h) => h.gesture === "victory" && h.palm === "back");
    const thumbDown = anyHand.some((h) => h.gesture === "thumb_down");
    const fingerGun = anyHand.some((h) => h.gesture === "finger_gun");

    if (handsInZone.some((h) => h.shape === "open" && (h.palmFacing || h.palm === "up")) && activity3s > 0.3) {
      highlights.push("palms");
    }
    if (handsInZone.some((h) => h.count !== null && h.count < 5)) {
      this.countSince ??= t;
      if (t - this.countSince > CONFIG.countHoldMs) highlights.push("count");
    } else {
      this.countSince = null;
    }

    // ── Počet gest za minútu ───────────────────────────────
    const recent = this.frames.slice(-3);
    const burst = Math.max(...recent.map((f) => Math.max(f.lwSpeed, f.rwSpeed)));
    if (!this.gestureMoving && burst > CONFIG.gestureOnsetSpeed) {
      this.gestureMoving = true;
      this.gestureCalmSince = null;
      this.gestureOnsets.push(t);
    } else if (this.gestureMoving) {
      if (burst < CONFIG.gestureCalmSpeed) {
        this.gestureCalmSince ??= t;
        if (t - this.gestureCalmSince > 150) this.gestureMoving = false;
      } else {
        this.gestureCalmSince = null;
      }
    }
    while (this.gestureOnsets.length && t - this.gestureOnsets[0] > 60000) this.gestureOnsets.shift();
    const elapsed = t - this.startT;
    const gesturesPerMin =
      elapsed < CONFIG.gestureRateMinMs
        ? null
        : (this.gestureOnsets.length * 60000) / Math.min(60000, elapsed);

    // ── Hlava ──────────────────────────────────────────────
    // natočenie: o koľko je nos posunutý od stredu medzi ušami
    const le = px(LM.leftEar);
    const re = px(LM.rightEar);
    const earDist = Math.max(Math.abs(le.x - re.x), sw * 0.2);
    // obraz z kamery nie je zrkadlený: pohyb nosa k menšiemu x = rečník pozerá doprava
    const rawYaw = ((le.x + re.x) / 2 - nose.x) / earDist;
    this.smoothYaw += (rawYaw - this.smoothYaw) * 0.3;
    const gazeYaw = this.smoothYaw;
    const gaze = sideOf(gazeYaw, CONFIG.gazeSideYaw);

    // sklon hlavy: nos oproti línii uší, porovnaný s kalibráciou na začiatku
    const pitchRaw = (nose.y - (le.y + re.y) / 2) / sw;
    if (this.pitchBaseline === null) {
      if (t - this.startT < CONFIG.calibrationMs) {
        if (gaze === "center") this.pitchSamples.push(pitchRaw);
      } else {
        this.pitchBaseline = this.pitchSamples.length >= 10 ? median(this.pitchSamples) : CONFIG.defaultPitch;
      }
    }
    const headPitch = pitchRaw - (this.pitchBaseline ?? CONFIG.defaultPitch);
    const headDown =
      headPitch > CONFIG.headDownDelta || (shoulderMid.y - nose.y) / sw < CONFIG.headDownRatio;

    // ── Postoj ─────────────────────────────────────────────
    const shoulderTilt = (Math.atan2(Math.abs(ls.y - rs.y), Math.abs(ls.x - rs.x)) * 180) / Math.PI;
    // nohy: pri natočení bokom sa strany nôh prekrývajú, vtedy ich nehodnotíme
    const legPoint = (i: number) => (vis(i) ? px(i) : null);
    const legs = legsPose(
      {
        leftKnee: legPoint(LM.leftKnee),
        rightKnee: legPoint(LM.rightKnee),
        leftAnkle: legPoint(LM.leftAnkle),
        rightAnkle: legPoint(LM.rightAnkle),
      },
      sw,
      turned || back ? 0 : ls.x - rs.x,
    );

    // ── Pódium ─────────────────────────────────────────────
    const stageX = 1 - body.x / width; // zrkadlovo, z pohľadu rečníka
    const stage = sideOf(stageX - 0.5, CONFIG.stageCenterHalfWidth);
    const bodySpeed = this.bodySpeed(t, 500);
    const walking = bodySpeed > CONFIG.walkingSpeed;
    const nearEdge = stageX < CONFIG.edgeMargin || stageX > 1 - CONFIG.edgeMargin;

    if (!this.stepAnchor) {
      this.stepAnchor = body;
      this.lastStepAt = t;
    } else if (dist(body, this.stepAnchor) / refSw > CONFIG.stepDistance) {
      this.stepAnchor = body;
      this.lastStepAt = t;
      this.pendingStep = true;
    }
    // krok + zastavenie = "zakorenenie" (pochvala)
    if (bodySpeed < CONFIG.plantedSpeed) {
      this.plantedSince ??= t;
      if (this.pendingStep && t - this.plantedSince >= CONFIG.plantedMs) {
        this.pendingStep = false;
        highlights.push("planted");
      }
    } else {
      this.plantedSince = null;
    }

    if (!this.long.length || t - this.long[this.long.length - 1].t >= LONG_SAMPLE_MS) {
      this.long.push({ t, gaze, bodyX: body.x, sw: refSw });
      while (this.long.length && t - this.long[0].t > LONG_HISTORY_MS) this.long.shift();
    }

    const { share: gazeShare, spanMs: gazeSpanMs } = this.gazeShare(t);
    const gazeDarting = this.gazeChanges(t, CONFIG.gazeDartingWindowMs) >= CONFIG.gazeDartingChanges;
    const gazeStuck =
      gazeSpanMs >= CONFIG.gazeWindowMs * 0.9 &&
      Math.max(gazeShare.left, gazeShare.center, gazeShare.right) > CONFIG.gazeStuckShare;
    if (this.sweptAudience(t) && !gazeDarting && facing === "front") highlights.push("sweep");
    // bez tváre a dlaní ku kamere nemáme čo chváliť (okrem zámerného presunu)
    if (facing === "back") highlights.splice(0, highlights.length, ...highlights.filter((h) => h === "planted"));

    return {
      sw,
      shoulderRatio: sw / width,
      leftWrist: lw,
      rightWrist: rw,
      visibleWrists: wrists.length,
      hidden,
      hiddenKind,
      micSide,
      micAway,
      leftHand: hd.left,
      rightHand: hd.right,
      handsOnHips,
      figLeaf,
      fists,
      pointing,
      palmsAway,
      palmsDown,
      wringing,
      vulgar,
      vBackhand,
      thumbDown,
      fingerGun,
      gesturesPerMin,
      zone,
      wristsInZone,
      handsLow,
      handsHigh,
      spread,
      crossed,
      clasped,
      faceTouch,
      tRex,
      oneHand,
      activity3s,
      activity5s,
      fidget: this.smallRepeatedMotion(t, CONFIG.fidgetWindowMs, CONFIG.fidgetPath, CONFIG.fidgetRange),
      repetitive: this.smallRepeatedMotion(
        t,
        CONFIG.repetitiveWindowMs,
        CONFIG.repetitivePath,
        CONFIG.repetitiveRange,
      ),
      noHold: this.noHold(t, activity5s),
      nose,
      gazeYaw,
      gaze,
      gazeShare,
      gazeSpanMs,
      gazeStuck,
      gazeDarting,
      headPitch,
      calibrated: this.pitchBaseline !== null,
      headDown,
      nodding: this.nodding(t),
      shoulderTilt,
      turned,
      facing,
      turnDeg,
      ...legs,
      hipsVisible,
      stageX,
      stage,
      walking,
      pacing: this.pacing(t),
      nearEdge,
      sway: this.sway(t),
      msSinceStep: t - this.lastStepAt,
      highlights,
    };
  }

  private avgFingerMotion(t: number, ms: number): number {
    const fr = this.window(t, ms);
    return fr.length ? fr.reduce((a, f) => a + f.fingerMotion, 0) / fr.length : 0;
  }

  private window(t: number, ms: number) {
    return this.frames.filter((f) => t - f.t <= ms && f.t <= t);
  }

  /** Priemerná rýchlosť zápästí v sw/s za posledné okno. */
  private activity(t: number, windowMs: number, pick?: (f: Frame) => Point | null): number {
    const fr = this.window(t, windowMs);
    if (fr.length < 2) return 0;
    const picks = pick ? [pick] : [(f: Frame) => f.lw, (f: Frame) => f.rw];
    let path = 0;
    // delíme len počtom rúk, ktoré bolo vidno (s mikrofónom gestikuluje jedna)
    const seen = new Set<number>();
    for (let i = 1; i < fr.length; i++) {
      picks.forEach((p, k) => {
        const a = p(fr[i - 1]);
        const b = p(fr[i]);
        if (a && b) {
          path += dist(a, b) / fr[i].sw;
          seen.add(k);
        }
      });
    }
    const secs = (fr[fr.length - 1].t - fr[0].t) / 1000;
    return secs > 0 && seen.size ? path / seen.size / secs : 0;
  }

  /** Veľa prejdenej dráhy na malom priestore (mykanie alebo stále to isté gesto). */
  private smallRepeatedMotion(t: number, windowMs: number, minPath: number, maxRange: number): boolean {
    const fr = this.window(t, windowMs);
    if (fr.length < 8 || fr[fr.length - 1].t - fr[0].t < windowMs * 0.8) return false;
    const sw = fr[fr.length - 1].sw;
    const check = (pick: (f: Frame) => Point | null) => {
      const pts = fr.map(pick).filter((p): p is Point => !!p);
      if (pts.length < 8) return false;
      let path = 0;
      for (let i = 1; i < pts.length; i++) path += dist(pts[i - 1], pts[i]);
      const xs = pts.map((p) => p.x);
      const ys = pts.map((p) => p.y);
      const range = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      return path / sw > minPath && range / sw < maxRange;
    };
    return check((f) => f.lw) || check((f) => f.rw);
  }

  /** Ruky sa stále hýbu a ani raz sa nezastavia. */
  private noHold(t: number, activity: number): boolean {
    if (activity < CONFIG.noHoldMinActivity) return false;
    const fr = this.window(t, CONFIG.noHoldWindowMs);
    if (fr.length < 30 || fr[fr.length - 1].t - fr[0].t < CONFIG.noHoldWindowMs * 0.8) return false;
    const still = fr.filter(
      (f) => f.lwSpeed < CONFIG.stillWristSpeed && f.rwSpeed < CONFIG.stillWristSpeed,
    ).length;
    return still / fr.length < CONFIG.noHoldMinStillShare;
  }

  private bodySpeed(t: number, windowMs: number): number {
    const fr = this.window(t, windowMs);
    if (fr.length < 2) return 0;
    const a = fr[0];
    const b = fr[fr.length - 1];
    const secs = (b.t - a.t) / 1000;
    return secs > 0 ? Math.abs(b.body.x - a.body.x) / b.refSw / secs : 0;
  }

  /** Hojdanie zo strany na stranu: časté zmeny smeru tela na malom priestore. */
  private sway(t: number): boolean {
    const fr = this.window(t, CONFIG.swayWindowMs);
    if (fr.length < 20) return false;
    const sw = fr[fr.length - 1].refSw;
    const xs = fr.map((f) => f.body.x);
    const range = (Math.max(...xs) - Math.min(...xs)) / sw;
    if (range < CONFIG.swayRange || range > CONFIG.stepDistance * 1.5) return false;
    return countReversals(xs, 0.015 * sw) >= CONFIG.swayReversals;
  }

  /** Prechádzanie sem a tam: veľa chôdze takmer bez zastavenia. */
  private pacing(t: number): boolean {
    const s = this.long.filter((x) => t - x.t <= CONFIG.pacingWindowMs);
    if (s.length < 2 || s[s.length - 1].t - s[0].t < CONFIG.pacingWindowMs * 0.8) return false;
    let path = 0;
    let still = 0;
    for (let i = 1; i < s.length; i++) {
      const d = Math.abs(s[i].bodyX - s[i - 1].bodyX) / s[i].sw;
      const v = d / ((s[i].t - s[i - 1].t) / 1000);
      // drobné chvenie odhadu polohy sa do prejdenej dráhy nepočíta
      if (d > CONFIG.pacingJitter) path += d;
      if (v < CONFIG.plantedSpeed) still++;
    }
    // „sem a tam“ = naozaj prejdený kus pódia, nie prešľapovanie na mieste
    const xs = s.map((x) => x.bodyX);
    const range = (Math.max(...xs) - Math.min(...xs)) / s[s.length - 1].sw;
    return (
      path > CONFIG.pacingPath &&
      range > CONFIG.pacingMinRange &&
      still / (s.length - 1) < CONFIG.pacingMaxStillShare
    );
  }

  /** Hlava rýchlo hore-dole (neustále prikyvovanie). */
  private nodding(t: number): boolean {
    const fr = this.window(t, CONFIG.noddingWindowMs);
    if (fr.length < 20) return false;
    return countReversals(fr.map((f) => f.noseRelY), CONFIG.noddingMinStep) >= CONFIG.noddingReversals;
  }

  private gazeShare(t: number) {
    const s = this.long.filter((x) => t - x.t <= CONFIG.gazeWindowMs);
    const share = { left: 0, center: 0, right: 0 };
    for (const x of s) share[x.gaze]++;
    const n = Math.max(s.length, 1);
    return {
      share: { left: share.left / n, center: share.center / n, right: share.right / n },
      spanMs: s.length ? s[s.length - 1].t - s[0].t : 0,
    };
  }

  private gazeChanges(t: number, windowMs: number): number {
    const s = this.long.filter((x) => t - x.t <= windowMs);
    let changes = 0;
    for (let i = 1; i < s.length; i++) if (s[i].gaze !== s[i - 1].gaze) changes++;
    return changes;
  }

  /** Pohľad prešiel ľavú aj pravú stranu publika a práve sa vrátil do novej strany. */
  private sweptAudience(t: number): boolean {
    const s = this.long.filter((x) => t - x.t <= CONFIG.sweepWindowMs);
    if (s.length < 2) return false;
    const last = s[s.length - 1];
    const before = s[s.length - 2];
    if (last.t !== t || last.gaze === before.gaze || last.gaze === "center") return false;
    const other = last.gaze === "left" ? "right" : "left";
    return s.some((x) => x.gaze === other);
  }
}

/** uhol v bode b (stupne) */
function angleAt(a: Point, b: Point, c: Point): number {
  const v1 = { x: a.x - b.x, y: a.y - b.y };
  const v2 = { x: c.x - b.x, y: c.y - b.y };
  const cos = (v1.x * v2.x + v1.y * v2.y) / (Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** Ako veľmi sa pohli končeky prstov voči zápästiu (v jednotkách veľkosti ruky). */
function fingerMotionBetween(a: Hands, b: Hands): number {
  let best = 0;
  for (const side of ["left", "right"] as const) {
    const p = a[side];
    const c = b[side];
    if (!p || !c) continue;
    let sum = 0;
    for (const i of [4, 8, 12, 16, 20]) {
      const dx = c.pts[i].x - c.pts[0].x - (p.pts[i].x - p.pts[0].x);
      const dy = c.pts[i].y - c.pts[0].y - (p.pts[i].y - p.pts[0].y);
      sum += Math.hypot(dx, dy) / c.size;
    }
    best = Math.max(best, sum / 5);
  }
  return best;
}

function countReversals(values: number[], minStep: number): number {
  let reversals = 0;
  let lastDir = 0;
  for (let i = 3; i < values.length; i += 3) {
    const d = values[i] - values[i - 3];
    if (Math.abs(d) < minStep) continue;
    const dir = Math.sign(d);
    if (lastDir && dir !== lastDir) reversals++;
    lastDir = dir;
  }
  return reversals;
}
