"use client";

/* eslint-disable @next/next/no-img-element -- záložný obrázok z dizajnu, ak nie je dostupné WebGL */
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Group,
  LineBasicMaterial,
  LineSegments,
  Matrix4,
  PerspectiveCamera,
  Points,
  Scene,
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderer,
} from "three";

/*
  Živý 3D mozog z bodiek. Tvar sa vzorkuje z /landing/ai-brain.jpg (siluéta + hustota podľa jasu),
  hĺbka z eliptického profilu. Neuróny sú uzly v grafe najbližších susedov, signály po nich cestujú
  a rozsvecujú okolité bodky (uniformy uPulses). Bez WebGL sa ukáže pôvodný obrázok.
*/

const IMG_SRC = "/landing/ai-brain.jpg";
const IMG_ALT = "Žiariaci mozog zložený z bodiek, symbol AI";

const FOV = 35;
const BRAIN_W = 3.8; // šírka mozgu vo svetových jednotkách
const MAX_PULSES = 16;
const MAX_IMPULSES = 44;
const TRAIL = 14;
const REVEAL_SECONDS = 2.2;

/* ---------------------------------- shadery ---------------------------------- */

const POINTS_VERT = /* glsl */ `
uniform float uTime;
uniform float uProgress;
uniform float uScale;
uniform float uSize;
uniform float uDpr;
uniform float uVariant; // 0 neural, 1 scan, 2 mono
uniform vec4 uPulses[${MAX_PULSES}];
uniform vec4 uMouse; // xyz = bod v priestore mozgu, w = sila hoveru
uniform vec4 uShock; // xyz = stred vlny, w = čas spustenia (s)
uniform vec4 uFocus; // xyz = oblasť zvýraznená štítkom, w = sila
attribute vec3 aScatter;
attribute float aDelay;
attribute float aSeed;
attribute float aRidge;
varying vec3 vColor;
varying float vAlpha;
varying float vPx;

const vec3 PURPLE = vec3(0.490, 0.318, 0.996);
const vec3 LILAC = vec3(0.725, 0.635, 1.0);
const vec3 LIME = vec3(0.667, 1.0, 0.0);
const vec3 LIME_SOFT = vec3(0.824, 1.0, 0.420);
const vec3 WHITE = vec3(0.96, 1.0, 0.9);

void main() {
  float t = clamp((uProgress - aDelay) / 0.55, 0.0, 1.0);
  float e = 1.0 - pow(1.0 - t, 4.0);

  vec3 p = mix(aScatter, position, e);
  float ang = (1.0 - e) * (1.0 - e) * 2.4;
  float c = cos(ang), s = sin(ang);
  p.xz = mat2(c, -s, s, c) * p.xz;
  p += vec3(sin(uTime * 0.7 + aSeed * 40.0), cos(uTime * 0.6 + aSeed * 31.0), sin(uTime * 0.5 + aSeed * 23.0)) * 0.008 * e;

  // signály
  float g = 0.0;
  for (int i = 0; i < ${MAX_PULSES}; i++) {
    vec3 d = position - uPulses[i].xyz;
    g += uPulses[i].w * exp(-dot(d, d) / 0.02);
  }

  // hover: bodky pod kurzorom sa nadvihnú a rozsvietia
  vec2 dm = position.xy - uMouse.xy;
  float hm = uMouse.w * exp(-dot(dm, dm) / 0.16);
  p += normalize(vec3(dm * 1.4, sign(position.z) + 0.001)) * hm * 0.16 * e;
  g += hm * 0.55;

  // klik: rázová vlna
  float age = uTime - uShock.w;
  if (age > 0.0 && age < 2.2) {
    float r = age * 2.1;
    float dist = length(position - uShock.xyz);
    float band = exp(-pow(dist - r, 2.0) / 0.012) * (1.0 - age / 2.2);
    g += band * 1.4;
    p += normalize(position - uShock.xyz + 0.0001) * band * 0.12;
  }

  // štítok: zvýraznená oblasť
  vec3 df = position - uFocus.xyz;
  g += uFocus.w * exp(-dot(df, df) / 0.28) * 0.75;

  // skenovacia rovina (variant scan)
  float scan = 0.0;
  if (uVariant > 0.5 && uVariant < 1.5) {
    float sx = sin(uTime * 0.45) * 2.2;
    scan = exp(-pow(position.x - sx, 2.0) / 0.006);
    g += scan * 0.9;
  }
  g = min(g, 1.2);

  float twinkle = 0.82 + 0.18 * sin(uTime * 2.0 + aSeed * 60.0);
  float ridge = smoothstep(0.45, 1.0, aRidge);
  vec3 base;
  if (uVariant > 1.5) {
    base = mix(vec3(0.35, 0.42, 0.30), LIME_SOFT, 0.35 + ridge * 0.65);
  } else if (uVariant > 0.5) {
    base = mix(PURPLE * 0.8, LILAC, aRidge * 0.5);
  } else {
    base = mix(PURPLE, LILAC, aRidge * 0.45);
    base = mix(base, LIME, ridge * 0.7);
  }
  vec3 hot = uVariant > 1.5 ? WHITE : LIME_SOFT;
  vColor = mix(base, hot, clamp(g, 0.0, 1.0) * 0.85);

  vec4 world = modelMatrix * vec4(p, 1.0);
  float depth = clamp(world.z / 2.6 + 0.5, 0.0, 1.0);
  float dim = uVariant > 0.5 && uVariant < 1.5 ? 0.55 : 1.0;
  vAlpha = ((0.16 + 0.78 * aRidge * aRidge) * dim * twinkle * (0.35 + 0.65 * depth) + g * 0.22) * smoothstep(0.0, 0.35, t);

  vec4 mv = viewMatrix * world;
  float size = uSize * (0.8 + aRidge * 0.5) * (1.0 + g * 0.25) * smoothstep(0.0, 0.2, t);
  float px = max(size * uScale / -mv.z, 0.0);
  // aspoň ~1.6 CSS px, nech bodky nie sú subpixelová hmla
  px = max(px, 1.25 * uDpr * step(0.001, t));
  vPx = px;
  gl_PointSize = px;
  gl_Position = projectionMatrix * mv;
}
`;

