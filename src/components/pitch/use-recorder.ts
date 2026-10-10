"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { VisionSample } from "@/lib/analytics/vision/types";
import type { StoredCoach } from "@/lib/coach/stored";
import type { PitchAttemptRow } from "@/lib/db/types";
import { keepLocalAttempt } from "@/lib/pitch/local-attempt";
import type { PitchOutline } from "@/lib/pitch/outline";

/*
  Nahrávanie pitchu v prehliadači: mikrofón (a voliteľne kamera), úroveň hlasu pre vlnu,
  MediaRecorder na audio a odoslanie na /api/pitch. Nahrávka sa nikde neukladá.
*/

export type RecorderSetup = {
  audience: "investor" | "jury" | "customer" | "team";
  targetSeconds: 30 | 60 | 180;
  focus: "tempo" | "fillery" | "obsah";
};

export type MediaState = "idle" | "requesting" | "ready" | "denied" | "unsupported";

function pickMimeType(): string | undefined {
  if (typeof MediaRecorder === "undefined") return undefined;
  return ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"].find((type) => MediaRecorder.isTypeSupported(type));
}

export function usePitchRecorder({ video = false }: { video?: boolean } = {}) {
  const [media, setMedia] = useState<MediaState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const pausedAtRef = useRef(0);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  /** zvuk z mobilu: jeho stopy nezastavujeme, spojenie riadi usePhoneMic */
  const externalRef = useRef(false);

  /** Úroveň hlasu pre vlnu z daného zvuku. */
  const watch = useCallback((next: MediaStream) => {
    cancelAnimationFrame(rafRef.current);
    if (audioCtxRef.current && audioCtxRef.current.state !== "closed") void audioCtxRef.current.close().catch(() => {});
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(next).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let last = 0;
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - last < 60) return;
      last = now;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const open = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMedia("unsupported");
      return;
    }
    setMedia("requesting");
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: video ? { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } : false,
      });
      streamRef.current = next;
      externalRef.current = false;
      setStream(next);
      setMedia("ready");
      watch(next);
    } catch {
      setMedia("denied");
    }
  }, [video, watch]);

  /** Nahrávanie z iného zdroja zvuku (mobil ako mikrofón) namiesto mikrofónu počítača. */
  const attach = useCallback(
    (next: MediaStream) => {
      if (streamRef.current === next) return;
      if (!externalRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = next;
      externalRef.current = true;
      setStream(next);
      setMedia("ready");
      watch(next);
    },
    [watch],
  );

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (!externalRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
      if (audioCtxRef.current && audioCtxRef.current.state !== "closed") void audioCtxRef.current.close().catch(() => {});
    };
  }, []);

  const start = useCallback(() => {
    const current = streamRef.current;
    if (!current) return false;
    const audioOnly = new MediaStream(current.getAudioTracks());
    const mimeType = pickMimeType();
    chunksRef.current = [];
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(audioOnly, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.start(1000);
    } catch {
      // mikrofón medzitým vypadol; volajúci pokračuje bez zvuku
      return false;
    }
    recorderRef.current = recorder;
    startedAtRef.current = performance.now();
    pausedAtRef.current = 0;
    return true;
  }, []);

  /** Pauza: čas pauzy sa nezapočíta do dĺžky nahrávky. */
  const pause = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "recording") return;
    recorder.pause();
    pausedAtRef.current = performance.now();
  }, []);

  const resume = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder?.state !== "paused") return;
    recorder.resume();
    startedAtRef.current += performance.now() - pausedAtRef.current;
    pausedAtRef.current = 0;
  }, []);

  /** Zastaví nahrávanie a vráti audio s dĺžkou. */
  const stop = useCallback(
    () =>
      new Promise<{ audio: Blob; durationMs: number } | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") return resolve(null);
        const durationMs = Math.round((pausedAtRef.current || performance.now()) - startedAtRef.current);
        recorder.onstop = () => resolve({ audio: new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }), durationMs });
        recorder.stop();
      }),
    [],
  );

  const release = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (!externalRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  return { media, stream, level, open, attach, start, pause, resume, stop, release };
}

/** Odošle nahrávku na analýzu. Vráti id pokusu alebo chybovú správu. */
export async function uploadPitch(
  recording: { audio: Blob; durationMs: number },
  setup: RecorderSetup,
  vision: VisionSample[] | null,
  coach: StoredCoach | null = null,
  outline: PitchOutline | null = null,
): Promise<{ ok: true; attemptId: string } | { ok: false; message: string; retryable: boolean }> {
  const form = new FormData();
  form.set("audio", recording.audio, "pitch");
  form.set("durationMs", String(Math.max(1000, recording.durationMs)));
  form.set("audience", setup.audience);
  form.set("targetSeconds", String(setup.targetSeconds));
  form.set("focus", setup.focus);
  if (vision?.length) form.set("vision", JSON.stringify(vision));
  if (coach) form.set("coach", JSON.stringify(coach));
  if (outline) form.set("outline", JSON.stringify(outline));
  try {
    const response = await fetch("/api/pitch", { method: "POST", body: form });
    const data = (await response.json().catch(() => null)) as { attemptId?: string; attempt?: PitchAttemptRow; error?: { message?: string } } | null;
    if (response.ok && data?.attemptId) {
      if (data.attempt) keepLocalAttempt(data.attempt);
      return { ok: true, attemptId: data.attemptId };
    }
    return { ok: false, message: data?.error?.message ?? "Analýza zlyhala. Skús to znova.", retryable: response.status >= 500 || !data };
  } catch {
    return { ok: false, message: "Nepodarilo sa spojiť so serverom. Skontroluj pripojenie a skús to znova.", retryable: true };
  }
}

/** Ako uploadPitch, ale výpadok siete alebo servera skúsi ešte raz. */
export async function uploadPitchWithRetry(...args: Parameters<typeof uploadPitch>) {
  const first = await uploadPitch(...args);
  if (first.ok || !first.retryable) return first;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return uploadPitch(...args);
}
