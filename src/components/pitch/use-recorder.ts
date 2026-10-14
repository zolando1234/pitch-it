"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StoredCoach } from "@/lib/coach/stored";
import type { PitchAttemptRow } from "@/lib/db/types";
import { keepLocalAttempt } from "@/lib/pitch/local-attempt";
import type { PitchLanguage } from "@/lib/pitch/language";
import type { PitchOutline } from "@/lib/pitch/outline";
import { SegmentUploader, sharedContext, startCapture, type SpeechCapture } from "@/components/pitch/speech-capture";

/*
  Nahrávanie prejavu v prehliadači: mikrofón (alebo zvuk z mobilu či videa), úroveň hlasu
  pre vlnu a priebežné posielanie ~30-sekundových úsekov na prepis. Na konci sa pošle už len
  súhrn a server spojí prepísané úseky. Nahrávka sa nikde neukladá.
*/

export type RecorderSetup = {
  audience: "investor" | "jury" | "customer" | "team";
  /** cieľová dĺžka v sekundách */
  targetSeconds: number;
  focus: "tempo" | "fillery" | "obsah";
  /** jazyk prejavu; bez neho slovenčina */
  language?: PitchLanguage;
  /** jazyk rozhrania (hlášky a spätná väzba od AI) */
  uiLocale?: "sk" | "en";
  /** typ tréningu */
  mode?: "public" | "client" | "meeting";
};

/** Hotová nahrávka: úseky sú už odoslané pod `draftId`. */
export type Recording = { draftId: string; segments: number; durationMs: number };

/** missing = žiadny mikrofón nie je pripojený, lost = mikrofón sa odpojil */
export type MediaState = "idle" | "requesting" | "ready" | "denied" | "unsupported" | "missing" | "lost";

/** Má stream živú zvukovú stopu (mikrofón je pripojený a beží)? */
export const hasLiveAudio = (stream: MediaStream | null) => !!stream?.getAudioTracks().some((t) => t.readyState === "live" && t.enabled);

