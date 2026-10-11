"use client";

import { useEffect, useState } from "react";
import { LANGUAGE_INFO, PITCH_LANGUAGES, STT_LABELS, parseLanguage, type PitchLanguage } from "@/lib/pitch/language";

/*
  Jazyk pitchu pred nahrávaním. Podľa neho sa vyberie model prepisu reči a jazyk živých titulkov.
  Zapamätá si ho prehliadač.
*/

const KEY = "pitchit-pitch-language";

export function usePitchLanguage() {
  const [language, setLanguage] = useState<PitchLanguage>("sk");
  useEffect(() => {
    try {
      setLanguage(parseLanguage(localStorage.getItem(KEY))); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage je len na klientovi
    } catch {
      // predvolene slovenčina
    }
  }, []);
  const choose = (next: PitchLanguage) => {
    setLanguage(next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      // voľbu si len nezapamätáme
    }
  };
  return { language, choose };
}

export function LanguagePicker({ language, choose }: ReturnType<typeof usePitchLanguage>) {
  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="jazyk-nadpis">
      <h2 id="jazyk-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
        V akom jazyku budeš pitchovať?
      </h2>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="jazyk-nadpis">
        {PITCH_LANGUAGES.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={language === code}
            onClick={() => choose(code)}
            className={`whitespace-nowrap rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
              language === code ? "border-signal bg-signal/10 text-paper" : "border-line text-mute hover:border-faint"
            }`}
          >
            {LANGUAGE_INFO[code].label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-faint">
        Prepis reči: {STT_LABELS[LANGUAGE_INFO[language].stt[0]]} v {LANGUAGE_INFO[language].adjective}. Spätnú väzbu dostaneš po slovensky.
      </p>
    </section>
  );
}
