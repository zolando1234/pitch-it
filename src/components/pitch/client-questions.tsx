"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { speak, type QaAnswerRecording } from "@/components/pitch/qa-session";
import { primeAudio, startCapture, type SpeechCapture } from "@/components/pitch/speech-capture";
import { GAP_AFTER_ANSWER_MS, planQuestionTimes } from "@/lib/pitch/meeting";
import type { PitchLanguage } from "@/lib/pitch/language";
import { QA_ANSWER_MAX_MS } from "@/lib/pitch/qa";
import type { AudioSegment } from "@/lib/pitch/segmenter";

/*
  Stretnutie s klientom: počas výkladu klient v náhodných chvíľach preruší otázkou. Čaká na
  prirodzenú pauzu v reči, výklad (aj hodnotenie) sa pozastaví, otázka zaznie nahlas a nahrá sa
  odpoveď. Po odpovedi výklad pokračuje. Otázky sa pripravujú vopred z toho, čo už zaznelo.
*/

export type MeetingSetup = {
  questions: number;
  language: PitchLanguage;
  stream: MediaStream | null;
  /** hlasitosť mikrofónu 0–1: otázka príde v pauze, nie uprostred vety */
  level: number;
  topic: string | null;
  outline: string[] | null;
  /** priebežný prepis: koncept a počet úsekov odoslaných na prepis */
  transcript: () => { draftId: string; segments: number } | null;
  onAnswers: (answers: QaAnswerRecording[]) => void;
};

const TX = {
  sk: {
    client: "Klient sa pýta",
    of: (i: number, n: number) => `otázka ${i} z ${n}`,
    listen: "Počúvaj…",
    answer: "Odpovedz",
    done: "Odpovedal som, pokračujem vo výklade →",
    replay: "Zopakovať otázku",
    unblock: "Odpoveď sa nenahráva. Klikni sem",
    hint: "Výklad aj hodnotenie stoja, kým neodpovieš.",
  },
  en: {
    client: "The client asks",
    of: (i: number, n: number) => `question ${i} of ${n}`,
    listen: "Listen…",
    answer: "Answer",
    done: "Answered, continue the presentation →",
    replay: "Repeat the question",
    unblock: "Your answer isn't being recorded. Click here",
    hint: "The presentation and scoring are paused until you answer.",
  },
};

/** Ticho tak dlho = prirodzená pauza, kedy sa dá prerušiť. */
const QUIET_MS = 700;
const QUIET_LEVEL = 0.05;
/** keď pauza nepríde, klient preruší aj tak */
const MAX_WAIT_MS = 10_000;
/** otázka sa pripravuje vopred */
const PREFETCH_MS = 12_000;

const fmt = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

