"use client";

import { useEffect, useState } from "react";
import { LANGUAGE_INFO, PITCH_LANGUAGES, STT_LABELS, languageName, parseLanguage, type PitchLanguage } from "@/lib/pitch/language";
import { useLocale } from "@/components/i18n/locale-provider";

/*
  Jazyk prejavu pred nahrávaním. Podľa neho sa nastaví prepis reči, živé titulky a jazyk otázok v Q&A.
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

/** Najčastejšie jazyky ako tlačidlá, ostatné v zozname. */
const QUICK: PitchLanguage[] = ["sk", "cs", "en", "de", "pl", "hu"];

export function LanguagePicker({ language, choose }: ReturnType<typeof usePitchLanguage>) {
  const locale = useLocale();
  const en = locale === "en";
  const others = PITCH_LANGUAGES.filter((code) => !QUICK.includes(code)).sort((a, b) =>
    languageName(a, locale).localeCompare(languageName(b, locale), locale),
  );
  const otherSelected = !QUICK.includes(language);
  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="jazyk-nadpis">
      <h2 id="jazyk-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
        {en ? "What language will you speak in?" : "V akom jazyku budeš hovoriť?"}
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="contents" role="radiogroup" aria-labelledby="jazyk-nadpis">
          {QUICK.map((code) => (
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
        <label className="sr-only" htmlFor="jazyk-iny">
          {en ? "Another language" : "Iný jazyk"}
        </label>
        <select
          id="jazyk-iny"
          value={otherSelected ? language : ""}
          onChange={(e) => e.target.value && choose(parseLanguage(e.target.value))}
          className={`rounded-full border-2 bg-ink px-4 py-2 text-sm font-bold ${otherSelected ? "border-signal text-paper" : "border-line text-mute"}`}
        >
          <option value="">{en ? "Another language…" : "Iný jazyk…"}</option>
          {others.map((code) => (
            <option key={code} value={code}>
              {languageName(code, locale)} · {LANGUAGE_INFO[code].label}
            </option>
          ))}
        </select>
      </div>
      <p className="mt-3 text-xs text-faint">
        {en
          ? `Transcription: ${STT_LABELS.elevenlabs} in ${LANGUAGE_INFO[language].english}. Q&A questions will be in this language, you get the feedback in English.`
          : `Prepis reči: ${STT_LABELS.elevenlabs}, jazyk ${languageName(language, "sk")}. Otázky v Q&A budú v tomto jazyku, spätnú väzbu dostaneš po slovensky.`}
      </p>
    </section>
  );
}
