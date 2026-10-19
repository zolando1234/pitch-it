import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Point } from "./metrics";

export type BodySide = "left" | "right";
/** open = otvorená dlaň, fist = päsť, point = ukazovák, count = počítanie (2–3 prsty / ukazovák hore) */
export type HandShape = "open" | "fist" | "point" | "count" | "relaxed";
/**
 * Podrobnejšie gesto (len pri 3D rozbore): palec hore/dole, štipka, OK. Palec hore ani štipka nie sú päsť,
 * preto majú tvar "relaxed" a pravidlá o zatvorených päsťach ich nehlásia.
 */
export type HandGesture =
  | "thumb_up"
  | "thumb_down"
  | "thumb_out"
  | "pinch"
  | "ok"
  | "victory"
  | "horns"
  /** vystretý len prostredník: vulgárne gesto */
  | "middle_finger"
  /** palec hore a ukazovák do strany („pištoľ“): pôsobí ledabolo až agresívne */
  | "finger_gun"
  | "uncertain"
  | null;
/**
 * Kam smeruje vnútorná strana dlane: front = ku kamere (k publiku), back = chrbát ruky ku kamere,
 * edge = hrana ruky ku kamere („sekanie“), up = dlaň hore (ponuka), down = dlaň dole (tlmenie, autorita).
 * null = nedá sa určiť.
 */
export type PalmDir = "front" | "back" | "edge" | "up" | "down" | null;
export type FingerFlags = { thumb: boolean; index: boolean; middle: boolean; ring: boolean; pinky: boolean };
/** bod vo svetových súradniciach ruky (metre); z modelu rúk (`worldLandmarks`) */
export type World3 = { x: number; y: number; z: number };

export type HandInfo = {
  side: BodySide;
  pts: Point[];
  size: number;
  extendedFingers: number;
  shape: HandShape;
  /** dlaň otočená ku kamere (k publiku) */
  palmFacing: boolean;
  /** podrobný smer dlane */
  palm: PalmDir;
  /** ktoré prsty sú vystreté */
  fingers: FingerFlags;
  /** počítanie na prstoch (1–5), keď prsty idú po sebe a ruka je zdvihnutá; inak null */
  count: number | null;
  /** podrobné gesto z 3D rozboru (null = žiadne zvláštne alebo 2D rozbor) */
  gesture: HandGesture;
  /** rozbor je z 3D uhlov kĺbov (presnejší) alebo z 2D vzdialeností (záloha) */
  source: "3d" | "2d";
};

export type Hands = Record<BodySide, HandInfo | null>;

// indexy landmarkov ruky
const WRIST = 0;
const THUMB_IP = 3;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const MIDDLE_MCP = 9;
const PINKY_MCP = 17;
const FINGERS = [
  { mcp: 5, pip: 6, tip: 8 },
  { mcp: 9, pip: 10, tip: 12 },
  { mcp: 13, pip: 14, tip: 16 },
  { mcp: 17, pip: 18, tip: 20 },
];

export const HAND_CONNECTIONS: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [0, 17], [17, 18], [18, 19], [19, 20],
];

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

// ── 3D rozbor (uhly kĺbov zo svetových súradníc; prevzaté z testu DeepSeek a doladené) ──────────────

const finite = (p: World3 | undefined): p is World3 => !!p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
const sub3 = (a: World3, b: World3): World3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len3 = (a: World3) => Math.hypot(a.x, a.y, a.z);
const dist3 = (a: World3, b: World3) => len3(sub3(a, b));

