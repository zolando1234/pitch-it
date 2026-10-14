"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { HandLandmarker, NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import { FeedbackEngine, type FeedbackState } from "@/lib/coach/pose/feedback";
import { analyzeHands, type Hands } from "@/lib/coach/pose/hands";
import { LM, MetricsTracker, type Metrics, type MicHand } from "@/lib/coach/pose/metrics";
import { StageRenderer } from "@/lib/coach/pose/renderer";
import { LandmarkSmoother, RoiTracker } from "@/lib/coach/pose/roi";

/** model pózy pracuje interne s 256×256, väčší vstup len spomaľuje (a zväčšuje masku siluety) */
const DETECT_WIDTH = 480;
/** silueta sa počíta len na každom druhom snímku (šetrí GPU) */
const MASK_EVERY = 2;
/** ak 4 s nepríde výsledok, sledovanie reštartujeme */
const WATCHDOG_MS = 4000;
const MAX_RECOVERIES = 5;
/** keď spracovanie snímky trvá dlhšie, prepneme na ľahší model pózy (len v režime "balanced") */
const SLOW_FRAME_MS = 45;
/** krátky výpadok detekcie preklenieme poslednou známou pózou, aby nič neblikalo */
const LOST_GRACE_MS = 700;
const PERF_WARMUP_FRAMES = 60;

/** Hlášky kamery v jazyku rozhrania. */
const TEXT = {
  sk: {
    recoveringTitle: "Obnovujem sledovanie…",
    recoveringTip: "Chvíľu vydrž, reštartujem model.",
    denied:
      "Prístup ku kamere je zamietnutý. Klikni na ikonu kamery alebo zámku v adresnom riadku a kameru povoľ. Na Macu skontroluj aj Nastavenia systému → Súkromie a bezpečnosť → Kamera.",
    notFound: "Nenašli sme kameru. Skontroluj, či je pripojená.",
    busy: "Kameru používa iná aplikácia (Zoom, Teams, FaceTime…). Zavri ju a skús to znova.",
    failed: (detail: string) => `Kameru sa nepodarilo spustiť (${detail}).`,
    videoFailed: "Video sa nepodarilo otvoriť. Skús MP4 (H.264) alebo WebM.",
    modelFailed: "Nepodarilo sa načítať model na sledovanie tela.",
    insecure: "Prehliadač tu kameru nepovoľuje. Otvor stránku cez zabezpečené pripojenie (https) v Chrome alebo Safari.",
    disconnected: "Kamera sa odpojila. Skontroluj ju a spusti nahrávanie znova.",
    unstable: "Sledovanie sa opakovane zastavilo. Zavri iné náročné karty a aplikácie a spusti nahrávanie znova.",
    recoverFailed: "Sledovanie tela sa nepodarilo obnoviť.",
  },
  en: {
    recoveringTitle: "Restoring tracking…",
    recoveringTip: "Hold on a moment, restarting the model.",
    denied:
      "Camera access was denied. Click the camera or lock icon in the address bar and allow the camera. On a Mac also check System Settings → Privacy & Security → Camera.",
    notFound: "No camera found. Check that it is connected.",
    busy: "Another app is using the camera (Zoom, Teams, FaceTime…). Close it and try again.",
    failed: (detail: string) => `The camera could not be started (${detail}).`,
    videoFailed: "The video could not be opened. Try MP4 (H.264) or WebM.",
    modelFailed: "The body tracking model could not be loaded.",
    insecure: "The browser doesn't allow the camera here. Open the page over a secure connection (https) in Chrome or Safari.",
    disconnected: "The camera was disconnected. Check it and start the recording again.",
    unstable: "Tracking stopped repeatedly. Close other heavy tabs and apps and start the recording again.",
    recoverFailed: "Body tracking could not be restored.",
  },
};

const recoveringFb = (t: (typeof TEXT)["sk"]): FeedbackState => ({
  status: "idle",
  title: t.recoveringTitle,
  tip: t.recoveringTip,
  ruleId: "recovering",
  activeIds: [],
  score: 0,
  highlight: null,
});