export function usePitchRecorder({ video = false }: { video?: boolean } = {}) {
  const [media, setMedia] = useState<MediaState>("idle");
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [level, setLevel] = useState(0);
  const captureRef = useRef<SpeechCapture | null>(null);
  const uploaderRef = useRef<SegmentUploader | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const meterRef = useRef<AudioNode | null>(null);
  /** zvuk z mobilu: jeho stopy nezastavujeme, spojenie riadi usePhoneMic */
  const externalRef = useRef(false);

  /** Odpojenie mikrofónu (vytiahnutý kábel, vypnutý mobil) sa hneď prejaví v stave. */
  const watchTracks = useCallback((next: MediaStream) => {
    for (const track of next.getAudioTracks()) {
      track.addEventListener("ended", () => {
        if (streamRef.current === next) setMedia("lost");
      });
    }
  }, []);

  /** Úroveň hlasu pre vlnu z daného zvuku. */
  const watch = useCallback((next: MediaStream) => {
    cancelAnimationFrame(rafRef.current);
    meterRef.current?.disconnect();
    // spoločný zvukový kanál, ktorý odomkne kliknutie (vlastný by Safari nechal uspaný)
    const ctx = sharedContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    const source = ctx.createMediaStreamSource(next);
    source.connect(analyser);
    meterRef.current = source;
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
      if (!hasLiveAudio(next)) {
        next.getTracks().forEach((track) => track.stop());
        setMedia("missing");
        return;
      }
      streamRef.current = next;
      externalRef.current = false;
      setStream(next);
      setMedia("ready");
      watch(next);
      watchTracks(next);
    } catch (error) {
      // NotFoundError = v počítači nie je žiadny mikrofón; NotAllowedError = prístup zamietnutý
      const name = (error as { name?: string })?.name;
      setMedia(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "missing");
    }
  }, [video, watch, watchTracks]);

  /** Nahrávanie z iného zdroja zvuku (mobil ako mikrofón) namiesto mikrofónu počítača. */
  const attach = useCallback(
    (next: MediaStream) => {
      if (streamRef.current === next) return;
      if (!externalRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = next;
      externalRef.current = true;
      setStream(next);
      setMedia(hasLiveAudio(next) ? "ready" : "lost");
      watch(next);
      watchTracks(next);
    },
    [watch, watchTracks],
  );

  // pripojený alebo odpojený mikrofón: po pripojení ho hneď zapneme, po odpojení stav „lost“
  useEffect(() => {
    const devices = navigator.mediaDevices;
    if (!devices?.addEventListener) return;
    const onChange = () => {
      if (externalRef.current) return;
      if (!hasLiveAudio(streamRef.current)) void open();
    };
    devices.addEventListener("devicechange", onChange);
    return () => devices.removeEventListener("devicechange", onChange);
  }, [open]);

  useEffect(() => {
    return () => {
      cancelAnimationFrame(rafRef.current);
      if (!externalRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
      meterRef.current?.disconnect();
    };
  }, []);

  /** Začne nahrávať; úseky idú hneď na prepis. Vráti false, ak zvuk nie je k dispozícii. */
  const start = useCallback(async (language: PitchLanguage, options: { diarize?: boolean } = {}) => {
    const current = streamRef.current;
    if (!current || !hasLiveAudio(current)) return false;
    const uploader = new SegmentUploader(crypto.randomUUID(), language, null, options.diarize ?? false);
    try {
      captureRef.current = await startCapture(current, (segment) => uploader.add(segment));
    } catch {
      // mikrofón medzitým vypadol; volajúci pokračuje bez zvuku
      return false;
    }
    uploaderRef.current = uploader;
    return true;
  }, []);

  /** Pauza: čas pauzy sa do nahrávky nezapočíta. */
  const pause = useCallback(() => captureRef.current?.pause(), []);
  const resume = useCallback(() => captureRef.current?.resume(), []);

  /** Zastaví nahrávanie a počká, kým sa odošlú všetky úseky. */
  const stop = useCallback(async (): Promise<(Recording & { complete: boolean }) | null> => {
    const capture = captureRef.current;
    const uploader = uploaderRef.current;
    captureRef.current = null;
    uploaderRef.current = null;
    if (!capture || !uploader) return null;
    const durationMs = await capture.stop();
    const complete = await uploader.finish();
    return { draftId: uploader.draftId, segments: uploader.count, durationMs, complete };
  }, []);

  /** Zahodí rozbehnuté nahrávanie (bez čakania na odoslanie). */
  const discard = useCallback(() => {
    void captureRef.current?.stop();
    captureRef.current = null;
    uploaderRef.current = null;
  }, []);

  const release = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    if (!externalRef.current) streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  /** Priebežný prepis: koncept a koľko úsekov už odišlo (otázky klienta počas výkladu). */
  const draft = useCallback(() => (uploaderRef.current ? { draftId: uploaderRef.current.draftId, segments: uploaderRef.current.count } : null), []);

  /** Je mikrofón práve pripojený (kontrola tesne pred štartom). */
  const micLive = useCallback(() => hasLiveAudio(streamRef.current), []);

  return { media, stream, level, open, attach, start, pause, resume, stop, discard, release, micLive, draft };
}

/** Výsledok odoslania na analýzu. */
export type UploadResult = { ok: true; attemptId: string } | { ok: false; message: string; retryable: boolean };

/** Dokončí analýzu: server spojí prepísané úseky a vyhodnotí prejav. */
export async function uploadPitch(
  recording: Recording,
  setup: RecorderSetup,
  coach: StoredCoach | null = null,
  outline: PitchOutline | null = null,
): Promise<UploadResult> {
  const form = new FormData();
  form.set("draftId", recording.draftId);
  form.set("segments", String(recording.segments));
  form.set("durationMs", String(Math.max(1000, recording.durationMs)));
  form.set("audience", setup.audience);
  form.set("targetSeconds", String(setup.targetSeconds));
  form.set("focus", setup.focus);
  form.set("language", setup.language ?? "sk");
  if (setup.uiLocale) form.set("uiLocale", setup.uiLocale);
  if (setup.mode) form.set("mode", setup.mode);
  if (coach) form.set("coach", JSON.stringify(coach));
  if (outline) form.set("outline", JSON.stringify(outline));
  try {
    const response = await fetch("/api/pitch", { method: "POST", body: form });
    const data = (await response.json().catch(() => null)) as { attemptId?: string; attempt?: PitchAttemptRow; error?: { message?: string } } | null;
    if (response.ok && data?.attemptId) {
      if (data.attempt) keepLocalAttempt(data.attempt);
      return { ok: true, attemptId: data.attemptId };
    }
    const fallback = setup.uiLocale === "en" ? "The analysis failed. Try again." : "Analýza zlyhala. Skús to znova.";
    return { ok: false, message: data?.error?.message ?? fallback, retryable: response.status >= 500 || response.status === 409 || !data };
  } catch {
    const message =
      setup.uiLocale === "en"
        ? "Could not connect to the server. Check your connection and try again."
        : "Nepodarilo sa spojiť so serverom. Skontroluj pripojenie a skús to znova.";
    return { ok: false, message, retryable: true };
  }
}

/** Ako uploadPitch, ale výpadok siete alebo servera skúsi ešte raz. */
export async function uploadPitchWithRetry(...args: Parameters<typeof uploadPitch>) {
  const first = await uploadPitch(...args);
  if (first.ok || !first.retryable) return first;
  await new Promise((resolve) => setTimeout(resolve, 1500));
  return uploadPitch(...args);
}
