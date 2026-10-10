"use client";

import { useEffect, useMemo, useState } from "react";
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
  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="osnova-nadpis">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="osnova-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
          O čom chceš pitchovať
        </h2>
        <span className="text-xs text-faint">Nepovinné. Na konci uvidíš, koľko z témy a osnovy si odprezentoval.</span>
      </div>
      <label htmlFor="pitch-tema" className="mt-4 block text-sm font-bold">
        Téma <span className="font-normal text-mute">(podľa nej sa pitch hodnotí)</span>
      </label>
      <textarea
        id="pitch-tema"
        value={topic}
        onChange={(e) => onTopic(e.target.value)}
        maxLength={TOPIC_MAX_LENGTH}
        rows={5}
        placeholder="Napríklad: Predstavujem PitchIt, AI trénera, ktorý founderov pripraví na stretnutie s investorom. Chcem, aby investor pochopil problém, ako to funguje a že hľadáme 150 000 € na rast."
        className="mt-2 min-h-40 w-full resize-y rounded-2xl border border-line bg-transparent px-5 py-4 text-lg leading-relaxed text-paper placeholder:text-faint focus:border-signal focus:outline-none"
      />
      <p className="mt-1 text-right text-xs text-faint">
        {topic.length} / {TOPIC_MAX_LENGTH}
      </p>
      <label htmlFor="pitch-osnova" className="mt-4 block text-sm font-bold">
        Osnova <span className="font-normal text-mute">(jeden bod na riadok)</span>
      </label>
      <textarea
        id="pitch-osnova"
        value={text}
        onChange={(e) => onText(e.target.value)}
        rows={5}
        placeholder={"Problém: founderi pitchujú bez spätnej väzby\nRiešenie: nahráš pitch a AI ti povie, čo zlepšiť\nTrh a konkurencia\nPrvé výsledky z pilotu\nČo od vás chceme"}
        className="mt-2 w-full resize-y rounded-2xl border border-line bg-transparent px-5 py-4 text-base leading-relaxed text-paper placeholder:text-faint focus:border-signal focus:outline-none"
      />
      <p className={`mt-2 text-xs ${count > OUTLINE_MAX_POINTS ? "text-marker" : "text-faint"}`}>
        {count === 0
          ? "Bez osnovy porovnáme pitch len s témou."
          : `${Math.min(count, OUTLINE_MAX_POINTS)} ${count === 1 ? "bod" : count < 5 ? "body" : "bodov"} osnovy${count > OUTLINE_MAX_POINTS ? `, použijeme prvých ${OUTLINE_MAX_POINTS}` : ""}`}
      </p>
    </section>
  );
}
