"use client";

import "@/styles/screens/coach.css";
import { useEffect, useRef, useState } from "react";
import CameraStage, { type TrackingQuality } from "@/components/coach/CameraStage";
import DrillProgressCard from "@/components/coach/DrillProgressCard";
import FeedbackBubble from "@/components/coach/FeedbackBubble";
import LivePanel from "@/components/coach/LivePanel";
import type { PrompterSetting } from "@/components/coach/SessionSetup";
import StageMap from "@/components/coach/StageMap";
import Teleprompter from "@/components/coach/Teleprompter";
import { COUNTDOWN_OPTIONS, fmtClock, useCoachSession, type CoachResult, type CountdownSec } from "@/components/coach/use-coach-session";
import { scriptsFor, type SessionMode } from "@/lib/coach/modes";
import { useLocale } from "@/components/i18n/locale-provider";
import type { MicHand } from "@/lib/coach/pose/metrics";
import { STATUS_COLOR } from "@/lib/coach/pose/renderer";

/*
  Živý tréner reči tela (port zo Stage Coach): kamera so siluetou, bublina s radou nad hlavou,
  power zóna, teleprompter a záznam chýb. Pripojenie komponentu = spustenie kamery a modelu.
*/

const MIC_KEY = "pitchit-coach-mic";
const QUALITY_KEY = "pitchit-coach-quality";
const MIC_HAND_KEY = "pitchit-coach-mic-hand";
const COUNTDOWN_KEY = "pitchit-coach-countdown";
/** odhad šírky bubliny, aby sme ju vedeli udržať v zábere */
const BUBBLE_MAX_W = 900;

export type Anchor = { x: number; y: number };

/** bublina nad hlavou, ale vždy celá v zábere (a pod telepromptrom) */
export function bubbleAnchor(head: Anchor | null, stage: HTMLElement | null, bubble: HTMLElement | null, topInset: number): Anchor | null {
  if (!head || !stage) return null;
  const w = stage.clientWidth;
  const half = Math.min(w * 0.92, BUBBLE_MAX_W) / 2;
  const h = bubble?.offsetHeight ?? 200;
  return {
    x: Math.min(Math.max(head.x, half + 8), w - half - 8),
    y: Math.max(head.y, topInset + h + 12),
  };
}

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // bez localStorage si voľbu len nezapamätáme
  }
}

