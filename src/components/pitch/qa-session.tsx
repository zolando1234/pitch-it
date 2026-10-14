"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { PI_BACKGROUND, PiTopbar } from "@/components/pitch/pi-topbar";
import { primeAudio, startCapture, type SpeechCapture } from "@/components/pitch/speech-capture";
import { LANGUAGE_INFO, type PitchLanguage } from "@/lib/pitch/language";
import { QA_ANSWER_MAX_MS } from "@/lib/pitch/qa";
import type { AudioSegment } from "@/lib/pitch/segmenter";

/*
  Q&A po prejave: otázky jedna po druhej. Hlas (ElevenLabs, inak hlas prehliadača) prečíta
  otázku, potom sa nahráva odpoveď, kým človek neklikne „Ďalej“. Ďalšia otázka príde až po
  odpovedi na predošlú. Úseky odpovedí ostávajú v pamäti, odošlú sa po analýze prejavu.
*/

export type QaAnswerRecording = { question: string; segments: AudioSegment[]; durationMs: number };

const TX = {
  sk: {
    title: "Q&A",
    preparing: "Pripravujem otázky k tvojej téme…",
    failed: "Otázky sa nepodarilo pripraviť.",
    skip: "Preskočiť Q&A",
    question: (i: number, n: number) => `Otázka ${i} z ${n}`,
    listening: "Počúvaj otázku…",
    answer: "Odpovedaj nahlas",
    next: "Hotovo, ďalšia otázka",
    finish: "Hotovo, dokončiť",
    replay: "Prehrať otázku znova",
    noMic: "Mikrofón nie je dostupný, odpoveď sa nenahrá.",
    unblock: "Odpoveď sa nenahráva. Klikni sem a odpovedaj",
    hint: "Odpovedz stručne, ideálne do jednej minúty. Prejav sa medzitým vyhodnocuje.",
  },
  en: {
    title: "Q&A",
    preparing: "Preparing questions about your topic…",
    failed: "The questions couldn't be prepared.",
    skip: "Skip Q&A",
    question: (i: number, n: number) => `Question ${i} of ${n}`,
    listening: "Listen to the question…",
    answer: "Answer out loud",
    next: "Done, next question",
    finish: "Done, finish",
    replay: "Play the question again",
    noMic: "The microphone isn't available, the answer won't be recorded.",
    unblock: "Your answer isn't being recorded. Click here and answer",
    hint: "Keep it short, ideally under a minute. Your talk is being analyzed in the meantime.",
  },
};

