"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { QA_MAX_QUESTIONS } from "@/lib/pitch/qa";

/*
  Q&A po prejave: zapnutie a počet otázok (1 až 4). Voľba sa pamätá v prehliadači.
*/

const KEY = "pitchit-qa";

export type QaPrefs = { enabled: boolean; count: number };

export function useQaPrefs() {
  const [prefs, setPrefs] = useState<QaPrefs>({ enabled: false, count: 2 });
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<QaPrefs> | null;
      if (saved) {
        const count = Math.min(QA_MAX_QUESTIONS, Math.max(1, Math.round(Number(saved.count) || 2)));
        setPrefs({ enabled: saved.enabled === true, count }); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage je len na klientovi
      }
    } catch {
      // predvolene vypnuté
    }
  }, []);
  const save = (next: QaPrefs) => {
    setPrefs(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // voľbu si len nezapamätáme
    }
  };
  return { ...prefs, save };
}

export function QaSettings({ enabled, count, save }: ReturnType<typeof useQaPrefs>) {
  const en = useLocale() === "en";
  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="qa-nadpis">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={() => save({ enabled: !enabled, count })}
        className="flex w-full items-center gap-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span id="qa-nadpis" className="block text-sm font-bold uppercase tracking-widest text-mute">
            {en ? "Q&A after the talk" : "Q&A po prejave"}
          </span>
          <span className="mt-1 block text-sm leading-snug text-mute">
            {en
              ? "After you finish, a voice asks you questions about your topic and documents, in the language of your talk. You answer out loud; the answers are recorded and scored separately."
              : "Po skončení ti hlas položí otázky k téme a podkladom, v jazyku prejavu. Odpovedáš nahlas, odpovede sa nahrajú a ohodnotia zvlášť."}
          </span>
        </span>
        <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${enabled ? "bg-signal" : "bg-line"}`} aria-hidden="true">
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${enabled ? "left-6" : "left-1"}`} />
        </span>
      </button>
      {enabled ? (
        <div className="mt-4 flex flex-wrap items-center gap-2" role="radiogroup" aria-label={en ? "Number of questions" : "Počet otázok"}>
          <span className="mr-1 text-sm font-bold text-mute">{en ? "Questions" : "Počet otázok"}</span>
          {Array.from({ length: QA_MAX_QUESTIONS }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={count === n}
              onClick={() => save({ enabled, count: n })}
              className={`h-10 w-10 rounded-full border-2 text-sm font-bold transition ${count === n ? "border-signal bg-signal/10 text-paper" : "border-line text-mute hover:border-faint"}`}
            >
              {n}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
