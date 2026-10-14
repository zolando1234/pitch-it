"use client";

import "@/styles/screens/coach.css";
import { useEffect, useState } from "react";
import type { TrackingQuality } from "@/components/coach/CameraStage";
import { COUNTDOWN_OPTIONS, type CoachResult, type CountdownSec } from "@/components/coach/use-coach-session";
import type { MicHand } from "@/lib/coach/pose/metrics";

/*
  Nastavenia živého trénera reči tela a umiestnenie bubliny s radou nad hlavou.
*/

const MIC_KEY = "pitchit-coach-mic";
const QUALITY_KEY = "pitchit-coach-quality";
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
  const [micMode, setMicMode] = useState(false);
  const [quality, setQuality] = useState<TrackingQuality>("balanced");
  const [countdown, setCountdown] = useState<CountdownSec>(5);

  useEffect(() => {
    const q = readPref(QUALITY_KEY);
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage je dostupný až na klientovi */
    setMicMode(readPref(MIC_KEY) === "1");
    setQuality(q === "fast" || q === "precise" ? q : "balanced");
    const c = Number(readPref(COUNTDOWN_KEY));
    setCountdown(COUNTDOWN_OPTIONS.find((o) => o === c) ?? 5);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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
    /** ruka s mikrofónom sa rozpozná automaticky */
    micHand: "auto" as MicHand,
    countdown,
    onCountdown: (sec: CountdownSec) => {
      setCountdown(sec);
      writePref(COUNTDOWN_KEY, String(sec));
    },
  };
}

export type CoachPrefs = ReturnType<typeof useCoachPrefs>;

export type { CoachResult };