/** Nastavenia trénera, zapamätané v prehliadači (len pohodlie, appka funguje aj bez nich). */
export function useCoachPrefs() {
  const locale = useLocale();
  const [micMode, setMicMode] = useState(false);
  const [quality, setQuality] = useState<TrackingQuality>("balanced");
  const [micHand, setMicHand] = useState<MicHand>("auto");
  const [prompter, setPrompter] = useState<PrompterSetting>({ scriptId: null, customText: "", wpm: 150 });
  const [countdown, setCountdown] = useState<CountdownSec>(5);

  useEffect(() => {
    const q = readPref(QUALITY_KEY);
    const h = readPref(MIC_HAND_KEY);
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage je dostupný až na klientovi */
    setMicMode(readPref(MIC_KEY) === "1");
    setQuality(q === "fast" || q === "precise" ? q : "balanced");
    setMicHand(h === "left" || h === "right" ? h : "auto");
    const c = Number(readPref(COUNTDOWN_KEY));
    setCountdown(COUNTDOWN_OPTIONS.find((o) => o === c) ?? 5);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const prompterText =
    prompter.scriptId === "custom"
      ? prompter.customText.trim() || null
      : (scriptsFor(locale).find((s) => s.id === prompter.scriptId)?.text ?? null);

  return {
    micMode,
    onMic: (on: boolean) => {
      setMicMode(on);
      writePref(MIC_KEY, on ? "1" : "0");
    },
    quality,
    onQuality: (q: TrackingQuality) => {
      setQuality(q);
      writePref(QUALITY_KEY, q);
    },
    micHand,
    onMicHand: (h: MicHand) => {
      setMicHand(h);
      writePref(MIC_HAND_KEY, h);
    },
    prompter,
    onPrompter: setPrompter,
    prompterText,
    countdown,
    onCountdown: (sec: CountdownSec) => {
      setCountdown(sec);
      writePref(COUNTDOWN_KEY, String(sec));
    },
  };
}

export type CoachPrefs = ReturnType<typeof useCoachPrefs>;

export type { CoachResult };

export function CoachLive({
  mode,
  label,
  prefs,
  ruleFilter,
  finishLabel,
  onLive,
  onFinish,
  onError,
}: {
  mode: SessionMode;
  /** štítok v hlavičke (napr. „Pitch · 60 s“) */
  label: string;
  prefs: CoachPrefs;
  ruleFilter: (id: string) => boolean;
  finishLabel?: string;
  /** volá sa, keď po odpočte začne nahrávanie */
  onLive?: () => void;
  onFinish: (result: CoachResult) => void;
  onError: (message: string) => void;
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const { prompter, onPrompter, prompterText, micMode, micHand, quality } = prefs;
  const en = useLocale() === "en";

  const stageRef = useRef<HTMLElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const prompterRef = useRef<HTMLDivElement>(null);

  const { phase, fb, metrics, count, waitingForPerson, elapsedMs, durationMs, drill, drillProgress, stageApi, onFrame, onReady, onStageError, finish } =
    useCoachSession({
      mode,
      countdown: prefs.countdown,
      onLive,
      onFinish,
      onError,
      onUi: (m) => {
        const head = m ? (stageApi.current?.headAnchor(m) ?? null) : null;
        const p = prompterRef.current;
        const inset = p ? p.offsetTop + p.offsetHeight : 0;
        setAnchor(bubbleAnchor(head, stageRef.current, bubbleRef.current, inset));
      },
    });

  const color = STATUS_COLOR[fb.status];
  const remaining = durationMs !== null ? durationMs - elapsedMs : null;
  const clockColor =
    remaining === null
      ? "text-paper"
      : remaining <= 10_000
        ? "animate-pulse text-danger"
        : remaining <= Math.max(30_000, durationMs! * 0.1)
          ? "text-marker"
          : "text-paper";

  return (
    <main id="obsah" className="flex h-dvh flex-col bg-ink text-paper">
      <header className="relative flex items-center justify-between gap-4 border-b border-line px-6 py-3">
        <div className="flex min-w-0 items-center gap-4">
          <span className="h text-lg">
            Pitch<span className="text-accent">It</span>
          </span>
          <span className="hidden truncate rounded-full bg-panel px-3 py-1 text-xs font-bold uppercase tracking-widest text-mute sm:inline">
            {label}
          </span>
        </div>
        <div className="flex items-center gap-5">
          {phase === "live" && (
            <span className={`flex items-center gap-2 font-mono text-2xl font-bold ${clockColor}`} aria-live="off">
              <span className="h-3 w-3 animate-pulse rounded-full bg-danger" />
              {remaining !== null ? fmtClock(remaining) : fmtClock(elapsedMs)}
            </span>
          )}
          <button
            type="button"
            onClick={() => void finish()}
            disabled={phase !== "live"}
            className="rounded-full bg-signal px-5 py-2 font-bold text-on-signal transition hover:bg-signal-hover disabled:opacity-30"
          >
            {finishLabel ?? (en ? "Finish" : "Skončiť")}
          </button>
        </div>
        {phase === "live" && durationMs !== null && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-panel">
            <div
              className="h-full bg-gradient-to-r from-violet to-signal transition-[width] duration-300 ease-linear"
              style={{ width: `${Math.min(100, (elapsedMs / durationMs) * 100)}%` }}
            />
          </div>
        )}
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section ref={stageRef} className="stage-dark relative min-h-0 flex-1 overflow-hidden">
          {/* „reflektor“: okraj záberu svieti farbou stavu */}
          <div
            className="pointer-events-none absolute inset-0 z-10 transition-[box-shadow] duration-500"
            style={{ boxShadow: `inset 0 0 120px 10px ${color}55` }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <CameraStage
              ref={stageApi}
              micMode={micMode}
              micHand={micHand}
              quality={quality}
              ruleFilter={ruleFilter}
              onFrame={onFrame}
              onReady={onReady}
              onError={onStageError}
            />
          </div>

          {prompterText && (
            <div ref={prompterRef} className="absolute left-1/2 top-3 z-20 h-[30%] max-h-64 min-h-40 w-[min(92%,1000px)] -translate-x-1/2">
              <Teleprompter
                text={prompterText}
                wpm={prompter.wpm}
                onWpmChange={(wpm) => onPrompter({ ...prompter, wpm })}
                running={phase === "live"}
              />
            </div>
          )}

          {phase === "loading" && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80">
              <p className="animate-pulse text-xl text-white/70">{en ? "Loading camera and model…" : "Načítavam kameru a model…"}</p>
            </div>
          )}
          {phase === "countdown" && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-black/50 px-6 text-center text-white">
              <p className="text-sm uppercase tracking-[0.4em] text-white/70">{en ? "Starting in" : "Začíname o"}</p>
              <p className={waitingForPerson ? "mt-2 text-2xl font-bold text-white" : "mt-2 text-white/70"}>
                {waitingForPerson
                  ? en
                    ? "Step into the frame, the countdown continues once the camera sees you"
                    : "Postav sa do záberu, odpočet pokračuje, keď ťa kamera uvidí"
                  : en
                    ? "Look straight into the camera, we are calibrating your head position"
                    : "Pozeraj sa rovno do kamery, nastavujeme polohu hlavy"}
              </p>
              <p
                key={count}
                className={`animate-pop h text-[10rem] leading-none transition-opacity ${waitingForPerson ? "opacity-30" : ""}`}
                style={{
                  background: "linear-gradient(135deg,#D2FF6B,var(--color-violet))",
                  WebkitBackgroundClip: "text",
                  backgroundClip: "text",
                  color: "transparent",
                }}
              >
                {count || (en ? "Go" : "Štart")}
              </p>
              {drill && <p className="max-w-xl text-xl font-semibold">{drill.goal}</p>}
            </div>
          )}

          {phase === "live" && (
            <div className={`absolute inset-x-4 bottom-4 z-20 flex md:bottom-6 ${drill ? "justify-end" : "justify-center"}`}>
              <StageMap m={metrics} />
            </div>
          )}
          {phase === "live" && drill && drillProgress && (
            <div className="absolute bottom-4 left-4 z-20 md:bottom-6">
              <DrillProgressCard drill={drill} progress={drillProgress} />
            </div>
          )}

          {/* veľká rada nad hlavou rečníka, čitateľná z diaľky */}
          <div
            ref={bubbleRef}
            className="absolute z-30 w-[92%] max-w-[900px] -translate-x-1/2 -translate-y-full transition-[left,top] duration-100 ease-out"
            style={anchor ? { left: anchor.x, top: anchor.y } : { left: "50%", top: "65%" }}
          >
            <FeedbackBubble fb={fb} />
          </div>
        </section>

        <aside className="w-full shrink-0 overflow-y-auto border-t border-line p-6 lg:w-80 lg:border-l lg:border-t-0">
          <LivePanel fb={fb} m={metrics} />
        </aside>
      </div>
    </main>
  );
}