export function useClientQuestions({
  meeting,
  live,
  elapsedMs,
  durationMs,
  pause,
  resume,
}: {
  meeting: MeetingSetup | null;
  /** výklad práve beží (nie odpočet, pauza ani koniec) */
  live: boolean;
  elapsedMs: number;
  durationMs: number | null;
  pause: () => void;
  resume: () => void;
}) {
  const tx = TX[useLocale()];
  const [active, setActive] = useState<{ question: string; number: number; stage: "asking" | "answering" } | null>(null);
  const [answerMs, setAnswerMs] = useState(0);
  const [answerLevel, setAnswerLevel] = useState(0);
  const [stalled, setStalled] = useState(false);
  const plan = useRef<number[] | null>(null);
  const next = useRef(0);
  const prefetch = useRef<{ index: number; question: string | null; ready: boolean } | null>(null);
  const asked = useRef<string[]>([]);
  const answers = useRef<QaAnswerRecording[]>([]);
  const capture = useRef<SpeechCapture | null>(null);
  const segments = useRef<AudioSegment[]>([]);
  const answerStarted = useRef(0);
  const lastBlockAt = useRef(0);
  const lastLoudAt = useRef(0);
  const dueSince = useRef<number | null>(null);
  const cache = useRef(new Map<string, string>());
  const busy = useRef(false);

  const [total, setTotal] = useState(0);
  // plán otázok podľa dĺžky stretnutia (raz)
  useEffect(() => {
    if (!meeting || !durationMs || plan.current) return;
    plan.current = planQuestionTimes(durationMs, meeting.questions);
    setTotal(plan.current.length);
  }, [meeting, durationMs]);

  const level = meeting?.level ?? 0;
  useEffect(() => {
    if (level >= QUIET_LEVEL) lastLoudAt.current = performance.now();
  }, [level]);

  const fetchQuestion = useCallback(
    async (index: number) => {
      if (!meeting) return;
      prefetch.current = { index, question: null, ready: false };
      const draft = meeting.transcript();
      let question: string | null = null;
      try {
        const response = await fetch("/api/pitch/questions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            count: 1,
            language: meeting.language,
            draftId: draft?.draftId ?? null,
            segments: draft?.segments ?? 0,
            topic: meeting.topic,
            outline: meeting.outline,
            mode: "client",
            asked: asked.current,
          }),
        });
        const data = (await response.json().catch(() => null)) as { questions?: string[] } | null;
        question = response.ok ? (data?.questions?.[0] ?? null) : null;
      } catch {
        question = null;
      }
      if (prefetch.current?.index === index) prefetch.current = { index, question, ready: true };
    },
    [meeting],
  );

  const startAnswer = useCallback(async () => {
    if (!meeting?.stream || capture.current) return;
    try {
      capture.current = await startCapture(
        meeting.stream,
        (segment) => segments.current.push(segment),
        (value) => {
          lastBlockAt.current = performance.now();
          setAnswerLevel(value);
        },
      );
    } catch {
      capture.current = null;
    }
  }, [meeting]);

  const ask = useCallback(
    async (question: string, number: number) => {
      busy.current = true;
      pause();
      asked.current = [...asked.current, question];
      setActive({ question, number, stage: "asking" });
      await speak(question, meeting?.language ?? "sk", cache.current);
      segments.current = [];
      answerStarted.current = performance.now();
      lastBlockAt.current = performance.now();
      setAnswerMs(0);
      setStalled(false);
      setActive({ question, number, stage: "answering" });
      await startAnswer();
    },
    [meeting, pause, startAnswer],
  );

  /** Ukončí odpoveď a uloží ju (aj pri konci stretnutia počas otázky). */
  const finishAnswer = useCallback(async () => {
    const current = active;
    if (!current) return;
    const durationMs = capture.current ? await capture.current.stop() : Math.round(performance.now() - answerStarted.current);
    capture.current = null;
    answers.current = [...answers.current, { question: current.question, segments: segments.current, durationMs }];
    meeting?.onAnswers(answers.current);
    segments.current = [];
    setActive(null);
    next.current += 1;
    prefetch.current = null;
    dueSince.current = null;
    busy.current = false;
  }, [active, meeting]);

  /** Odpoveď hotová: výklad pokračuje, ďalšia otázka najskôr o chvíľu. */
  const done = useCallback(async () => {
    primeAudio();
    await finishAnswer();
    if (plan.current) {
      for (let i = next.current; i < plan.current.length; i++) plan.current[i] = Math.max(plan.current[i], elapsedMs + GAP_AFTER_ANSWER_MS * (i - next.current + 1));
    }
    resume();
  }, [finishAnswer, resume, elapsedMs]);

  // plánovač: pripraví otázku vopred, v pauze reči preruší
  useEffect(() => {
    if (!meeting || !live || active || busy.current || !plan.current) return;
    const index = next.current;
    const at = plan.current[index];
    if (at === undefined) return;
    // tesne pred koncom už nie
    if (durationMs && elapsedMs > durationMs - 15_000) return;
    if (elapsedMs >= at - PREFETCH_MS && prefetch.current?.index !== index) void fetchQuestion(index);
    if (elapsedMs < at) return;
    const ready = prefetch.current?.index === index && prefetch.current.ready;
    if (!ready) return;
    const question = prefetch.current?.question ?? null;
    if (!question) {
      // otázka sa nepodarila: tento termín vynecháme
      next.current += 1;
      prefetch.current = null;
      return;
    }
    const now = performance.now();
    dueSince.current ??= now;
    const quiet = now - lastLoudAt.current >= QUIET_MS;
    if (quiet || now - dueSince.current >= MAX_WAIT_MS) void ask(question, index + 1);
  });

  // čas odpovede, limit a kontrola, či sa odpoveď naozaj nahráva
  useEffect(() => {
    if (active?.stage !== "answering") return;
    const id = setInterval(() => {
      const ms = performance.now() - answerStarted.current;
      setAnswerMs(ms);
      if (meeting?.stream) setStalled(!capture.current?.running() || performance.now() - lastBlockAt.current > 2000);
      if (ms >= QA_ANSWER_MAX_MS) void done();
    }, 250);
    return () => clearInterval(id);
  }, [active, meeting, done]);

  useEffect(() => {
    const urls = cache.current;
    return () => {
      void capture.current?.stop();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);

  const replay = async () => {
    if (!active) return;
    primeAudio();
    capture.current?.pause();
    await speak(active.question, meeting?.language ?? "sk", cache.current);
    capture.current?.resume();
  };

  const unblock = async () => {
    primeAudio();
    if (capture.current) await capture.current.wake();
    else await startAnswer();
    lastBlockAt.current = performance.now();
    setStalled(false);
  };

  const overlay = active ? (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-5 bg-[#17142e]/92 px-6 text-center text-white backdrop-blur-sm">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-signal">
        {tx.client} · {tx.of(active.number, total)}
      </p>
      <p className="h max-w-3xl text-2xl leading-tight md:text-4xl" aria-live="polite">
        {active.question}
      </p>
      {active.stage === "asking" ? (
        <p className="animate-pulse text-white/70">{tx.listen}</p>
      ) : (
        <>
          <p className="flex items-center gap-3 font-bold">
            <span className="h-3 w-3 animate-pulse rounded-full bg-danger" aria-hidden="true" />
            {tx.answer} · <span className="font-mono">{fmt(answerMs)}</span>
          </p>
          {meeting?.stream && stalled ? (
            <button type="button" className="btn btn-p" onClick={() => void unblock()} style={{ minHeight: "48px" }}>
              {tx.unblock}
            </button>
          ) : (
            <div className="h-2.5 w-64 overflow-hidden rounded-full bg-white/15" aria-hidden="true">
              <div className="h-full rounded-full bg-signal transition-[width] duration-75" style={{ width: `${Math.round(answerLevel * 100)}%` }} />
            </div>
          )}
          <button type="button" className="btn btn-p" onClick={() => void done()} style={{ minHeight: "54px", padding: "12px 28px", fontSize: "16px" }}>
            {tx.done}
          </button>
          <button type="button" className="text-sm font-semibold text-signal hover:underline" onClick={() => void replay()}>
            {tx.replay}
          </button>
        </>
      )}
      <p className="text-xs text-white/60">{tx.hint}</p>
    </div>
  ) : null;

  return { overlay, active: !!active, finishAnswer };
}
