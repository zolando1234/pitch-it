import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import type { Status } from "./feedback";
import { HAND_CONNECTIONS, type HandGesture, type HandInfo, type HandShape, type PalmDir } from "./hands";
import { LM, type Metrics, type Point } from "./metrics";
import type { Rect } from "./roi";

export const STATUS_COLOR: Record<Status, string> = {
  good: "#aaff00",
  warn: "#ffc94d",
  bad: "#ff5c5c",
  idle: "#7a7a86",
};

/** Farby stavu pre text na stránke: tokeny témy, čitateľné na tmavom aj svetlom pozadí. */
export const STATUS_TEXT: Record<Status, string> = {
  good: "var(--color-accent)",
  warn: "var(--color-marker)",
  bad: "var(--color-danger)",
  idle: "var(--color-mute)",
};

const STATUS_RGB: Record<Status, [number, number, number]> = {
  good: [34, 197, 94],
  warn: [245, 158, 11],
  bad: [230, 43, 30],
  idle: [163, 163, 163],
};

const UPPER_BODY: [number, number][] = [
  [LM.leftShoulder, LM.rightShoulder],
  [LM.leftShoulder, LM.leftElbow],
  [LM.leftElbow, LM.leftWrist],
  [LM.rightShoulder, LM.rightElbow],
  [LM.rightElbow, LM.rightWrist],
  [LM.leftShoulder, LM.leftHip],
  [LM.rightShoulder, LM.rightHip],
  [LM.leftHip, LM.rightHip],
];

const LEGS: [number, number][] = [
  [LM.leftHip, LM.leftKnee],
  [LM.leftKnee, LM.leftAnkle],
  [LM.rightHip, LM.rightKnee],
  [LM.rightKnee, LM.rightAnkle],
];

const TRAIL_MS = 700;

type Lang = "sk" | "en";

const GESTURE_LABEL: Record<Lang, Partial<Record<Exclude<HandGesture, null>, string>>> = {
  sk: {
    thumb_up: "palec hore",
    thumb_down: "palec dole",
    thumb_out: "palec",
    pinch: "štipka",
    ok: "OK",
    victory: "V",
    horns: "rohy",
    middle_finger: "vulgárne gesto",
    finger_gun: "pištoľ",
  },
  en: {
    thumb_up: "thumbs up",
    thumb_down: "thumbs down",
    thumb_out: "thumb",
    pinch: "pinch",
    ok: "OK",
    victory: "V",
    horns: "horns",
    middle_finger: "vulgar gesture",
    finger_gun: "finger gun",
  },
};
const SHAPE_LABEL: Record<Lang, Partial<Record<HandShape, string>>> = {
  sk: { open: "otvorená", fist: "päsť", point: "ukazovák" },
  en: { open: "open", fist: "fist", point: "pointing" },
};
const PALM_LABEL: Record<Lang, Record<Exclude<PalmDir, null>, string>> = {
  sk: { front: "dlaň", back: "chrbát", edge: "hrana", up: "dlaň hore", down: "dlaň dole" },
  en: { front: "palm", back: "back", edge: "edge", up: "palm up", down: "palm down" },
};
const BODY_LABEL: Record<Lang, { back: string; side: string; pocket: string; behind: string }> = {
  sk: { back: "chrbtom", side: "bokom", pocket: "vo vrecku?", behind: "za chrbtom?" },
  en: { back: "back turned", side: "sideways", pocket: "in pocket?", behind: "behind back?" },
};

/** text pre ruku: počet prstov alebo gesto, a smer dlane */
export function handLabel(h: HandInfo, lang: Lang = "sk"): string {
  const what =
    h.gesture === "middle_finger" || h.gesture === "finger_gun" || h.gesture === "thumb_down"
      ? GESTURE_LABEL[lang][h.gesture]
      : // číslo len pri zjavnom počítaní (1–3 prsty hore); otvorená ruka je „otvorená“, nie „5“
        h.count !== null && h.shape === "count"
        ? String(h.count)
        : (h.gesture && GESTURE_LABEL[lang][h.gesture]) || SHAPE_LABEL[lang][h.shape] || `${h.extendedFingers}`;
  return h.palm ? `${what} · ${PALM_LABEL[lang][h.palm]}` : what!;
}

/** Kreslí "pódium": stlmené video, farebnú siluetu, power zónu a stopy rúk. */
export class StageRenderer {
  private maskCanvas: HTMLCanvasElement;
  private maskCtx: CanvasRenderingContext2D;
  private maskImage: ImageData | null = null;
  private trails: { l: (Point & { t: number })[]; r: (Point & { t: number })[] } = { l: [], r: [] };
  private color: [number, number, number] = STATUS_RGB.idle;
  /** plátno je na obrazovke zrkadlené (kamera): text treba kresliť obrátene, aby sa dal čítať */
  mirrored = false;
  lang: Lang = "sk";
  /** jemná silueta (záber cez celú obrazovku, rečník sa má dobre vidieť) */
  subtle: () => boolean = () => false;

