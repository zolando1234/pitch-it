"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Recording, StageApi } from "@/components/coach/CameraStage";
import { DrillTracker, type DrillProgress, type SessionMode } from "@/lib/coach/modes";
import type { FeedbackState } from "@/lib/coach/pose/feedback";
import type { Metrics } from "@/lib/coach/pose/metrics";
import { SessionRecorder, type SessionSummary } from "@/lib/coach/pose/session";

/*
  Priebeh živého tréningu bez vzhľadu: načítanie kamery, odpočet, nahrávanie, pauza,
  časomiera a záverečný súhrn. Používa ho CoachLive (cvičenia) aj PitchStudio (pitch).
*/

const UI_INTERVAL_MS = 100;

export type CoachResult = {
  summary: SessionSummary;
  drill: DrillProgress | null;
  /** nahrávka kamery pre klipy chýb (len v pamäti prehliadača) */
  recording: Recording | null;
};

/** Dĺžka odpočtu pred nahrávaním v sekundách. */
export const COUNTDOWN_OPTIONS = [5, 10, 20, 30] as const;
export type CountdownSec = (typeof COUNTDOWN_OPTIONS)[number];

/** Človek je v zábere, keď ho kamera videla za posledných toľko ms. */
const PRESENCE_MS = 600;

/** armed = nahraté video je pripravené, čaká sa na kliknutie „Spustiť analýzu“ */
export type CoachPhase = "loading" | "armed" | "countdown" | "live" | "paused";

/** Stav pred prvým snímkom (ruleId "loading" odlišuje ho od skutočných rád). */
export const INITIAL_FB: FeedbackState = {
  status: "idle",
  title: "Načítavam…",
  tip: "Zapínam kameru a sledovanie tela.",
  ruleId: "loading",
  activeIds: [],
  score: 70,
  highlight: null,
};

const INITIAL_FB_EN: FeedbackState = { ...INITIAL_FB, title: "Loading…", tip: "Starting the camera and body tracking." };

