"use client";

import "@/styles/screens/record.css";
import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { useClientQuestions, type MeetingSetup } from "@/components/pitch/client-questions";
import { PI_BACKGROUND } from "@/components/pitch/pi-topbar";
import { useLiveTranscript } from "@/components/pitch/use-live-transcript";
import { SilencePrompt, useSilenceGuard } from "@/components/pitch/use-silence-guard";
import { Wordmark } from "@/components/wordmark";
import { LANGUAGE_INFO, type PitchLanguage } from "@/lib/pitch/language";
import type { PitchOutline } from "@/lib/pitch/outline";

/*
  Hlasové štúdio (stretnutie s klientom): bez kamery a sledovania tela. Časomiera, ukazovateľ
  hlasu, živé titulky a body osnovy; pri tréningu AI klient prerušuje otázkami (useClientQuestions),
  pri skutočnom stretnutí sa len nahráva rozhovor.
  Pauza stopne aj časomieru, na konci cieľovej dĺžky sa stretnutie ukončí samo.
*/

const TX = {
  sk: {
    recording: "Nahrávam",
    paused: "Pauza",
    pause: "Pauza",
    resume: "Pokračovať",
    finish: "Ukončiť stretnutie",
    back: "Späť",
    outline: "Tvoja osnova",
    topic: "Téma",
    speak: "Hovor, ako keby oproti sedel klient…",
    noCaptions: "Živé titulky tento prehliadač nepodporuje. Nahrávanie aj prepis bežia normálne.",
    voiceOnly: "Len hlas, kamera sa nepoužíva",
  },
  en: {
    recording: "Recording",
    paused: "Paused",
    pause: "Pause",
    resume: "Resume",
    finish: "End meeting",
    back: "Back",
    outline: "Your outline",
    topic: "Topic",
    speak: "Talk as if the client sat opposite you…",
    noCaptions: "Live captions aren't supported in this browser. Recording and transcription work normally.",
    voiceOnly: "Voice only, the camera isn't used",
  },
};

const fmt = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