const fmt = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor((ms % 60_000) / 1000)).padStart(2, "0")}`;

/** Prečíta otázku: ElevenLabs, pri chybe hlas prehliadača. Resolve po dočítaní. */
async function speak(text: string, language: PitchLanguage, cache: Map<string, string>): Promise<void> {
  try {
    let url = cache.get(text);
    if (!url) {
      const response = await fetch("/api/pitch/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, language }) });
      if (!response.ok) throw new Error(String(response.status));
      url = URL.createObjectURL(await response.blob());
      cache.set(text, url);
    }
    const audio = new Audio(url);
    await new Promise<void>((resolve, reject) => {
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("audio"));
      audio.play().catch(reject);
    });
    return;
  } catch {
    // záloha: hlas prehliadača
  }
  if (typeof speechSynthesis === "undefined") return;
  await new Promise<void>((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = LANGUAGE_INFO[language].bcp47;
    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    speechSynthesis.cancel();
    speechSynthesis.speak(utterance);
  });
}

export function QaSession({
  questions,
  failed,
  language,
  stream,
  homeHref,
  onDone,
}: {
  /** null = otázky sa ešte pripravujú */
  questions: string[] | null;
  failed: boolean;
  language: PitchLanguage;
  stream: MediaStream | null;
  homeHref: string;
  onDone: (answers: QaAnswerRecording[]) => void;
}) {
  const tx = TX[useLocale()];
  const [index, setIndex] = useState(0);
  const [stage, setStage] = useState<"asking" | "answering">("asking");
  const [elapsed, setElapsed] = useState(0);
  /** hlasitosť nahrávanej odpovede (priamo z nahrávania, nie zo všeobecného mikrofónu) */
  const [level, setLevel] = useState(0);
  /** nahrávanie sa nerozbehlo (prehliadač uspal zvuk): treba kliknúť */
  const [stalled, setStalled] = useState(false);
  const lastBlockAt = useRef(0);
  const answers = useRef<QaAnswerRecording[]>([]);
  const capture = useRef<SpeechCapture | null>(null);
  const segments = useRef<AudioSegment[]>([]);
  const startedAt = useRef(0);
  const cache = useRef(new Map<string, string>());
  const finishing = useRef(false);

  const question = questions?.[index] ?? null;

  const ask = useCallback(
    async (text: string) => {
      setStage("asking");
      await speak(text, language, cache.current);
      segments.current = [];
      setElapsed(0);
      startedAt.current = performance.now();
      setStage("answering");
      lastBlockAt.current = performance.now();
      setStalled(false);
      await startAnswerCapture();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startAnswerCapture závisí len od streamu
    [language, stream],
  );

  /** Nahrávanie odpovede; hlasitosť ukazuje, že zvuk naozaj prichádza. */
  async function startAnswerCapture() {
    if (!stream || capture.current) return;
    try {
      capture.current = await startCapture(
        stream,
        (segment) => segments.current.push(segment),
        (value) => {
          lastBlockAt.current = performance.now();
          setLevel(value);
        },
      );
    } catch {
      capture.current = null;
    }
  }

  /** Kliknutie prebudí zvuk (Safari bez kliknutia nahrávanie nespustí). */
  const unblock = async () => {
    primeAudio();
    if (capture.current) await capture.current.wake();
    else await startAnswerCapture();
    lastBlockAt.current = performance.now();
    setStalled(false);
  };

  // každá otázka sa prečíta, keď na ňu príde rad
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- nová otázka spustí čítanie a nahrávanie odpovede (vonkajšie API: zvuk, mikrofón)
    if (question) void ask(question);
  }, [question, ask]);

  useEffect(() => {
    const urls = cache.current;
    return () => {
      void capture.current?.stop();
      urls.forEach((url) => URL.revokeObjectURL(url));
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    };
  }, []);

  const next = useCallback(async () => {
    if (!questions || !question || finishing.current) return;
    finishing.current = true;
    const durationMs = capture.current ? await capture.current.stop() : Math.round(performance.now() - startedAt.current);
    capture.current = null;
    answers.current.push({ question, segments: segments.current, durationMs });
    finishing.current = false;
    if (index + 1 < questions.length) setIndex(index + 1);
    else onDone(answers.current);
  }, [questions, question, index, onDone]);

  // čas odpovede a automatický koniec po limite. `next` cez ref: rodič sa prekresľuje často
  // (ukazovateľ hlasitosti) a nový časovač pri každom prekreslení by nikdy nestihol tiknúť.
  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);
  useEffect(() => {
    if (stage !== "answering") return;
    const id = setInterval(() => {
      const ms = performance.now() - startedAt.current;
      setElapsed(ms);
      // žiadny zvuk z nahrávania viac ako 2 s: prehliadač ho uspal alebo chýba mikrofón
      if (stream) setStalled(!capture.current?.running() || performance.now() - lastBlockAt.current > 2000);
      if (ms >= QA_ANSWER_MAX_MS) void nextRef.current();
    }, 250);
    return () => clearInterval(id);
  }, [stage, index, stream]);

  /** Otázku znova: odpoveď sa medzitým nenahráva, aby v nej nebol hlas otázky. */
  const replay = async () => {
    if (!question) return;
    primeAudio();
    capture.current?.pause();
    await speak(question, language, cache.current);
    capture.current?.resume();
  };

  const last = questions ? index + 1 >= questions.length : false;

  return (
    <div className="pi-rec min-h-dvh text-paper" style={{ background: PI_BACKGROUND }}>
      <PiTopbar href={homeHref} />
      <main id="obsah" className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-5 py-14 text-center">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">{tx.title}</p>
        {!questions ? (
          <>
            <p className="h text-3xl leading-tight md:text-4xl">{failed ? tx.failed : tx.preparing}</p>
            {failed ? null : <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-signal" aria-hidden="true" />}
            <button type="button" className="btn" onClick={() => onDone([])} style={{ minHeight: "48px" }}>
              {tx.skip}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm text-mute">{tx.question(index + 1, questions.length)}</p>
            <h1 className="h text-3xl leading-tight md:text-5xl" aria-live="polite">
              {question}
            </h1>
            {stage === "asking" ? (
              <p className="animate-pulse text-lg text-mute">{tx.listening}</p>
            ) : (
              <div className="flex flex-col items-center gap-5">
                <p className="flex items-center gap-3 text-lg font-bold">
                  <span className="h-3 w-3 animate-pulse rounded-full bg-danger" aria-hidden="true" />
                  {tx.answer} · <span className="font-mono">{fmt(elapsed)}</span>
                </p>
                {stream && stalled ? (
                  <button type="button" className="btn btn-p" onClick={() => void unblock()} style={{ minHeight: "52px", padding: "10px 28px" }}>
                    {tx.unblock}
                  </button>
                ) : stream ? (
                  <div className="h-2.5 w-64 overflow-hidden rounded-full bg-line" aria-hidden="true">
                    <div className="h-full rounded-full bg-signal transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
                  </div>
                ) : (
                  <p className="text-sm text-marker">{tx.noMic}</p>
                )}
                <button
                  type="button"
                  className="btn btn-p"
                  onClick={() => {
                    primeAudio();
                    void next();
                  }}
                  style={{ minHeight: "56px", padding: "12px 32px", fontSize: "17px" }}
                >
                  {last ? tx.finish : tx.next} →
                </button>
                <button type="button" className="text-sm font-semibold text-accent hover:underline" onClick={() => void replay()}>
                  {tx.replay}
                </button>
              </div>
            )}
            <p className="max-w-md text-sm text-faint">{tx.hint}</p>
          </>
        )}
      </main>
    </div>
  );
}