export type Recording = { url: string; mimeType: string };

/** formáty v poradí preferencie: MP4 sa v prehliadači dobre posúva (seek), WebM ako záloha */
const RECORDING_TYPES = ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
/** nižší bitrate stačí na prehratie chýb a 18-min prejav sa zmestí do pamäte */
const RECORDING_BITRATE = 1_500_000;

export type StageApi = {
  /** začne nahrávať kameru (pre video klipy chýb vo vyhodnotení) */
  startRecording: () => boolean;
  /** ukončí nahrávanie a vráti URL videa */
  stopRecording: () => Promise<Recording | null>;
  /** pozastaví a obnoví nahrávanie (pauza sa vo videu nezobrazí) */
  pauseRecording: () => void;
  resumeRecording: () => void;
  /** malá fotka aktuálneho záberu (JPEG data URL), zrkadlovo ako na obrazovke */
  snapshot: () => string | null;
  /** bod nad hlavou rečníka v pixeloch voči plátnu (pre bublinu s feedbackom) */
  headAnchor: (m: Metrics) => { x: number; y: number } | null;
  /**
   * Nahraté video: spustí prehrávanie od začiatku a vráti zvuk videa ako MediaStream
   * (nahráva sa rovnako ako mikrofón). Volať priamo z kliknutia, inak prehliadač zvuk nepustí.
   */
  /** spustí nahraté video; `muted` = bez zvuku (analýza na pozadí) */
  playSource: (muted?: boolean) => Promise<MediaStream | null>;
};

type Props = {
  /** volá sa každý snímok, nemá robiť setState bez throttlingu */
  onFrame: (fb: FeedbackState, m: Metrics | null, t: number) => void;
  onReady: () => void;
  onError: (message: string) => void;
  micMode: boolean;
  micHand?: MicHand;
  quality?: TrackingQuality;
  /** ktoré pravidlá sa ozývajú (cvičenia sa sústredia len na jednu tému) */
  ruleFilter?: ((id: string) => boolean) | null;
  /** nahraté video namiesto kamery (analyzuje sa počas prehrávania) */
  file?: File | null;
  /** nahraté video dohralo do konca */
  onSourceEnded?: () => void;
  ref?: Ref<StageApi>;
};

const SNAPSHOT_WIDTH = 360;
/** stlmenie videa, aby vynikla silueta (CSS filter beží na kompozítore, je lacný) */
const VIDEO_DIM = 0.38;

type PoseVariant = "full" | "lite" | "heavy";
/** fast = ľahký model, balanced = štandard, precise = najpresnejší (ťažký) model */
export type TrackingQuality = "fast" | "balanced" | "precise";
const VARIANT_FOR: Record<TrackingQuality, PoseVariant> = { fast: "lite", balanced: "full", precise: "heavy" };
type Models = { pose: PoseLandmarker; hands: HandLandmarker | null; variant: PoseVariant };

const WASM_BASE = "/mediapipe/wasm";
const HANDS_MODEL = "/mediapipe/models/hand_landmarker.task";
const poseModel = (variant: PoseVariant) => `/mediapipe/models/pose_landmarker_${variant}.task`;

