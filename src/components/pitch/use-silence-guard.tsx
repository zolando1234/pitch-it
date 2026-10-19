"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { GRACE_MS, SILENCE_MS, silenceStep, VOICE_LEVEL } from "@/lib/pitch/silence";

/*
  Stráženie ticha počas nahrávania: keď sa dlhšie než minútu neozve hlas, ukáže otázku
  „Si ešte tam?“. Ak človek zareaguje (klikne alebo prehovorí), nahrávanie pokračuje,
  ak nie, po krátkej lehote sa ukončí. Bez toho by sa nahrávalo (a účtovalo) aj to,
  keď niekto odišiel od počítača.
*/

export { GRACE_MS, SILENCE_MS, VOICE_LEVEL } from "@/lib/pitch/silence";

export type SilenceTimeout = {
  /** ako dlho bolo ticho pred ukončením (na odpočítanie z účtovaného času) */
  idleMs: number;
  /** hovoril človek počas nahrávania vôbec? */
  everSpoke: boolean;
};

export function useSilenceGuard({
  active,
  level,
  onTimeout,
  silenceMs = SILENCE_MS,
  graceMs = GRACE_MS,
}: {
  /** len počas živého nahrávania (nie pri pauze, odpovedi klientovi ani nahratom videu) */
  active: boolean;
  /** hlasitosť mikrofónu 0–1 */
  level: number;
  onTimeout: (info: SilenceTimeout) => void;
  silenceMs?: number;
  graceMs?: number;
}) {
  const [asking, setAsking] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(Math.ceil(graceMs / 1000));
  const lastVoice = useRef(0);
  const everSpoke = useRef(false);
  const askedAt = useRef(0);
  const askingRef = useRef(false);
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  });

  const reset = () => {
    lastVoice.current = performance.now();
    askingRef.current = false;
    setAsking(false);
  };

  // hlas: obnoví odpočet a zruší otázku (človek prehovoril, takže je tam)
  useEffect(() => {
    if (!active || level < VOICE_LEVEL) return;
    everSpoke.current = true;
    lastVoice.current = performance.now();
    if (askingRef.current) {
      askingRef.current = false;
      setAsking(false);
    }
  }, [active, level]);

  // po pauze alebo odpovedi klientovi sa ticho počíta odznova
  useEffect(() => {
    if (!active) return;
    lastVoice.current = performance.now();
    askingRef.current = false;
    setAsking(false); // eslint-disable-line react-hooks/set-state-in-effect -- nový úsek nahrávania
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const now = performance.now();
      const step = silenceStep({ now, lastVoice: lastVoice.current, askedAt: askingRef.current ? askedAt.current : null, silenceMs, graceMs });
      if (step.kind === "ask") {
        askingRef.current = true;
        askedAt.current = now;
        setSecondsLeft(Math.ceil(graceMs / 1000));
        setAsking(true);
      } else if (step.kind === "wait") {
        setSecondsLeft(step.secondsLeft);
      } else if (step.kind === "timeout") {
        askingRef.current = false;
        setAsking(false);
        onTimeoutRef.current({ idleMs: step.idleMs, everSpoke: everSpoke.current });
      }
    }, 500);
    return () => clearInterval(id);
  }, [active, silenceMs, graceMs]);

  return { asking: asking && active, secondsLeft, confirm: reset };
}

const TX = {
  sk: {
    title: "Si ešte tam?",
    body: (s: number) => `Už chvíľu nepočujeme hlas. Ak sa neozveš, nahrávanie sa o ${s} s ukončí.`,
    stay: "Som tu, pokračujem",
    stop: "Ukončiť nahrávanie",
  },
  en: {
    title: "Are you still there?",
    body: (s: number) => `We haven't heard your voice for a while. If you don't respond, the recording ends in ${s} s.`,
    stay: "I'm here, continue",
    stop: "End recording",
  },
};

/** Dialóg „Si ešte tam?“; umiestni sa do kontajnera s `position: relative` (alebo celej obrazovky). */
export function SilencePrompt({ secondsLeft, onStay, onStop }: { secondsLeft: number; onStay: () => void; onStop: () => void }) {
  const tx = TX[useLocale()];
  return (
    <div role="alertdialog" aria-modal="true" aria-labelledby="ticho-nadpis" className="absolute inset-0 z-[60] flex items-center justify-center bg-black/70 p-5">
      <div className="w-full max-w-md rounded-2xl border border-line-strong bg-panel p-6 text-center text-paper shadow-2xl">
        <h2 id="ticho-nadpis" className="h text-2xl">
          {tx.title}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed text-mute" aria-live="assertive">
          {tx.body(secondsLeft)}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          <button type="button" className="btn btn-p" autoFocus onClick={onStay} style={{ minHeight: "46px", padding: "10px 22px" }}>
            {tx.stay}
          </button>
          <button type="button" className="btn" onClick={onStop} style={{ minHeight: "46px", padding: "10px 22px" }}>
            {tx.stop}
          </button>
        </div>
      </div>
    </div>
  );
}
