"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { OUTLINE_MAX_POINTS, parseOutlinePoints, TOPIC_MAX_LENGTH, toOutline, type PitchOutline } from "@/lib/pitch/outline";

/*
  Téma a osnova pred nahrávaním. Zapamätá si ich prehliadač, aby sa dali použiť
  pri ďalšom pokuse; na server idú až s nahrávkou.
*/

const KEY = "pitchit-pitch-outline";

export function usePitchOutline() {
  const [topic, setTopic] = useState("");
  const [text, setText] = useState("");

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? "null") as { topic?: string; text?: string } | null;
      /* eslint-disable react-hooks/set-state-in-effect -- localStorage je dostupný až na klientovi */
      setTopic(saved?.topic ?? "");
      setText(saved?.text ?? "");
      /* eslint-enable react-hooks/set-state-in-effect */
    } catch {
      // bez localStorage začíname s prázdnou osnovou
    }
  }, []);

  const save = (next: { topic: string; text: string }) => {
    setTopic(next.topic);
    setText(next.text);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      // osnova vydrží len do obnovenia stránky
    }
  };

  const outline: PitchOutline | null = useMemo(() => toOutline(topic, text), [topic, text]);

  return {
    topic,
    text,
    outline,
    onTopic: (value: string) => save({ topic: value, text }),
    onText: (value: string) => save({ topic, text: value }),
  };
}

export type PitchOutlineState = ReturnType<typeof usePitchOutline>;

export function OutlineEditor({ topic, text, onTopic, onText }: PitchOutlineState) {
  const count = parseOutlinePoints(text).length;
  const en = useLocale() === "en";
  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="osnova-nadpis">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="osnova-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
          {en ? "What do you want to pitch about" : "O čom chceš hovoriť"}
        </h2>
        <span className="text-xs text-faint">{en ? "Optional, but the feedback is much more accurate with it." : "Nepovinné, ale hodnotenie je s tým oveľa presnejšie."}</span>
      </div>
      <ul className="mt-3 grid gap-2 text-sm text-mute sm:grid-cols-2">
        <li className="rounded-2xl bg-white/[0.03] p-3">
          <b className="text-paper">{en ? "Topic" : "Téma"}</b> ·{" "}
          {en
            ? "One to three sentences: what you're talking about and what the audience should remember. Your talk is scored against it and Q&A questions are based on it."
            : "Jedna až tri vety: o čom hovoríš a čo si má publikum zapamätať. Prejav sa hodnotí voči téme a podľa nej vzniknú aj otázky v Q&A."}
        </li>
        <li className="rounded-2xl bg-white/[0.03] p-3">
          <b className="text-paper">{en ? "Outline" : "Osnova"}</b> ·{" "}
          {en
            ? "The main points in the order you want to say them, one per line. While you speak you see which points you've covered; the report shows what you skipped."
            : "Hlavné body v poradí, v akom ich chceš povedať, jeden na riadok. Počas prejavu vidíš, ktoré body si už povedal, a v reporte, čo si vynechal."}
        </li>
      </ul>
      <label htmlFor="pitch-tema" className="mt-4 block text-sm font-bold">
        {en ? "Topic" : "Téma"} <span className="font-normal text-mute">{en ? "(your pitch is scored against it)" : "(podľa nej sa pitch hodnotí)"}</span>
      </label>
      <textarea
        id="pitch-tema"
        value={topic}
        onChange={(e) => onTopic(e.target.value)}
        maxLength={TOPIC_MAX_LENGTH}
        rows={5}
        placeholder={
          en
            ? "For example: I'm presenting PitchIt, an AI coach that prepares founders for investor meetings. I want the investor to understand the problem, how it works and that we're raising €150,000 for growth."
            : "Napríklad: Predstavujem PitchIt, AI trénera, ktorý founderov pripraví na stretnutie s investorom. Chcem, aby investor pochopil problém, ako to funguje a že hľadáme 150 000 € na rast."
        }
        className="mt-2 min-h-40 w-full resize-y rounded-2xl border border-line bg-transparent px-5 py-4 text-lg leading-relaxed text-paper placeholder:text-faint focus:border-signal focus:outline-none"
      />
      <p className="mt-1 text-right text-xs text-faint">
        {topic.length} / {TOPIC_MAX_LENGTH}
      </p>
      <label htmlFor="pitch-osnova" className="mt-4 block text-sm font-bold">
        {en ? "Outline" : "Osnova"} <span className="font-normal text-mute">{en ? "(one point per line)" : "(jeden bod na riadok)"}</span>
      </label>
      <textarea
        id="pitch-osnova"
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={5}
        placeholder={
          en
            ? "Problem: founders pitch without feedback\nSolution: record your pitch and AI tells you what to improve\nMarket and competition\nFirst results from the pilot\nWhat we want from you"
            : "Problém: founderi pitchujú bez spätnej väzby\nRiešenie: nahráš pitch a AI ti povie, čo zlepšiť\nTrh a konkurencia\nPrvé výsledky z pilotu\nČo od vás chceme"
        }
        className="mt-2 w-full resize-y rounded-2xl border border-line bg-transparent px-5 py-4 text-base leading-relaxed text-paper placeholder:text-faint focus:border-signal focus:outline-none"
      />
      <p className={`mt-2 text-xs ${count > OUTLINE_MAX_POINTS ? "text-marker" : "text-faint"}`}>
        {count === 0
          ? en
            ? "Without an outline we compare the pitch with the topic only."
            : "Bez osnovy porovnáme pitch len s témou."
          : en
            ? `${Math.min(count, OUTLINE_MAX_POINTS)} outline ${count === 1 ? "point" : "points"}${count > OUTLINE_MAX_POINTS ? `, we use the first ${OUTLINE_MAX_POINTS}` : ""}`
            : `${Math.min(count, OUTLINE_MAX_POINTS)} ${count === 1 ? "bod" : count < 5 ? "body" : "bodov"} osnovy${count > OUTLINE_MAX_POINTS ? `, použijeme prvých ${OUTLINE_MAX_POINTS}` : ""}`}
      </p>
    </section>
  );
}