/** uhol v bode b (stupne) */
export function angleAt(a: World3, b: World3, c: World3): number {
  const u = sub3(a, b);
  const v = sub3(c, b);
  const den = len3(u) * len3(v);
  if (den < 1e-9) return 0;
  const cos = (u.x * v.x + u.y * v.y + u.z * v.z) / den;
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

type FingerState = "ext" | "curl" | "mid";

type Fingers3D = {
  thumb: boolean;
  /** ukazovák, prostredník, prstenník, malíček */
  fingers: FingerState[];
  pinch: boolean;
};

/** Vystretie prstov z uhlov kĺbov; null, ak sú body neplatné. `mid` = prst napoly ohnutý (neistý). */
export function fingers3D(w: World3[]): Fingers3D | null {
  if (w.length !== 21 || !w.every(finite)) return null;
  const scale = dist3(w[5], w[17]);
  if (scale < 1e-6) return null;
  const thumb = angleAt(w[1], w[2], w[3]) > 130 && angleAt(w[2], w[3], w[4]) > 145 && dist3(w[4], w[5]) > scale * 0.5;
  const fingers = [5, 9, 13, 17].map((base): FingerState => {
    const bend = angleAt(w[base], w[base + 1], w[base + 2]);
    const tip = angleAt(w[base + 1], w[base + 2], w[base + 3]);
    if (bend > 135 && tip > 120 && dist3(w[0], w[base + 3]) > dist3(w[0], w[base + 1]) * 1.08) return "ext";
    if ((bend > 110 && bend <= 135 && tip > 120) || (bend > 135 && tip > 100 && tip <= 120)) return "mid";
    return "curl";
  });
  return { thumb, fingers, pinch: dist3(w[4], w[8]) / scale < 0.28 };
}

/**
 * Smer dlane z normály dlane (body 0, 5, 17). Vráti −1…1 (záporné = dlaň ku kamere, pri pravej ruke rečníka;
 * pri ľavej sa znamienko obráti) alebo null pri zdegenerovanej geometrii.
 */
export function palmNormalZ(w: World3[], side: BodySide): number | null {
  return palmNormal(w, side)?.z ?? null;
}

/**
 * Jednotková normála vychádzajúca z vnútornej strany dlane (y dole, z záporné = ku kamere),
 * alebo null pri zdegenerovanej geometrii.
 */
export function palmNormal(w: World3[], side: BodySide): World3 | null {
  if (w.length !== 21 || !finite(w[0]) || !finite(w[5]) || !finite(w[17])) return null;
  const a = sub3(w[5], w[0]);
  const b = sub3(w[17], w[0]);
  const n = { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
  const length = len3(n);
  if (length < 1e-9 || length / (len3(a) * len3(b)) < 0.12) return null;
  const k = (side === "right" ? 1 : -1) / length;
  return { x: n.x * k, y: n.y * k, z: n.z * k };
}

/** dlaň hore/dole, keď normála smeruje zvislo viac ako ~50° */
const PALM_VERTICAL_NY = 0.65;

export function palmDirection(n: World3 | null): PalmDir {
  if (!n) return null;
  if (n.y < -PALM_VERTICAL_NY) return "up";
  if (n.y > PALM_VERTICAL_NY) return "down";
  if (n.z < PALM_FACING_NZ) return "front";
  if (n.z > -PALM_FACING_NZ) return "back";
  return "edge";
}

/**
 * Počítanie na prstoch: prsty musia ísť po sebe (od ukazováka alebo od palca, ako sa počíta
 * v Európe) a ruka musí byť zdvihnutá prstami hore. Samotný palec je „palec hore“, nie jednotka.
 */
export function countOnFingers(f: FingerFlags, upright: boolean): number | null {
  if (!upright) return null;
  const four = [f.index, f.middle, f.ring, f.pinky];
  const run = four.findIndex((x) => !x);
  const n = run === -1 ? 4 : run;
  // za prvým ohnutým prstom už nesmie byť žiadny vystretý (V s malíčkom a pod. nie je počítanie)
  if (four.slice(n).some(Boolean)) return null;
  if (n === 0) return null;
  return n + (f.thumb ? 1 : 0);
}

/** dlaň je ku kamere, keď je normála vo vnútri ~70° od osi kamery (hrana ruky sa nepočíta) */
const PALM_FACING_NZ = -0.35;

function analyze(pts: Point[], side: BodySide, world?: World3[]): HandInfo {
  const w = pts[WRIST];
  const size = Math.max(dist(w, pts[MIDDLE_MCP]), 1);
  const f3 = world ? fingers3D(world) : null;

  let extended: boolean[];
  let curled: boolean[];
  let thumbOut: boolean;
  let uncertain = false;
  if (f3) {
    extended = f3.fingers.map((s) => s === "ext");
    curled = f3.fingers.map((s) => s === "curl");
    uncertain = f3.fingers.some((s) => s === "mid");
    thumbOut = f3.thumb;
  } else {
    extended = FINGERS.map((f) => dist(w, pts[f.tip]) > dist(w, pts[f.pip]) * 1.1);
    curled = FINGERS.map((f) => dist(w, pts[f.tip]) < dist(w, pts[f.mcp]) * 1.15);
    thumbOut = dist(pts[THUMB_TIP], pts[PINKY_MCP]) > dist(pts[THUMB_IP], pts[PINKY_MCP]) * 1.05;
  }
  const n = extended.filter(Boolean).length;

  const fingers: FingerFlags = {
    thumb: thumbOut,
    index: extended[0],
    middle: extended[1],
    ring: extended[2],
    pinky: extended[3],
  };
  // ruka zdvihnutá prstami hore (od zápästia k prostredníku najviac ~50° od zvislice)
  const upright = w.y - pts[MIDDLE_MCP].y > size * 0.6 && pts[8].y < pts[INDEX_MCP].y;
  const indexDx = pts[8].x - pts[INDEX_MCP].x;
  const indexDy = pts[8].y - pts[INDEX_MCP].y;
  const indexUp = -indexDy > Math.abs(indexDx) * 1.2;
  const indexSideways = Math.abs(indexDx) > Math.abs(indexDy);

  let shape: HandShape = "relaxed";
  let gesture: HandGesture = null;
  let count: number | null = null;
  if (extended[1] && curled[0] && curled[2] && !extended[3]) {
    // prostredník: kontrolujeme skôr ako štipku, palec pritom často leží na ukazováku
    gesture = "middle_finger";
  } else if (f3 && f3.pinch) {
    // štipka alebo „OK“: nie je to päsť ani otvorená dlaň
    gesture = extended[1] && extended[2] && extended[3] ? "ok" : "pinch";
  } else if (f3 && uncertain) {
    gesture = "uncertain";
  } else if (curled.every(Boolean)) {
    if (f3 && thumbOut) {
      // palec hore/dole/do strany s ohnutými prstami nie je päsť
      const dx = pts[THUMB_TIP].x - pts[2].x;
      const dy = pts[THUMB_TIP].y - pts[2].y;
      gesture = Math.abs(dy) > Math.abs(dx) * 1.2 ? (dy < 0 ? "thumb_up" : "thumb_down") : "thumb_out";
    } else {
      shape = "fist";
    }
  } else if (n >= 4) {
    shape = "open";
    count = countOnFingers(fingers, upright);
  } else if (n === 1 && extended[0] && curled[2] && curled[3]) {
    if (thumbOut && indexSideways) {
      // palec hore a ukazovák do strany = „pištoľ“
      gesture = "finger_gun";
      shape = "point";
    } else if (indexUp) {
      // ukazovák hore = „po prvé“ (s palcom = „po druhé“, európske počítanie)
      shape = "count";
      count = countOnFingers(fingers, true);
    } else {
      // ukazovák do strany/dopredu = ukazovanie prstom
      shape = "point";
    }
  } else if ((n === 2 || n === 3) && extended[0] && extended[1]) {
    shape = "count";
    count = countOnFingers(fingers, upright);
    if (f3 && n === 2 && !thumbOut) gesture = "victory";
  } else if (f3 && n === 2 && extended[0] && extended[3] && !extended[1] && !extended[2]) {
    gesture = "horns";
  }

  // Smer dlane: z 3D normály dlane, keď je k dispozícii; inak z 2D vektorového súčinu. Obraz z kamery nie je
  // zrkadlený: pravá ruka rečníka dlaňou ku kamere má súčin záporný, ľavá kladný.
  const normal = world ? palmNormal(world, side) : null;
  let palmFacing: boolean;
  let palm: PalmDir;
  if (normal) {
    palmFacing = normal.z < PALM_FACING_NZ;
    palm = palmDirection(normal);
  } else {
    const a = { x: pts[INDEX_MCP].x - w.x, y: pts[INDEX_MCP].y - w.y };
    const b = { x: pts[PINKY_MCP].x - w.x, y: pts[PINKY_MCP].y - w.y };
    const cross = ((a.x * b.y - a.y * b.x) / (size * size)) * (side === "right" ? -1 : 1);
    palmFacing = cross > 0.15;
    palm = cross > 0.15 ? "front" : cross < -0.15 ? "back" : "edge";
  }

  return {
    side,
    pts,
    size,
    extendedFingers: n + (thumbOut ? 1 : 0),
    shape,
    palmFacing,
    palm,
    fingers,
    count,
    gesture,
    source: f3 ? "3d" : "2d",
  };
}

/** Rozbor jednej ruky (bez párovania so zápästiami); exportované na testy. */
export function analyzeHand(pts: Point[], side: BodySide, world?: World3[]): HandInfo {
  return analyze(pts, side, world);
}

/**
 * Spáruje detegované ruky so zápästiami z pózy (podľa vzdialenosti), aby sme
 * vedeli, ktorá ruka je ľavá a ktorá pravá z pohľadu rečníka.
 */
export function analyzeHands(
  hands: NormalizedLandmark[][],
  width: number,
  height: number,
  poseLeft: Point,
  poseRight: Point,
  sw: number,
  /** svetové súradnice rúk (rovnaké poradie ako `hands`); bez nich sa použije 2D rozbor */
  worlds?: World3[][] | null,
): Hands {
  const result: Hands = { left: null, right: null };
  const cands = hands.map((h) => h.map((p) => ({ x: p.x * width, y: p.y * height })));
  const pairs: { i: number; side: BodySide; d: number }[] = [];
  cands.forEach((pts, i) => {
    pairs.push({ i, side: "left", d: dist(pts[WRIST], poseLeft) });
    pairs.push({ i, side: "right", d: dist(pts[WRIST], poseRight) });
  });
  pairs.sort((x, y) => x.d - y.d);
  const used = new Set<number>();
  for (const p of pairs) {
    if (used.has(p.i) || result[p.side] || p.d > sw * 0.9) continue;
    used.add(p.i);
    result[p.side] = analyze(cands[p.i], p.side, worlds?.[p.i]);
  }
  return result;
}