  // malé plátno na lacnú žiaru: zmenšená silueta roztiahnutá späť = rozmazaný okraj
  private glowCanvas: HTMLCanvasElement;
  private glowCtx: CanvasRenderingContext2D;

  constructor() {
    this.maskCanvas = document.createElement("canvas");
    this.maskCtx = this.maskCanvas.getContext("2d")!;
    this.glowCanvas = document.createElement("canvas");
    this.glowCanvas.width = 80;
    this.glowCanvas.height = 45;
    this.glowCtx = this.glowCanvas.getContext("2d")!;
  }

  /** časť záberu, ktorú maska pokrýva (model dostal len výrez okolo rečníka) */
  private maskRect: Rect | null = null;

  setMask(mask: Float32Array, w: number, h: number, status: Status, rect: Rect | null = null) {
    this.maskRect = rect;
    if (this.maskCanvas.width !== w || this.maskCanvas.height !== h || !this.maskImage) {
      this.maskCanvas.width = w;
      this.maskCanvas.height = h;
      this.maskImage = this.maskCtx.createImageData(w, h);
    }
    // plynulý prechod farby siluety
    const target = STATUS_RGB[status];
    this.color = this.color.map((c, i) => c + (target[i] - c) * 0.15) as [number, number, number];
    const [r, g, b] = this.color;
    const data = this.maskImage.data;
    for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
      data[j] = r;
      data[j + 1] = g;
      data[j + 2] = b;
      data[j + 3] = mask[i] > 0.15 ? Math.min(255, mask[i] * 255) : 0;
    }
    this.maskCtx.putImageData(this.maskImage, 0, 0);
    this.glowCtx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
    this.glowCtx.drawImage(this.maskCanvas, 0, 0, this.glowCanvas.width, this.glowCanvas.height);
  }

  clearMask() {
    this.maskCtx.clearRect(0, 0, this.maskCanvas.width, this.maskCanvas.height);
    this.glowCtx.clearRect(0, 0, this.glowCanvas.width, this.glowCanvas.height);
  }

  draw(
    ctx: CanvasRenderingContext2D,
    lm: NormalizedLandmark[] | null,
    m: Metrics | null,
    status: Status,
    t: number,
  ) {
    const { width: W, height: H } = ctx.canvas;
    const color = STATUS_COLOR[status];

    // video je pod touto vrstvou ako samostatný <video> element, tu kreslíme len prekryv
    ctx.clearRect(0, 0, W, H);

    if (!lm || !m) return;

    // silueta + žiara
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    const r = this.maskRect ?? { x: 0, y: 0, w: W, h: H };
    const k = this.subtle() ? 0.3 : 1;
    ctx.globalAlpha = 0.55 * k;
    ctx.drawImage(this.glowCanvas, r.x - r.w * 0.03, r.y - r.h * 0.03, r.w * 1.06, r.h * 1.06);
    ctx.globalAlpha = 0.5 * k;
    ctx.drawImage(this.maskCanvas, r.x, r.y, r.w, r.h);
    ctx.restore();

    this.drawZone(ctx, m);
    this.drawSkeleton(ctx, lm, W, H);
    this.drawHead(ctx, m, color);
    for (const h of [m.leftHand, m.rightHand]) if (h) this.drawHand(ctx, h, color, h.side === "left" ? m.leftWrist : m.rightWrist, m.sw);
    this.drawTrails(ctx, m, color, t);
    this.drawLabels(ctx, lm, m, W, H);
  }

  /** Popisky: čo robí každá ruka (počet prstov, gesto, dlaň), skryté ruky a natočenie tela. */
  private drawLabels(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], m: Metrics, W: number, H: number) {
    const size = Math.round(Math.min(26, Math.max(13, m.sw * 0.11)));
    const L = BODY_LABEL[this.lang];
    for (const h of [m.leftHand, m.rightHand]) {
      if (!h) continue;
      const top = Math.min(...h.pts.map((p) => p.y));
      const cx = h.pts.reduce((a, p) => a + p.x, 0) / h.pts.length;
      const bad = h.gesture === "middle_finger";
      const warn = h.gesture === "finger_gun" || h.gesture === "thumb_down" || h.shape === "fist" || h.shape === "point";
      this.label(ctx, handLabel(h, this.lang), cx, top - size * 0.6, size, bad ? "bad" : warn ? "warn" : "good");
    }
    for (const side of ["left", "right"] as const) {
      const kind = m.hiddenKind[side];
      if (kind !== "pocket" && kind !== "behind") continue;
      const p = lm[side === "left" ? LM.leftWrist : LM.rightWrist];
      this.label(ctx, kind === "pocket" ? L.pocket : L.behind, p.x * W, p.y * H, size, "warn");
    }
    if (m.facing !== "front") {
      const text = m.facing === "back" ? L.back : m.turnDeg !== null ? `${L.side} ${m.turnDeg}°` : L.side;
      this.label(ctx, text, m.nose.x, m.nose.y - m.sw * 0.6, size, m.facing === "back" ? "bad" : "warn");
    }
  }

  private label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, tone: Status) {
    ctx.save();
    ctx.font = `600 ${size}px system-ui, sans-serif`;
    const w = ctx.measureText(text).width + size;
    const h = size * 1.5;
    ctx.translate(x, y);
    if (this.mirrored) ctx.scale(-1, 1);
    ctx.fillStyle = "rgba(10,10,14,0.72)";
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, h / 2);
    ctx.fill();
    ctx.strokeStyle = STATUS_COLOR[tone];
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = tone === "good" ? "#fff" : STATUS_COLOR[tone];
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 0, 1);
    ctx.restore();
  }

  private drawHand(ctx: CanvasRenderingContext2D, h: HandInfo, color: string, poseWrist: Point | null, sw: number) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = h.palmFacing ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.45)";
    ctx.beginPath();
    // predlaktie sa pripojí k nameranej ruke, aby kostra nemala medzeru; ďaleké alebo nejasné ruky sa nespájajú
    if (poseWrist) {
      const gap = Math.hypot(poseWrist.x - h.pts[0].x, poseWrist.y - h.pts[0].y);
      if (gap > 1 && gap < sw * 0.45) {
        ctx.moveTo(poseWrist.x, poseWrist.y);
        ctx.lineTo(h.pts[0].x, h.pts[0].y);
      }
    }
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.moveTo(h.pts[a].x, h.pts[a].y);
      ctx.lineTo(h.pts[b].x, h.pts[b].y);
    }
    ctx.stroke();
    ctx.fillStyle = color;
    for (const i of [4, 8, 12, 16, 20]) {
      ctx.beginPath();
      ctx.arc(h.pts[i].x, h.pts[i].y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  /** Kruh okolo hlavy a "kužeľ" ukazujúci, kam sa rečník pozerá. */
  private drawHead(ctx: CanvasRenderingContext2D, m: Metrics, color: string) {
    const r = m.sw * 0.42;
    const { x, y } = m.nose;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    if (m.gaze === "center") {
      // pozerá priamo do publika: hlava jemne svieti
      ctx.fillStyle = color + "33";
      ctx.fill();
    } else {
      // canvas je zobrazený zrkadlovo: pohľad doprava (z pohľadu rečníka) = záporné x
      const dir = m.gazeYaw > 0 ? Math.PI : 0;
      const len = r * (1.6 + 1.4 * Math.min(1, Math.abs(m.gazeYaw) / 0.4));
      const grad = ctx.createRadialGradient(x, y, r * 0.5, x, y, len);
      grad.addColorStop(0, color + "aa");
      grad.addColorStop(1, color + "00");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.arc(x, y, len, dir - 0.35, dir + 0.35);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  private drawZone(ctx: CanvasRenderingContext2D, m: Metrics) {
    const { zone } = m;
    const ok = m.visibleWrists > 0 && m.wristsInZone === m.visibleWrists;
    ctx.save();
    ctx.setLineDash([14, 10]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = ok ? "rgba(34,197,94,0.75)" : "rgba(255,255,255,0.35)";
    ctx.fillStyle = ok ? "rgba(34,197,94,0.07)" : "rgba(255,255,255,0.03)";
    ctx.beginPath();
    ctx.roundRect(zone.left, zone.top, zone.right - zone.left, zone.bottom - zone.top, 18);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  private drawSkeleton(ctx: CanvasRenderingContext2D, lm: NormalizedLandmark[], W: number, H: number) {
    const visible = (i: number) => (lm[i].visibility ?? 1) > 0.5;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineWidth = 5;
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    for (const [a, b] of [...UPPER_BODY, ...LEGS]) {
      if (!visible(a) || !visible(b)) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * W, lm[a].y * H);
      ctx.lineTo(lm[b].x * W, lm[b].y * H);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    for (const i of [LM.leftShoulder, LM.rightShoulder, LM.leftElbow, LM.rightElbow]) {
      if (!visible(i)) continue;
      ctx.beginPath();
      ctx.arc(lm[i].x * W, lm[i].y * H, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  private drawTrails(ctx: CanvasRenderingContext2D, m: Metrics, color: string, t: number) {
    const push = (arr: (Point & { t: number })[], p: Point | null) => {
      if (p) arr.push({ ...p, t });
      while (arr.length && t - arr[0].t > TRAIL_MS) arr.shift();
    };
    push(this.trails.l, m.leftWrist);
    push(this.trails.r, m.rightWrist);

    ctx.save();
    ctx.lineCap = "round";
    for (const trail of [this.trails.l, this.trails.r]) {
      for (let i = 1; i < trail.length; i++) {
        const age = (t - trail[i].t) / TRAIL_MS;
        ctx.globalAlpha = Math.max(0, 1 - age) * 0.9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 10 * (1 - age) + 2;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    for (const p of [m.leftWrist, m.rightWrist]) {
      if (!p) continue;
      ctx.fillStyle = color;
      ctx.shadowColor = color;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.restore();
  }
}