const POINTS_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
varying float vPx;
void main() {
  // ostrý disk s 1px antialiasingom (bez gaussovskej hmly)
  float d = length(gl_PointCoord - 0.5) * vPx;
  float r = vPx * 0.5;
  float a = clamp(r - d, 0.0, 1.0);
  if (a <= 0.0) discard;
  gl_FragColor = vec4(vColor, a * vAlpha);
}
`;

const SIGNAL_VERT = /* glsl */ `
uniform float uScale;
uniform float uSize;
attribute float aAmp;
varying float vAmp;
void main() {
  vAmp = aAmp;
  vec4 mv = viewMatrix * modelMatrix * vec4(position, 1.0);
  float size = uSize * (0.4 + aAmp * 1.1);
  gl_PointSize = aAmp < 0.005 ? 0.0 : max(size * uScale / -mv.z, 0.0);
  gl_Position = projectionMatrix * mv;
}
`;

const SIGNAL_FRAG = /* glsl */ `
varying float vAmp;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.42, d) * (0.55 + 0.45 * exp(-d * d * 30.0));
  vec3 lime = vec3(0.667, 1.0, 0.0);
  vec3 white = vec3(0.93, 1.0, 0.82);
  vec3 col = mix(lime, white, smoothstep(0.55, 1.0, vAmp));
  gl_FragColor = vec4(col, a * min(vAmp * 1.25, 1.0));
}
`;

/* ------------------------------- tvar z obrázka ------------------------------- */

type Cloud = {
  positions: Float32Array;
  scatter: Float32Array;
  delay: Float32Array;
  seed: Float32Array;
  ridge: Float32Array;
  count: number;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("img"));
    img.src = src;
  });
}

/** Rozdelenie siluety a hustoty z obrázka. Vráti null, ak sa nepodarí. */
async function sampleImage(count: number): Promise<Cloud | null> {
  try {
    const img = await loadImage(IMG_SRC);
    const SW = 480;
    const SH = Math.round((SW * img.naturalHeight) / img.naturalWidth);
    const canvas = document.createElement("canvas");
    canvas.width = SW;
    canvas.height = SH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, SW, SH);
    const data = ctx.getImageData(0, 0, SW, SH).data;

    const N = SW * SH;
    const lum = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const m = Math.max(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]) / 255;
      lum[i] = Math.max(0, (m - 0.055) / 0.945);
    }

    // siluéta: rozmazanie, prah, mierne rozšírenie, vyplnenie dier (ryhy medzi závitmi)
    const blur = boxBlur(boxBlur(lum, SW, SH, 2), SW, SH, 2);
    let mask: Uint8Array = new Uint8Array(N);
    for (let i = 0; i < N; i++) mask[i] = blur[i] > 0.03 ? 1 : 0;
    mask = dilate(mask, SW, SH, 3);
    const outside = floodOutside(mask, SW, SH);
    const inside = new Uint8Array(N);
    let minX = SW, maxX = 0, minY = SH, maxY = 0, area = 0;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = y * SW + x;
        if (!outside[i]) {
          inside[i] = 1;
          area++;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (area < N * 0.08 || area > N * 0.9) return null;

    const dist = distanceToOutside(inside, SW, SH);
    const bboxW = maxX - minX + 1;
    const scale = BRAIN_W / bboxW;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const R = bboxW * 0.2; // polomer „nafúknutia“ do hĺbky v px
    const zMax = 1.25;

    // kumulatívne váhy pre výber pixelov
    const cum = new Float64Array(N);
    let acc = 0;
    for (let i = 0; i < N; i++) {
      if (inside[i]) acc += 0.05 + Math.pow(Math.min(1, lum[i] * 1.6), 1.5);
      cum[i] = acc;
    }

    const cloud = allocCloud(count);
    for (let k = 0; k < count; k++) {
      const r = Math.random() * acc;
      let lo = 0, hi = N - 1;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] < r) lo = mid + 1;
        else hi = mid;
      }
      const px = lo % SW;
      const py = (lo / SW) | 0;
      const fx = px + Math.random();
      const fy = py + Math.random();
      const tNorm = Math.min(1, dist[lo] / R);
      const h = Math.sqrt(Math.max(0, 1 - (1 - tNorm) * (1 - tNorm)));
      const side = Math.random() < 0.5 ? -1 : 1;
      const zh = zMax * h * 0.5 + 0.03;
      // hemisféry s jemnou medzerou v strede, body prevažne pri povrchu
      const z = side * (0.035 + zh * (1 - 0.55 * Math.pow(Math.random(), 3)));
      const x = (fx - cx) * scale;
      const y = -(fy - cy) * scale;
      setPoint(cloud, k, x, y, z + (Math.random() - 0.5) * 0.02, Math.min(1, Math.pow(Math.min(1, lum[lo] * 2.2), 0.8)));
    }
    return cloud;
  } catch {
    return null;
  }
}

/** Núdzový tvar: elipsoid s vlnením povrchu (keď sa obrázok nepodarí načítať). */
function proceduralCloud(count: number): Cloud {
  const cloud = allocCloud(count);
  for (let k = 0; k < count; k++) {
    const u = Math.random() * 2 - 1;
    const a = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(1 - u * u);
    let x = rr * Math.cos(a);
    let y = u;
    let z = rr * Math.sin(a);
    const wave =
      0.08 * Math.sin(x * 9 + y * 5) * Math.sin(y * 8 - z * 6) + 0.05 * Math.sin(z * 12 + x * 4);
    const rad = 1 + wave - 0.35 * Math.max(0, -y) * Math.max(0, -x - 0.1); // zárez pre spánkový lalok
    x *= 1.9 * rad;
    y *= 1.35 * rad;
    z *= 1.25 * rad;
    z += Math.sign(z) * 0.035;
    setPoint(cloud, k, x, y + 0.1, z, Math.min(1, Math.max(0, 0.5 + wave * 5)));
  }
  return cloud;
}

function allocCloud(count: number): Cloud {
  return {
    positions: new Float32Array(count * 3),
    scatter: new Float32Array(count * 3),
    delay: new Float32Array(count),
    seed: new Float32Array(count),
    ridge: new Float32Array(count),
    count,
  };
}

function setPoint(c: Cloud, k: number, x: number, y: number, z: number, ridge: number) {
  c.positions[k * 3] = x;
  c.positions[k * 3 + 1] = y;
  c.positions[k * 3 + 2] = z;
  // rozptýlený oblak ďaleko okolo
  const u = Math.random() * 2 - 1;
  const a = Math.random() * Math.PI * 2;
  const rr = Math.sqrt(1 - u * u);
  const rad = 5 + Math.random() * 9;
  c.scatter[k * 3] = rr * Math.cos(a) * rad * 1.5;
  c.scatter[k * 3 + 1] = u * rad * 0.8;
  c.scatter[k * 3 + 2] = rr * Math.sin(a) * rad;
  c.delay[k] = 0.28 * Math.random() + 0.17 * Math.min(1, Math.max(0, x / BRAIN_W + 0.5));
  c.seed[k] = Math.random();
  c.ridge[k] = ridge;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / win;
      sum += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0;
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / win;
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function dilate(mask: Uint8Array, w: number, h: number, r: number): Uint8Array {
  // oddelené dilatácie po osiach (štvorcové jadro)
  const tmp = new Uint8Array(mask.length);
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) {
        const xx = x + k;
        if (xx >= 0 && xx < w && mask[y * w + xx]) v = 1;
      }
      tmp[y * w + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let k = -r; k <= r && !v; k++) {
        const yy = y + k;
        if (yy >= 0 && yy < h && tmp[yy * w + x]) v = 1;
      }
      out[y * w + x] = v;
    }
  }
  return out;
}

function floodOutside(mask: Uint8Array, w: number, h: number): Uint8Array {
  const outside = new Uint8Array(mask.length);
  const stack: number[] = [];
  const push = (i: number) => {
    if (!mask[i] && !outside[i]) {
      outside[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    push(x);
    push((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    push(y * w);
    push(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
  return outside;
}

/** Chamfer vzdialenosť od najbližšieho pixelu mimo siluety (v px). */
function distanceToOutside(inside: Uint8Array, w: number, h: number): Float32Array {
  const d = new Float32Array(inside.length);
  const BIG = 1e6;
  for (let i = 0; i < d.length; i++) d[i] = inside[i] ? BIG : 0;
  const S = Math.SQRT2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) {
        v = Math.min(v, d[i - w] + 1);
        if (x > 0) v = Math.min(v, d[i - w - 1] + S);
        if (x < w - 1) v = Math.min(v, d[i - w + 1] + S);
      }
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      if (!d[i]) continue;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) {
        v = Math.min(v, d[i + w] + 1);
        if (x < w - 1) v = Math.min(v, d[i + w + 1] + S);
        if (x > 0) v = Math.min(v, d[i + w - 1] + S);
      }
      d[i] = v;
    }
  }
  return d;
}

/* ------------------------------ sieť neurónov ------------------------------ */

type Edge = { a: number; b: number; ctrl: Vector3; len: number };
type Impulse = { edge: number; dir: 1 | -1; t: number; depth: number; age: number; speed: number };

type Network = {
  nodes: Float32Array; // n * 3
  edges: Edge[];
  adj: number[][]; // uzol -> indexy hrán
};

function buildNetwork(cloud: Cloud, nodeCount: number): Network {
  const pos = cloud.positions;
  const picked: number[] = [];
  const minDist = 0.2;
  let tries = 0;
  while (picked.length < nodeCount && tries < nodeCount * 60) {
    tries++;
    const k = (Math.random() * cloud.count) | 0;
    const z = pos[k * 3 + 2];
    // väčšina uzlov na privrátenej strane, aby bol signál viditeľný
    if (z < 0 && Math.random() < 0.8) continue;
    if (cloud.ridge[k] < 0.15 && Math.random() < 0.7) continue;
    let ok = true;
    for (const j of picked) {
      const dx = pos[j * 3] - pos[k * 3];
      const dy = pos[j * 3 + 1] - pos[k * 3 + 1];
      const dz = pos[j * 3 + 2] - pos[k * 3 + 2];
      if (dx * dx + dy * dy + dz * dz < minDist * minDist) {
        ok = false;
        break;
      }
    }
    if (ok) picked.push(k);
  }
  const n = picked.length;
  const nodes = new Float32Array(n * 3);
  picked.forEach((k, i) => {
    nodes[i * 3] = pos[k * 3];
    nodes[i * 3 + 1] = pos[k * 3 + 1];
    nodes[i * 3 + 2] = pos[k * 3 + 2] + Math.sign(pos[k * 3 + 2] || 1) * 0.03;
  });

  const edges: Edge[] = [];
  const adj: number[][] = Array.from({ length: n }, () => []);
  const seen = new Set<number>();
  const maxLen = 0.75;
  for (let i = 0; i < n; i++) {
    const cand: { j: number; d: number }[] = [];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const dx = nodes[i * 3] - nodes[j * 3];
      const dy = nodes[i * 3 + 1] - nodes[j * 3 + 1];
      const dz = nodes[i * 3 + 2] - nodes[j * 3 + 2];
      cand.push({ j, d: Math.sqrt(dx * dx + dy * dy + dz * dz) });
    }
    cand.sort((p, q) => p.d - q.d);
    for (const { j, d } of cand.slice(0, 3)) {
      if (d > maxLen) continue;
      const key = Math.min(i, j) * n + Math.max(i, j);
      if (seen.has(key)) continue;
      seen.add(key);
      const a = new Vector3(nodes[i * 3], nodes[i * 3 + 1], nodes[i * 3 + 2]);
      const b = new Vector3(nodes[j * 3], nodes[j * 3 + 1], nodes[j * 3 + 2]);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      // oblúk: vyšpúlenie smerom von od stredu mozgu + náhodné bočné vybočenie
      const out = mid.clone().setLength(1).multiplyScalar(d * 0.28);
      const side = b.clone().sub(a).cross(new Vector3(0, 0, 1)).setLength(d * 0.18 * (Math.random() - 0.5) * 2);
      const ctrl = mid.add(out).add(side);
      adj[i].push(edges.length);
      adj[j].push(edges.length);
      edges.push({ a: i, b: j, ctrl, len: d * 1.15 });
    }
  }
  return { nodes, edges, adj };
}

function bezier(e: Edge, nodes: Float32Array, t: number, out: Vector3) {
  const u = 1 - t;
  const w0 = u * u, w1 = 2 * u * t, w2 = t * t;
  out.set(
    w0 * nodes[e.a * 3] + w1 * e.ctrl.x + w2 * nodes[e.b * 3],
    w0 * nodes[e.a * 3 + 1] + w1 * e.ctrl.y + w2 * nodes[e.b * 3 + 1],
    w0 * nodes[e.a * 3 + 2] + w1 * e.ctrl.z + w2 * nodes[e.b * 3 + 2],
  );
}

/* --------------------------------- komponent --------------------------------- */

export type BrainLabel = {
  text: ReactNode;
  /** kotva v súradniciach mozgu (x ±1.9, y ±1.3, z > 0 = privrátená strana) */
  at: [number, number, number];
  /** posun štítka od kotvy v CSS px */
  offset: [number, number];
};

const VARIANTS = { neural: 0, scan: 1, mono: 2 } as const;

export function BrainScene({ labels = [], style }: { labels?: BrainLabel[]; style?: CSSProperties }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fallbackRef = useRef<HTMLImageElement>(null);
  const labelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const focusRef = useRef<{ index: number; set: (i: number) => void }>({ index: -1, set: () => {} });
  const anchors = useRef(labels.map((l) => l.at));
  useEffect(() => {
    anchors.current = labels.map((l) => l.at);
  }, [labels]);

  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    const fallback = fallbackRef.current;
    if (!wrap || !canvas || !fallback) return;

    const showFallback = () => {
      fallback.src = IMG_SRC;
      fallback.style.opacity = "1";
      wrap.style.mixBlendMode = "screen";
      canvas.style.display = "none";
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const small = window.innerWidth < 700;
    const variantKey = new URLSearchParams(window.location.search).get("brain") as keyof typeof VARIANTS | null;
    const variant = variantKey && variantKey in VARIANTS ? VARIANTS[variantKey] : 0;
    const pointCount = small ? 16000 : 36000;
    const nodeCount = small ? 150 : 300;

    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "high-performance" });
    } catch {
      showFallback();
      return;
    }
    renderer.setClearColor(0x000000, 0);
    // pri zoome prehliadača rastie devicePixelRatio; prepočítava sa v resize(), inak sa plátno rozmaže
    const maxDpr = small ? 2.5 : 3;
    let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    renderer.setPixelRatio(dpr);

    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
    const group = new Group();
    scene.add(group);

    const disposables: { dispose(): void }[] = [];
    let cancelled = false;
    let raf = 0;
    let inView = false;
    let ready = false;
    let revealStart = -1;
    let camDist = 6;

    const mouse = { x: 0, y: 0, sx: 0, sy: 0, px: -1, py: -1, inside: false };
    const hover = { str: 0, local: new Vector3(), timer: 0 };
    const focus = { str: 0, pos: new Vector3(), timer: 0 };
    const state = { progress: reduced ? 1 : 0, activity: 0 };

    let pointsMat: ShaderMaterial | null = null;
    let signalMat: ShaderMaterial | null = null;
    let lineMat: LineBasicMaterial | null = null;
    let network: Network | null = null;
    let flash: Float32Array = new Float32Array(0);
    let trailPos: Float32Array = new Float32Array(0);
    let sigAmp: Float32Array = new Float32Array(0);
    let sigPosAttr: BufferAttribute | null = null;
    let sigAmpAttr: BufferAttribute | null = null;
    const impulses: Impulse[] = [];
    let spawnTimer = 0;
    const pulses = Array.from({ length: MAX_PULSES }, () => new Vector4(0, 0, 0, 0));
    const uMouse = new Vector4(0, 0, 0, 0);
    const uShock = new Vector4(0, 0, 0, -10);
    const uFocus = new Vector4(0, 0, 0, 0);
    const tmp = new Vector3();
    const ray = { o: new Vector3(), d: new Vector3() };
    const inv = new Matrix4();
    let time = 0;

    const resize = () => {
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      if (pointsMat) pointsMat.uniforms.uDpr.value = dpr;
      camera.aspect = w / h;
      const tan = Math.tan((FOV * Math.PI) / 360);
      camDist = Math.max(4.2 / (2 * tan), 5.3 / (2 * tan * camera.aspect));
      camera.position.set(0, 0, camDist);
      camera.updateProjectionMatrix();
      const scale = renderer.domElement.height / (2 * tan);
      if (pointsMat) pointsMat.uniforms.uScale.value = scale;
      if (signalMat) signalMat.uniforms.uScale.value = scale;
      if (ready) renderer.render(scene, camera);
    };

    /** lúč z kurzora do roviny z = 0.35 v súradniciach mozgu */
    const pick = (cx: number, cy: number, out: Vector3) => {
      const r = canvas.getBoundingClientRect();
      const nx = ((cx - r.left) / r.width) * 2 - 1;
      const ny = -((cy - r.top) / r.height) * 2 + 1;
      group.updateMatrixWorld();
      inv.copy(group.matrixWorld).invert();
      ray.o.copy(camera.position).applyMatrix4(inv);
      ray.d.set(nx, ny, 0.5).unproject(camera).applyMatrix4(inv).sub(ray.o).normalize();
      if (Math.abs(ray.d.z) < 1e-4) return false;
      const t = (0.35 - ray.o.z) / ray.d.z;
      out.copy(ray.o).addScaledVector(ray.d, t);
      return Math.abs(out.x) < BRAIN_W * 0.55 && Math.abs(out.y) < 1.45;
    };

    const nearestNodes = (pos: Vector3, k: number) => {
      if (!network) return [];
      const nn = network.nodes;
      const out: { i: number; d: number }[] = [];
      for (let i = 0; i < nn.length / 3; i++) {
        const dx = nn[i * 3] - pos.x, dy = nn[i * 3 + 1] - pos.y, dz = nn[i * 3 + 2] - pos.z;
        out.push({ i, d: dx * dx + dy * dy + dz * dz });
      }
      return out.sort((a, b) => a.d - b.d).slice(0, k).map((o) => o.i);
    };

    const spawn = (edge: number, dir: 1 | -1, depth: number, from?: number) => {
      if (impulses.length >= MAX_IMPULSES) return;
      impulses.push({ edge, dir, t: 0, depth, age: 0, speed: 0.75 + Math.random() * 0.5 });
      if (from !== undefined) flash[from] = Math.max(flash[from], 0.6);
    };

    const spawnFromNode = (node: number, depth: number, excludeEdge = -1) => {
      if (!network) return;
      const options = network.adj[node].filter((e) => e !== excludeEdge);
      if (!options.length) return;
      const count = depth === 0 ? 1 : Math.min(options.length, Math.random() < 0.35 ? 3 : 2);
      for (let c = 0; c < count; c++) {
        const idx = (Math.random() * options.length) | 0;
        const ei = options.splice(idx, 1)[0];
        const e = network.edges[ei];
        spawn(ei, e.a === node ? 1 : -1, depth, node);
      }
    };

    const update = (dt: number) => {
      if (!network || !pointsMat || !signalMat || !lineMat) return;
      const n = network.nodes.length / 3;
      const act = state.activity;

      if (act > 0.02) {
        spawnTimer -= dt * act;
        if (spawnTimer <= 0) {
          spawnTimer = 0.1 + Math.random() * 0.2;
          spawnFromNode((Math.random() * n) | 0, 0);
          if (Math.random() < 0.35) spawnFromNode((Math.random() * n) | 0, 0);
        }
      }

      // hover: neuróny pod kurzorom strieľajú
      const hit = mouse.inside && state.progress > 0.9 && pick(mouse.px, mouse.py, tmp);
      if (hit) hover.local.lerp(tmp, Math.min(1, dt * 10));
      hover.str += ((hit ? 1 : 0) - hover.str) * Math.min(1, dt * 5);
      canvas.style.cursor = hit ? "pointer" : "";
      if (hit) {
        hover.timer -= dt;
        if (hover.timer <= 0) {
          hover.timer = 0.09;
          const near = nearestNodes(hover.local, 3);
          spawnFromNode(near[(Math.random() * near.length) | 0], 1);
        }
      }
      uMouse.set(hover.local.x, hover.local.y, hover.local.z, hover.str);

      // štítok: oblasť sa rozsvieti a odpaľuje
      const fi = focusRef.current.index;
      if (fi >= 0 && anchors.current[fi]) {
        const a = anchors.current[fi];
        focus.pos.set(a[0], a[1], a[2]);
        focus.timer -= dt;
        if (focus.timer <= 0) {
          focus.timer = 0.12;
          const near = nearestNodes(focus.pos, 6);
          spawnFromNode(near[(Math.random() * near.length) | 0], 1);
        }
      }
      focus.str += ((fi >= 0 ? 1 : 0) - focus.str) * Math.min(1, dt * 4);
      uFocus.set(focus.pos.x, focus.pos.y, focus.pos.z, focus.str);

      for (let i = impulses.length - 1; i >= 0; i--) {
        const im = impulses[i];
        const e = network.edges[im.edge];
        im.age += dt;
        im.t += (im.speed * dt) / e.len;
        if (im.t >= 1) {
          const arrive = im.dir === 1 ? e.b : e.a;
          flash[arrive] = 1;
          if (im.depth < 3 && Math.random() < 0.6 - im.depth * 0.15) {
            spawnFromNode(arrive, im.depth + 1, im.edge);
          }
          impulses.splice(i, 1);
        }
      }

      const decay = Math.exp(-dt * 2.4);
      const cand: { x: number; y: number; z: number; w: number }[] = [];
      for (let i = 0; i < n; i++) {
        if (flash[i] > 0.003) {
          flash[i] *= decay;
          if (flash[i] > 0.06) {
            cand.push({ x: network.nodes[i * 3], y: network.nodes[i * 3 + 1], z: network.nodes[i * 3 + 2], w: flash[i] * 1.2 });
          }
        } else flash[i] = 0;
        sigAmp[i] = 0.1 + flash[i] * 0.9;
      }

      const base = n;
      for (let s = 0; s < MAX_IMPULSES * TRAIL; s++) sigAmp[base + s] = 0;
      impulses.forEach((im, slot) => {
        const e = network!.edges[im.edge];
        const fade = Math.min(1, im.age * 7);
        for (let k = 0; k < TRAIL; k++) {
          let tt = im.t - (k * 0.035) / e.len;
          if (tt < 0) break;
          if (tt > 1) tt = 1;
          bezier(e, network!.nodes, im.dir === 1 ? tt : 1 - tt, tmp);
          const o = (slot * TRAIL + k) * 3;
          trailPos[o] = tmp.x;
          trailPos[o + 1] = tmp.y;
          trailPos[o + 2] = tmp.z;
          sigAmp[base + slot * TRAIL + k] = Math.pow(1 - k / TRAIL, 1.7) * fade;
          if (k === 0) cand.push({ x: tmp.x, y: tmp.y, z: tmp.z, w: 0.7 * fade });
        }
      });
      cand.sort((p, q) => q.w - p.w);
      for (let i = 0; i < MAX_PULSES; i++) {
        const c = cand[i];
        if (c) pulses[i].set(c.x, c.y, c.z, c.w);
        else pulses[i].w = 0;
      }

      if (sigPosAttr) sigPosAttr.needsUpdate = true;
      if (sigAmpAttr) sigAmpAttr.needsUpdate = true;
      lineMat.opacity = (0.1 + 0.08 * Math.max(hover.str, focus.str)) * act;
      pointsMat.uniforms.uTime.value = time;
    };

    /** štítky sledujú svoje kotvy pri otáčaní mozgu */
    const placeLabels = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      group.updateMatrixWorld();
      anchors.current.forEach((a, i) => {
        const el = labelRefs.current[i];
        if (!el) return;
        tmp.set(a[0], a[1], a[2]).applyMatrix4(group.matrixWorld).project(camera);
        el.style.transform = `translate3d(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px, 0)`;
        el.style.opacity = String(Math.min(1, Math.max(0, (state.progress - 0.75) / 0.25)));
      });
    };

    const frame = (now: number) => {
      raf = 0;
      if (cancelled) return;
      time = now / 1000;
      const dt = Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;

      if (revealStart >= 0 && !reduced) {
        state.progress = Math.min(1, (now - revealStart) / 1000 / REVEAL_SECONDS);
      }
      if (state.progress >= 0.85 && !reduced) state.activity = Math.min(1, state.activity + dt / 1.6);

      const rect = wrap.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const sp = Math.min(1, Math.max(0, (vh - rect.top) / (vh + rect.height)));

      mouse.sx += (mouse.x - mouse.sx) * Math.min(1, dt * 3);
      mouse.sy += (mouse.y - mouse.sy) * Math.min(1, dt * 3);

      // pri hoveri sa otáčanie upokojí, aby sa dalo „dotýkať“
      const calm = 1 - 0.6 * Math.max(hover.str, focus.str);
      const sway = Math.sin(time * 0.28) * ((22 * Math.PI) / 180) * calm;
      group.rotation.y = sway + mouse.sx * 0.22 + (sp - 0.5) * 0.4;
      group.rotation.x = mouse.sy * 0.12 + (sp - 0.5) * 0.08;
      group.scale.setScalar(1 + 0.015 * Math.sin(time * 1.3));
      camera.position.z = camDist * (1.06 - 0.12 * sp);

      pointsMat!.uniforms.uProgress.value = state.progress;
      update(dt);
      renderer.render(scene, camera);
      placeLabels();
      schedule();
    };

    let lastNow = performance.now();
    const schedule = () => {
      if (!raf && ready && inView && !document.hidden && !reduced && !cancelled) {
        lastNow = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };

    const onVisibility = () => {
      if (document.hidden && raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      } else schedule();
    };

    const onPointer = (ev: PointerEvent) => {
      mouse.x = (ev.clientX / window.innerWidth) * 2 - 1;
      mouse.y = (ev.clientY / window.innerHeight) * 2 - 1;
      mouse.px = ev.clientX;
      mouse.py = ev.clientY;
      const r = canvas.getBoundingClientRect();
      mouse.inside = ev.pointerType === "mouse" && ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    };
    const onLeave = () => {
      mouse.inside = false;
    };

    // klik / ťuknutie: rázová vlna + kaskáda z najbližších neurónov
    const onDown = (ev: PointerEvent) => {
      if (!ready || state.progress < 0.9 || (ev.target as HTMLElement | null)?.closest("a,button")) return;
      if (!pick(ev.clientX, ev.clientY, tmp)) return;
      uShock.set(tmp.x, tmp.y, tmp.z, time);
      for (const node of nearestNodes(tmp, 5)) spawnFromNode(node, 0);
      if (reduced) return;
      schedule();
    };

    focusRef.current.set = (i: number) => {
      focusRef.current.index = i;
      focus.timer = 0;
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          inView = entry.isIntersecting;
          if (entry.intersectionRatio >= 0.2 && revealStart < 0) revealStart = performance.now();
          if (!inView && raf) {
            cancelAnimationFrame(raf);
            raf = 0;
          }
        }
        schedule();
      },
      { threshold: [0, 0.2], rootMargin: "80px 0px" },
    );

    const ro = new ResizeObserver(resize);
    const onContextLost = (ev: Event) => {
      ev.preventDefault();
      showFallback();
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    (async () => {
      const cloud = (await sampleImage(pointCount)) ?? proceduralCloud(pointCount);
      if (cancelled) return;

      // ---- body mozgu
      const geo = new BufferGeometry();
      geo.setAttribute("position", new BufferAttribute(cloud.positions, 3));
      geo.setAttribute("aScatter", new BufferAttribute(cloud.scatter, 3));
      geo.setAttribute("aDelay", new BufferAttribute(cloud.delay, 1));
      geo.setAttribute("aSeed", new BufferAttribute(cloud.seed, 1));
      geo.setAttribute("aRidge", new BufferAttribute(cloud.ridge, 1));
      pointsMat = new ShaderMaterial({
        vertexShader: POINTS_VERT,
        fragmentShader: POINTS_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: {
          uTime: { value: 0 },
          uProgress: { value: state.progress },
          uScale: { value: 400 },
          uSize: { value: small ? 0.016 : 0.0125 },
          uDpr: { value: dpr },
          uVariant: { value: variant },
          uPulses: { value: pulses },
          uMouse: { value: uMouse },
          uShock: { value: uShock },
          uFocus: { value: uFocus },
        },
      });
      const brain = new Points(geo, pointsMat);
      brain.frustumCulled = false;
      group.add(brain);
      disposables.push(geo, pointsMat);

      // ---- sieť neurónov
      network = buildNetwork(cloud, nodeCount);
      const n = network.nodes.length / 3;
      flash = new Float32Array(n);

      const lineVerts: number[] = [];
      const SEG = 10;
      const a = new Vector3();
      const b = new Vector3();
      for (const e of network.edges) {
        bezier(e, network.nodes, 0, a);
        for (let s = 1; s <= SEG; s++) {
          bezier(e, network.nodes, s / SEG, b);
          lineVerts.push(a.x, a.y, a.z, b.x, b.y, b.z);
          a.copy(b);
        }
      }
      const lineGeo = new BufferGeometry();
      lineGeo.setAttribute("position", new BufferAttribute(new Float32Array(lineVerts), 3));
      lineMat = new LineBasicMaterial({
        color: variant === 2 ? 0xd2ff6b : 0xb9a2fe,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const lines = new LineSegments(lineGeo, lineMat);
      lines.frustumCulled = false;
      group.add(lines);
      disposables.push(lineGeo, lineMat);

      // ---- uzly + signály (jeden buffer: n uzlov, potom MAX_IMPULSES * TRAIL bodov chvosta)
      const total = n + MAX_IMPULSES * TRAIL;
      const sigPositions = new Float32Array(total * 3);
      sigPositions.set(network.nodes, 0);
      trailPos = sigPositions.subarray(n * 3);
      sigAmp = new Float32Array(total);
      const sigGeo = new BufferGeometry();
      sigPosAttr = new BufferAttribute(sigPositions, 3);
      sigAmpAttr = new BufferAttribute(sigAmp, 1);
      sigPosAttr.setUsage(35048); // DynamicDrawUsage
      sigAmpAttr.setUsage(35048);
      sigGeo.setAttribute("position", sigPosAttr);
      sigGeo.setAttribute("aAmp", sigAmpAttr);
      signalMat = new ShaderMaterial({
        vertexShader: SIGNAL_VERT,
        fragmentShader: SIGNAL_FRAG,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        uniforms: { uScale: { value: 400 }, uSize: { value: small ? 0.05 : 0.04 } },
      });
      const signals = new Points(sigGeo, signalMat);
      signals.frustumCulled = false;
      signals.visible = !reduced;
      group.add(signals);
      disposables.push(sigGeo, signalMat);

      ready = true;
      resize();
      ro.observe(wrap);
      io.observe(wrap);
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onDown);
      window.addEventListener("resize", resize);
      document.documentElement.addEventListener("pointerleave", onLeave);
      document.addEventListener("visibilitychange", onVisibility);
      if (reduced) {
        pointsMat.uniforms.uProgress.value = 1;
        group.rotation.y = -0.12;
        renderer.render(scene, camera);
        placeLabels();
      }
    })();

    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("resize", resize);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label={IMG_ALT}
      style={{ position: "relative", width: "100%", height: "100%", ...style }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
      />
      <img
        ref={fallbackRef}
        alt=""
        aria-hidden="true"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", opacity: 0, pointerEvents: "none" }}
      />
      {labels.map((l, i) => (
        <div
          key={i}
          ref={(el) => {
            labelRefs.current[i] = el;
          }}
          className="brain-anchor"
          style={{ position: "absolute", left: 0, top: 0, opacity: 0, zIndex: 3, willChange: "transform" }}
        >
          <span className="brain-node" aria-hidden="true" />
          <svg
            aria-hidden="true"
            width={Math.abs(l.offset[0]) + 2}
            height={Math.abs(l.offset[1]) + 2}
            style={{
              position: "absolute",
              left: Math.min(0, l.offset[0]),
              top: Math.min(0, l.offset[1]),
              overflow: "visible",
              pointerEvents: "none",
            }}
          >
            <line
              className="brain-lead"
              x1={l.offset[0] < 0 ? -l.offset[0] : 0}
              y1={l.offset[1] < 0 ? -l.offset[1] : 0}
              x2={l.offset[0] < 0 ? 0 : l.offset[0]}
              y2={l.offset[1] < 0 ? 0 : l.offset[1]}
            />
          </svg>
          <button
            type="button"
            className="brain-pill"
            style={{ transform: `translate(${l.offset[0]}px, ${l.offset[1]}px) translate(${l.offset[0] < 0 ? "-100%" : "0"}, -50%)` }}
            onPointerEnter={() => focusRef.current.set(i)}
            onPointerLeave={() => focusRef.current.set(-1)}
            onFocus={() => focusRef.current.set(i)}
            onBlur={() => focusRef.current.set(-1)}
          >
            <span className="dotp" aria-hidden="true" />
            {l.text}
          </button>
        </div>
      ))}
    </div>
  );
}