/** stiahnuté modely držíme v pamäti, aby sa pri štarte nesťahovali znova */
const assetCache = new Map<string, Promise<Uint8Array>>();
function loadAsset(url: string): Promise<Uint8Array> {
  let p = assetCache.get(url);
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`${url}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then((b) => new Uint8Array(b));
    p.catch(() => assetCache.delete(url));
    assetCache.set(url, p);
  }
  return p;
}

let visionLib: Promise<typeof import("@mediapipe/tasks-vision")> | null = null;
const loadVision = () => (visionLib ??= import("@mediapipe/tasks-vision"));

/**
 * Začne sťahovať knižnicu a modely ešte na obrazovke nastavení,
 * aby po kliknutí na štart zostalo len zapnúť kameru a model inicializovať.
 */
export function preloadCoachModels(quality: TrackingQuality) {
  if (typeof window === "undefined") return;
  void loadVision().catch(() => {});
  void loadAsset(poseModel(VARIANT_FOR[quality])).catch(() => {});
  void loadAsset(HANDS_MODEL).catch(() => {});
  // wasm skript a binárka sa načítajú cez prehliadač, stačí zahriať HTTP cache
  for (const f of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) void fetch(`${WASM_BASE}/${f}`).catch(() => {});
}

async function createModels(variant: PoseVariant): Promise<Models> {
  const [{ FilesetResolver, PoseLandmarker, HandLandmarker }, poseBuf, handsBuf] = await Promise.all([
    loadVision(),
    loadAsset(poseModel(variant)),
    loadAsset(HANDS_MODEL).catch(() => null),
  ]);
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
  const createPose = (delegate: "GPU" | "CPU") =>
    PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetBuffer: poseBuf, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      outputSegmentationMasks: true,
      // nižší prah sledovania = model sa drží človeka aj pri rýchlom pohybe a zriedkavejšie ho "stratí"
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.4,
      minTrackingConfidence: 0.3,
    });
  const createHands = (delegate: "GPU" | "CPU") =>
    HandLandmarker.createFromOptions(fileset, {
      baseOptions: handsBuf ? { modelAssetBuffer: handsBuf, delegate } : { modelAssetPath: HANDS_MODEL, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: 0.4,
      minHandPresenceConfidence: 0.4,
      minTrackingConfidence: 0.4,
    });
  const withFallback = async <T,>(create: (d: "GPU" | "CPU") => Promise<T>) => {
    try {
      return await create("GPU");
    } catch {
      return await create("CPU");
    }
  };
  // pózu a ruky inicializujeme súbežne; bez modelu rúk appka funguje ďalej, len bez rozpoznávania dlaní
  const [pose, hands] = await Promise.all([
    withFallback(createPose),
    withFallback(createHands).catch((e) => {
      console.warn("HandLandmarker failed to load", e);
      return null;
    }),
  ]);
  return { pose, hands, variant };
}

function cameraErrorMessage(e: unknown, t: (typeof TEXT)["sk"]): string {
  const name = e instanceof DOMException ? e.name : "";
  switch (name) {
    case "NotAllowedError":
      return t.denied;
    case "NotFoundError":
    case "OverconstrainedError":
      return t.notFound;
    case "NotReadableError":
    case "AbortError":
      return t.busy;
    default:
      return t.failed(name || String(e));
  }
}

export default function CameraStage({
  onFrame,
  onReady,
  onError,
  micMode,
  micHand = "auto",
  quality = "balanced",
  ruleFilter = null,
  file = null,
  onSourceEnded,
  ref,
}: Props) {
  // súbor sa počas jedného štúdia nemení; video zo súboru sa nezrkadlí (kamera áno, ako v zrkadle)
  const [source] = useState(file);
  const locale = useLocale();
  const localeRef = useRef(locale);
  const mirrored = !source;
  const fileUrlRef = useRef<string | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioOutRef = useRef<MediaStream | null>(null);
  const qualityRef = useRef(quality);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
  const trackerRef = useRef<MetricsTracker | null>(null);
  const micModeRef = useRef(micMode);
  const micHandRef = useRef(micHand);
  const engineRef = useRef<FeedbackEngine | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<{ rec: MediaRecorder; chunks: Blob[]; mimeType: string } | null>(null);
  const ruleFilterRef = useRef(ruleFilter);

  useEffect(() => {
    localeRef.current = locale;
    engineRef.current?.setLocale(locale);
  }, [locale]);

  useEffect(() => {
    ruleFilterRef.current = ruleFilter;
    engineRef.current?.setRuleFilter(ruleFilter);
  }, [ruleFilter]);

  useEffect(() => {
    micModeRef.current = micMode;
    micHandRef.current = micHand;
    trackerRef.current?.setMicMode(micMode, micHand);
  }, [micMode, micHand]);

  useImperativeHandle(ref, () => ({
    async playSource(muted = false) {
      const video = videoRef.current;
      if (!source || !video) return null;
      if (muted) {
        video.muted = true;
        video.currentTime = 0;
        try {
          await video.play();
          return new MediaStream();
        } catch (e) {
          console.error(e);
          return null;
        }
      }
      try {
        if (!audioCtxRef.current) {
          // zvuk videa ide do nahrávania aj do reproduktorov (počuješ svoj pitch)
          const ctx = new AudioContext();
          const source = ctx.createMediaElementSource(video);
          const out = ctx.createMediaStreamDestination();
          source.connect(out);
          source.connect(ctx.destination);
          audioCtxRef.current = ctx;
          audioOutRef.current = out.stream;
        }
        video.muted = false;
        video.currentTime = 0;
        const playing = video.play();
        await Promise.all([playing, audioCtxRef.current.resume()]);
        return audioOutRef.current;
      } catch (e) {
        console.error(e);
        return null;
      }
    },
    startRecording() {
      // nahraté video netreba nahrávať znova: klipy chýb sa prehrajú priamo z neho
      if (source) return true;
      const stream = streamRef.current;
      if (!stream || typeof MediaRecorder === "undefined" || recRef.current) return false;
      const mimeType = RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      if (!mimeType) return false;
      try {
        const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: RECORDING_BITRATE });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (e.data.size) chunks.push(e.data);
        };
        rec.start(1000);
        recRef.current = { rec, chunks, mimeType };
        return true;
      } catch (e) {
        console.warn("Recording is not available", e);
        return false;
      }
    },
    pauseRecording() {
      if (source) videoRef.current?.pause();
      else if (recRef.current?.rec.state === "recording") recRef.current.rec.pause();
    },
    resumeRecording() {
      if (source) void videoRef.current?.play().catch(() => {});
      else if (recRef.current?.rec.state === "paused") recRef.current.rec.resume();
    },
    stopRecording() {
      if (source) {
        videoRef.current?.pause();
        const url = fileUrlRef.current;
        return Promise.resolve(url ? { url, mimeType: source.type || "video/mp4" } : null);
      }
      const r = recRef.current;
      recRef.current = null;
      if (!r) return Promise.resolve(null);
      return new Promise((resolve) => {
        const done = () => {
          const blob = new Blob(r.chunks, { type: r.mimeType.split(";")[0] });
          resolve(blob.size ? { url: URL.createObjectURL(blob), mimeType: r.mimeType } : null);
        };
        if (r.rec.state === "inactive") return done();
        r.rec.onstop = done;
        r.rec.stop();
      });
    },
    snapshot() {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (!canvas || !video || !canvas.width) return null;
      const thumb = document.createElement("canvas");
      thumb.width = SNAPSHOT_WIDTH;
      thumb.height = Math.round((SNAPSHOT_WIDTH * canvas.height) / canvas.width);
      const tctx = thumb.getContext("2d")!;
      if (mirrored) {
        tctx.translate(thumb.width, 0);
        tctx.scale(-1, 1);
      }
      // video + stlmenie + vrstva so siluetou, ako to rečník videl
      tctx.drawImage(video, 0, 0, thumb.width, thumb.height);
      tctx.fillStyle = `rgba(0,0,0,${1 - VIDEO_DIM})`;
      tctx.fillRect(0, 0, thumb.width, thumb.height);
      tctx.drawImage(canvas, 0, 0, thumb.width, thumb.height);
      return thumb.toDataURL("image/jpeg", 0.72);
    },
    headAnchor(m) {
      const canvas = canvasRef.current;
      if (!canvas || !canvas.width) return null;
      // plátno je zobrazené cez object-contain a pri kamere zrkadlovo
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const s = Math.min(cw / canvas.width, ch / canvas.height);
      const ox = (cw - canvas.width * s) / 2;
      const oy = (ch - canvas.height * s) / 2;
      return {
        x: ox + (mirrored ? canvas.width - m.nose.x : m.nose.x) * s,
        y: oy + (m.nose.y - m.sw * 0.75) * s,
      };
    },
  }));

  const callbacks = useRef({ onFrame, onReady, onError, onSourceEnded });
  useEffect(() => {
    callbacks.current = { onFrame, onReady, onError, onSourceEnded };
  });

  useEffect(() => {
    let cancelled = false;
    let raf = 0;
    let vfc = 0;
    let stream: MediaStream | null = null;
    let models: Models | null = null;
    let recovering = false;
    let recoveries = 0;
    let stableSince = 0;
    const autoDowngrade = qualityRef.current === "balanced";
    let variant: PoseVariant = VARIANT_FOR[qualityRef.current];
    let roi: RoiTracker | null = null;
    let smoother: LandmarkSmoother | null = null;
    let lastGood: { lm: NormalizedLandmark[]; metrics: Metrics; fb: FeedbackState; at: number } | null = null;
    const videoEl = videoRef.current;

    const tracker = new MetricsTracker();
    tracker.setMicMode(micModeRef.current, micHandRef.current);
    trackerRef.current = tracker;
    const engine = new FeedbackEngine();
    engine.setRuleFilter(ruleFilterRef.current);
    engine.setLocale(localeRef.current);
    const t = () => TEXT[localeRef.current];
    engineRef.current = engine;
    const renderer = new StageRenderer();
    const detectCanvas = document.createElement("canvas");
    const detectCtx = detectCanvas.getContext("2d")!;

    // výkon: priemerný čas spracovania a FPS (EMA)
    let procMs = 0;
    let fps = 0;
    let lastFrameAt = 0;
    let perfFrames = 0;
    let hudAt = 0;

    const closeModels = () => {
      try {
        models?.pose.close();
        models?.hands?.close();
      } catch {
        // model už mohol byť zničený, nevadí
      }
      models = null;
    };

    /** Nahraté video: načíta súbor a čaká na prvý snímok; prehrávanie spustí až playSource(). */
    async function startFromFile(source: File) {
      const modelsReady = createModels(variant);
      modelsReady.catch(() => {});
      const video = videoRef.current!;
      const url = URL.createObjectURL(source);
      fileUrlRef.current = url;
      video.src = url;
      video.muted = true;
      video.preload = "auto";
      video.addEventListener("ended", () => {
        if (!cancelled) callbacks.current.onSourceEnded?.();
      });
      try {
        await new Promise<void>((resolve, reject) => {
          if (video.readyState >= 2) return resolve();
          video.addEventListener("loadeddata", () => resolve(), { once: true });
          video.addEventListener("error", () => reject(new Error("video")), { once: true });
        });
      } catch {
        callbacks.current.onError(t().videoFailed);
        return;
      }
      try {
        models = await modelsReady;
      } catch (e) {
        console.error(e);
        callbacks.current.onError(t().modelFailed);
        return;
      }
      if (cancelled) return closeModels();
      const canvas = canvasRef.current!;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      detectCanvas.width = DETECT_WIDTH;
      detectCanvas.height = Math.round((DETECT_WIDTH * video.videoHeight) / video.videoWidth);
      roi = new RoiTracker(video.videoWidth, video.videoHeight);
      smoother = new LandmarkSmoother(video.videoWidth, video.videoHeight);
      tracker.resetAll();
      lastResultAt = stableSince = performance.now();
      callbacks.current.onReady();
      schedule();
    }

    async function start() {
      if (source) return startFromFile(source);
      if (!navigator.mediaDevices?.getUserMedia) {
        callbacks.current.onError(t().insecure);
        return;
      }
      // modely sa načítavajú súbežne so zapínaním kamery
      const modelsReady = createModels(variant);
      modelsReady.catch(() => {});
      const dropModels = () =>
        void modelsReady.then((m) => {
          m.pose.close();
          m.hands?.close();
        }, () => {});
      try {
        stream = streamRef.current = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 }, facingMode: "user" },
          audio: false,
        });
      } catch (e) {
        console.error(e);
        callbacks.current.onError(cameraErrorMessage(e, t()));
        dropModels();
        return;
      }
      if (cancelled) {
        dropModels();
        return stream.getTracks().forEach((t) => t.stop());
      }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        if (!cancelled) callbacks.current.onError(t().disconnected);
      });

      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();

      try {
        models = await modelsReady;
      } catch (e) {
        console.error(e);
        callbacks.current.onError(t().modelFailed);
        return;
      }
      if (cancelled) return closeModels();

      const canvas = canvasRef.current!;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      detectCanvas.width = DETECT_WIDTH;
      detectCanvas.height = Math.round((DETECT_WIDTH * video.videoHeight) / video.videoWidth);
      roi = new RoiTracker(video.videoWidth, video.videoHeight);
      smoother = new LandmarkSmoother(video.videoWidth, video.videoHeight);
      tracker.resetAll();
      lastResultAt = stableSince = performance.now();
      callbacks.current.onReady();
      schedule();
    }

    /** Zavrie modely a načíta ich znova (po páde alebo pri prepnutí na ľahší model). */
    async function reload(reason: unknown, countAsFailure: boolean) {
      if (recovering || cancelled) return;
      recovering = true;
      console.warn("Reloading tracking:", reason);
      closeModels();
      if (countAsFailure) recoveries++;
      if (recoveries > MAX_RECOVERIES) {
        callbacks.current.onError(t().unstable);
        return;
      }
      try {
        const m = await createModels(variant);
        if (cancelled) {
          m.pose.close();
          m.hands?.close();
          return;
        }
        models = m;
      } catch (e) {
        console.error(e);
        callbacks.current.onError(t().recoverFailed);
        return;
      }
      lastResultAt = stableSince = performance.now();
      perfFrames = 0;
      procMs = 0;
      recovering = false;
    }

    let lastVideoTime = -1;
    let lastTs = 0;
    let lastResultAt = 0;
    let frame = 0;

    /**
     * requestVideoFrameCallback spustí spracovanie presne vtedy, keď príde nový snímok
     * z kamery (nižšia latencia ako dopytovanie cez requestAnimationFrame).
     */
    function schedule() {
      if (cancelled) return;
      const video = videoRef.current;
      if (video && "requestVideoFrameCallback" in video) {
        vfc = video.requestVideoFrameCallback(() => {
          process();
          schedule();
        });
      } else {
        raf = requestAnimationFrame(() => {
          process();
          schedule();
        });
      }
    }

    function updateHud(now: number) {
      if (now - hudAt < 500 || !hudRef.current) return;
      hudAt = now;
      hudRef.current.textContent = `${Math.round(fps)} FPS · ${Math.round(procMs)} ms · ${variant}`;
    }

    function process() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      const now = performance.now();

      if (!models) {
        if (recovering) callbacks.current.onFrame(recoveringFb(t()), null, now);
        return;
      }
      // pri zastavenom videu (pred štartom, pauza) nie sú nové snímky a to nie je pád
      if (video.paused) lastResultAt = now;
      if (now - lastResultAt > WATCHDOG_MS && !video.paused) {
        reload("watchdog: no result", true);
        return;
      }
      if (now - stableSince > 60000) recoveries = 0;
      if (video.currentTime === lastVideoTime || video.readyState < 2) return;
      lastVideoTime = video.currentTime;
      frame++;

      if (lastFrameAt) fps += (1000 / Math.max(now - lastFrameAt, 1) - fps) * 0.1;
      lastFrameAt = now;

      const ctx = canvas.getContext("2d")!;
      const ts = Math.max(now, lastTs + 1);
      lastTs = ts;
      const { pose, hands } = models;
      // na pomalšom počítači (ľahký model) počítame dlane len na každom treťom snímku
      const handsEvery = variant === "lite" ? 3 : 2;

      try {
        // modelu pošleme priblížený výrez okolo rečníka (alebo celý záber, ak ho ešte nemáme)
        const crop = roi!.current();
        detectCtx.drawImage(video, crop.x, crop.y, crop.w, crop.h, 0, 0, detectCanvas.width, detectCanvas.height);

        let handLms: NormalizedLandmark[][] | null = null;
        if (hands && frame % handsEvery === 0) handLms = hands.detectForVideo(video, ts).landmarks;

        pose.detectForVideo(detectCanvas, ts, (result) => {
          lastResultAt = performance.now();
          const rawLm = result.landmarks[0] ?? null;
          const lm = rawLm ? smoother!.smooth(roi!.toFull(rawLm, crop), ts) : null;
          roi!.update(lm);
          let metrics: Metrics | null = null;
          let fb: FeedbackState;
          if (!lm && lastGood && ts - lastGood.at < LOST_GRACE_MS) {
            // krátky výpadok: držíme poslednú pózu, nič nenulujeme
            renderer.draw(ctx, lastGood.lm, lastGood.metrics, lastGood.fb.status, ts);
            callbacks.current.onFrame(lastGood.fb, lastGood.metrics, ts);
            return;
          }
          if (lm) {
            const W = canvas.width;
            const H = canvas.height;
            let handInfo: Hands | null = null;
            if (handLms) {
              const sw = Math.hypot(
                (lm[LM.leftShoulder].x - lm[LM.rightShoulder].x) * W,
                (lm[LM.leftShoulder].y - lm[LM.rightShoulder].y) * H,
              );
              handInfo = analyzeHands(
                handLms,
                W,
                H,
                { x: lm[LM.leftWrist].x * W, y: lm[LM.leftWrist].y * H },
                { x: lm[LM.rightWrist].x * W, y: lm[LM.rightWrist].y * H },
                sw,
              );
            }
            metrics = tracker.update(lm, result.worldLandmarks[0], handInfo, ts, W, H);
            fb = engine.update(metrics, ts);
            const mask = result.segmentationMasks?.[0];
            if (mask && frame % MASK_EVERY === 0) {
              renderer.setMask(mask.getAsFloat32Array(), mask.width, mask.height, fb.status, crop);
            }
            lastGood = { lm, metrics, fb, at: ts };
          } else {
            tracker.reset();
            smoother!.reset();
            renderer.clearMask();
            fb = engine.idle();
            lastGood = null;
          }
          renderer.draw(ctx, lm, metrics, fb.status, ts);
          callbacks.current.onFrame(fb, metrics, ts);
        });
      } catch (e) {
        reload(e, true);
        return;
      }

      // ak je počítač pomalý, prepneme na ľahší model pózy (raz, natrvalo pre túto reláciu)
      const took = performance.now() - now;
      procMs = perfFrames ? procMs + (took - procMs) * 0.05 : took;
      perfFrames++;
      if (autoDowngrade && variant === "full" && perfFrames > PERF_WARMUP_FRAMES && procMs > SLOW_FRAME_MS) {
        variant = "lite";
        reload(`slow frames (${Math.round(procMs)} ms)`, false);
      }
      updateHud(now);
    }

    // v skrytej karte prehliadač nespúšťa snímky; po návrate to nie je pád
    const onVisibility = () => {
      if (document.visibilityState === "visible") lastResultAt = performance.now();
    };
    document.addEventListener("visibilitychange", onVisibility);

    start();

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisibility);
      cancelAnimationFrame(raf);
      videoEl?.cancelVideoFrameCallback?.(vfc);
      if (recRef.current?.rec.state === "recording") recRef.current.rec.stop();
      recRef.current = null;
      stream?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      if (videoEl && source) videoEl.pause();
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") void audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
      // URL súboru ostáva platná: report z nej prehráva klipy chýb
      closeModels();
    };
  }, [source]);

  return (
    <div className="relative h-full w-full">
      {/* živé video ide priamo na obrazovku bez čakania na model, zrkadlovo */}
      <video
        ref={videoRef}
        className={`absolute inset-0 h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""}`}
        style={{ filter: `brightness(${VIDEO_DIM}) saturate(0.5)` }}
        playsInline
        muted
      />
      {/* priehľadná vrstva so siluetou, kostrou a power zónou */}
      <canvas ref={canvasRef} className={`absolute inset-0 h-full w-full object-contain ${mirrored ? "-scale-x-100" : ""}`} />
      <div
        ref={hudRef}
        className="pointer-events-none absolute right-3 top-3 rounded bg-black/60 px-2 py-1 font-mono text-[11px] text-white/70"
      />
    </div>
  );
}