export function useCoachSession({
  mode,
  countdown = 5,
  manualStart = false,
  onLive,
  onPause,
  onResume,
  onFinish,
  onError,
  onUi,
}: {
  mode: SessionMode;
  countdown?: CountdownSec;
  /** bez odpočtu: nahrávanie spustí až begin() (nahraté video) */
  manualStart?: boolean;
  /** volá sa, keď po odpočte začne nahrávanie */
  onLive?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onFinish: (result: CoachResult) => void;
  onError: (message: string) => void;
  /** volá sa spolu s obnovou UI (najviac 10× za sekundu) */
  onUi?: (m: Metrics | null) => void;
}) {
  const [phase, setPhase] = useState<CoachPhase>("loading");
  const locale = useLocale();
  const [fb, setFb] = useState<FeedbackState>(locale === "en" ? INITIAL_FB_EN : INITIAL_FB);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [count, setCount] = useState<number>(countdown);
  /** odpočet stojí, kým sa človek nepostaví do záberu */
  const [waitingForPerson, setWaitingForPerson] = useState(false);
  const lastPersonAt = useRef(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [drillProgress, setDrillProgress] = useState<DrillProgress | null>(null);

  const stageApi = useRef<StageApi>(null);
  const recorder = useRef<SessionRecorder | null>(null);
  const drillTracker = useRef<DrillTracker | null>(null);
  const lastUi = useRef(0);
  const lastT = useRef(0);
  const liveStartedAt = useRef(0);
  const pausedAt = useRef(0);
  const finishing = useRef(false);
  const phaseRef = useRef(phase);
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  const drill = mode.kind === "drill" ? mode : null;
  const durationMs = mode.durationMs;

  const callbacks = useRef({ onLive, onPause, onResume, onFinish, onError, onUi });
  useEffect(() => {
    callbacks.current = { onLive, onPause, onResume, onFinish, onError, onUi };
  });

  const onFrame = useCallback((f: FeedbackState, m: Metrics | null, t: number) => {
    const dt = lastT.current ? Math.min(t - lastT.current, 250) : 0;
    lastT.current = t;
    if (m) lastPersonAt.current = performance.now();
    if (phaseRef.current === "live") {
      recorder.current?.record(t, f, m, () => stageApi.current?.snapshot() ?? null);
      drillTracker.current?.update(m, f, dt);
    }
    if (t - lastUi.current > UI_INTERVAL_MS) {
      lastUi.current = t;
      setFb(f);
      setMetrics(m);
      if (drillTracker.current) setDrillProgress(drillTracker.current.progress());
      callbacks.current.onUi?.(m);
    }
  }, []);

  const onReady = useCallback(() => {
    if (manualStart) return setPhase("armed");
    setCount(countdown);
    setPhase("countdown");
  }, [countdown, manualStart]);

  /** Začiatok nahrávania a hodnotenia (po odpočte alebo hneď pri nahratom videu). */
  const startLive = useCallback(
    (now: number) => {
      recorder.current = new SessionRecorder();
      recorder.current.begin(lastT.current || now);
      drillTracker.current = drill ? new DrillTracker(drill) : null;
      setDrillProgress(drillTracker.current?.progress() ?? null);
      liveStartedAt.current = now;
      stageApi.current?.startRecording();
      setElapsedMs(0);
      phaseRef.current = "live";
      setPhase("live");
      callbacks.current.onLive?.();
    },
    [drill],
  );

  /** Nahraté video: spustí hodnotenie po kliknutí (video už hrá). */
  const begin = useCallback(() => {
    if (phaseRef.current !== "armed") return;
    startLive(performance.now());
  }, [startLive]);

  const onStageError = useCallback((msg: string) => callbacks.current.onError(msg), []);

  const finish = useCallback(async () => {
    if (!recorder.current || finishing.current) return;
    finishing.current = true;
    if (phaseRef.current === "paused") recorder.current.resume(performance.now());
    const summary = recorder.current.summary();
    const drillResult = drillTracker.current?.progress() ?? null;
    const recording = (await stageApi.current?.stopRecording()) ?? null;
    callbacks.current.onFinish({ summary, drill: drillResult, recording });
  }, []);

  const pause = useCallback(() => {
    if (phaseRef.current !== "live") return;
    pausedAt.current = performance.now();
    recorder.current?.pause(lastT.current || pausedAt.current);
    stageApi.current?.pauseRecording();
    phaseRef.current = "paused";
    setPhase("paused");
    callbacks.current.onPause?.();
  }, []);

  const resume = useCallback(() => {
    if (phaseRef.current !== "paused") return;
    const now = performance.now();
    liveStartedAt.current += now - pausedAt.current;
    recorder.current?.resume(lastT.current || now);
    stageApi.current?.resumeRecording();
    phaseRef.current = "live";
    setPhase("live");
    callbacks.current.onResume?.();
  }, []);

  // odpočet beží, len keď je človek v zábere; potom štart nahrávania a hodnotenia
  useEffect(() => {
    if (phase !== "countdown") return;
    let left = countdown;
    // počiatočnú hodnotu nastavil onReady
    let next = performance.now() + 1000;
    const id = setInterval(() => {
      const now = performance.now();
      if (now - lastPersonAt.current > PRESENCE_MS) {
        // kým človek nie je na mieste, sekunda sa nezapočíta
        next = now + 1000;
        setWaitingForPerson(true);
        return;
      }
      setWaitingForPerson(false);
      if (now < next) return;
      left -= 1;
      next = now + (left > 0 ? 1000 : 300);
      if (left >= 0) {
        setCount(left);
        return;
      }
      clearInterval(id);
      startLive(now);
    }, 100);
    return () => clearInterval(id);
  }, [phase, countdown, startLive]);

  // časomiera; pri režime s limitom sa nahrávanie na konci samo ukončí
  useEffect(() => {
    if (phase !== "live") return;
    const id = setInterval(() => {
      const el = performance.now() - liveStartedAt.current;
      setElapsedMs(el);
      if (durationMs !== null && el >= durationMs) void finish();
    }, 250);
    return () => clearInterval(id);
  }, [phase, durationMs, finish]);

  return {
    phase,
    fb,
    metrics,
    count,
    waitingForPerson,
    elapsedMs,
    durationMs,
    drill,
    drillProgress,
    stageApi,
    onFrame,
    onReady,
    onStageError,
    finish,
    pause,
    resume,
    begin,
  };
}

export const fmtClock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};