export function VoiceStudio({
  title,
  durationMs,
  language,
  level,
  outline,
  meeting,
  onPause,
  onResume,
  onFinish,
  onBack,
}: {
  title: string;
  durationMs: number;
  language: PitchLanguage;
  /** hlasitosť mikrofónu 0–1 */
  level: number;
  outline: PitchOutline | null;
  /** otázky AI klienta; null = skutočné stretnutie (bez otázok) */
  meeting: MeetingSetup | null;
  onPause: () => void;
  onResume: () => void;
  /** koniec stretnutia; dĺžka výkladu bez páuz */
  onFinish: (elapsedMs: number) => void;
  onBack: () => void;
}) {
  const tx = TX[useLocale()];
  const [live, setLive] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef(0);
  // začiatok stretnutia = pripojenie štúdia (nahrávanie sa spustilo kliknutím na štart)
  useEffect(() => {
    startedAt.current = performance.now();
  }, []);
  const pausedAt = useRef(0);
  const finished = useRef(false);
  const transcript = useLiveTranscript(live, LANGUAGE_INFO[language].bcp47);

  const pause = () => {
    if (!live) return;
    pausedAt.current = performance.now();
    setLive(false);
    onPause();
  };
  const resume = () => {
    if (live) return;
    startedAt.current += performance.now() - pausedAt.current;
    setLive(true);
    onResume();
  };

  const client = useClientQuestions({ meeting, live, elapsedMs: elapsed, durationMs, pause, resume });

  /** `trimMs`: ticho na konci, ktoré sa do dĺžky výkladu nepočíta (automatické ukončenie) */
  const finish = async (trimMs = 0) => {
    if (finished.current) return;
    finished.current = true;
    if (client.active) await client.finishAnswer();
    const length = live ? performance.now() - startedAt.current : pausedAt.current - startedAt.current;
    onFinish(Math.max(0, Math.round(length - trimMs)));
  };
  // dlhé ticho: opýtame sa, či je človek ešte tam; bez odpovede sa nahrávanie ukončí
  const silence = useSilenceGuard({
    active: live && !client.active,
    level,
    onTimeout: ({ idleMs, everSpoke }) => {
      if (!everSpoke) onBack(); // nikto nehovoril: nahrávku zahodíme
      else void finish(idleMs);
    },
  });
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });

  // časomiera; po cieľovej dĺžke sa stretnutie ukončí samo
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => {
      const ms = performance.now() - startedAt.current;
      setElapsed(ms);
      if (ms >= durationMs) void finishRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [live, durationMs]);

  const caption = `${transcript.final} ${transcript.interim}`.trim().split(/\s+/).filter(Boolean).slice(-28).join(" ");

  return (
    <div className="pi-rec min-h-dvh text-paper" style={{ background: PI_BACKGROUND }}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-3.5 md:px-7">
        <div className="flex min-w-0 items-center gap-5">
          <Wordmark href="/app" />
          <div className="min-w-0">
            <p className="h truncate text-[15px]">{title}</p>
            <p className="truncate text-xs text-mute">{tx.voiceOnly}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={onBack} style={{ minHeight: "44px", padding: "10px 18px", fontSize: "14px" }}>
            {tx.back}
          </button>
          <button type="button" className="btn btn-p" onClick={() => void finish()} style={{ minHeight: "44px", padding: "10px 18px", fontSize: "14px" }}>
            {tx.finish}
          </button>
        </div>
      </header>

      <main id="obsah" className="mx-auto grid w-full max-w-6xl gap-5 p-4 md:p-6 lg:grid-cols-[1fr_20rem]">
        <section className="card relative flex min-h-[420px] flex-col items-center justify-center gap-7 overflow-hidden" style={{ padding: "32px" }}>
          <p className="flex items-center gap-3 text-sm font-bold uppercase tracking-widest">
            <span className={`h-2.5 w-2.5 rounded-full ${live ? "animate-pulse bg-danger" : "bg-faint"}`} aria-hidden="true" />
            {live ? tx.recording : tx.paused}
          </p>
          <p className="h text-center font-mono text-5xl tabular-nums md:text-7xl">
            {fmt(elapsed)}
            <span className="block text-xl text-mute md:inline md:text-2xl"> / {fmt(durationMs)}</span>
          </p>
          <div className="flex h-16 items-end gap-1" aria-hidden="true">
            {Array.from({ length: 24 }, (_, i) => (
              <i
                key={i}
                className="w-2 rounded-full bg-signal transition-[height] duration-75"
                style={{ height: `${Math.max(6, Math.min(64, level * 64 * (0.55 + 0.45 * Math.abs(Math.sin(i * 1.7)))))}px`, opacity: live ? 1 : 0.35 }}
              />
            ))}
          </div>
          <p className="min-h-14 max-w-2xl text-center text-lg leading-relaxed text-white/85" aria-live="off">
            {!transcript.supported ? <span className="text-sm text-mute">{tx.noCaptions}</span> : caption || <span className="text-mute">{tx.speak}</span>}
          </p>
          <button type="button" className="btn" onClick={live ? pause : resume} disabled={client.active} style={{ minHeight: "46px", padding: "10px 28px", minWidth: "160px" }}>
            {live ? tx.pause : tx.resume}
          </button>
          {client.overlay}
          {silence.asking ? <SilencePrompt secondsLeft={silence.secondsLeft} onStay={silence.confirm} onStop={() => void finish()} /> : null}
        </section>

        {outline?.topic || outline?.points.length ? (
          <aside className="card" style={{ padding: "20px" }}>
            <h2 className="h text-base">{tx.outline}</h2>
            {outline.topic ? (
              <div className="mt-3 rounded-xl border border-line bg-black/20 px-3.5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-mute">{tx.topic}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{outline.topic}</p>
              </div>
            ) : null}
            {outline.points.length ? (
              <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm">
                {outline.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ol>
            ) : null}
          </aside>
        ) : null}
      </main>
    </div>
  );
}
