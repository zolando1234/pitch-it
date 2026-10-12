"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { canUseLength, lengthLabel, PAID_LENGTH, RECORD_LENGTHS, type PitchBalance, type RecordLength } from "@/lib/billing/pitch-pack";

/*
  Dĺžka nahrávaného pitchu. Predvolená je z úvodného dotazníka, zmena sa pamätá v prehliadači.
  4 minúty sú v platenej verzii (kúpený balík pitchov).
*/

const KEY = "pitchit-pitch-length";

export function usePitchLength(fromQuiz: RecordLength) {
  const [length, setLength] = useState<RecordLength>(fromQuiz);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      const known = RECORD_LENGTHS.find((l) => l === saved);
      if (known) setLength(known); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage je len na klientovi
    } catch {
      // ostáva dĺžka z dotazníka
    }
  }, []);
  const choose = (next: RecordLength) => {
    setLength(next);
    try {
      localStorage.setItem(KEY, String(next));
    } catch {
      // voľbu si len nezapamätáme
    }
  };
  return { length, choose };
}

export function LengthPicker({
  length,
  choose,
  balance,
  buyHref,
}: ReturnType<typeof usePitchLength> & { balance: PitchBalance | null; buyHref: string }) {
  const [lockedTried, setLockedTried] = useState(false);
  const en = useLocale() === "en";
  const paidLocked = !canUseLength(PAID_LENGTH, balance);
  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="dlzka-nadpis">
      <h2 id="dlzka-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
        {en ? "Pitch length" : "Dĺžka pitchu"}
      </h2>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="dlzka-nadpis">
        {RECORD_LENGTHS.map((l) => {
          const locked = l === PAID_LENGTH && paidLocked;
          return (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={length === l}
              aria-disabled={locked}
              onClick={() => (locked ? setLockedTried(true) : choose(l))}
              className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
                length === l ? "border-signal bg-signal/10 text-paper" : locked ? "border-dashed border-line text-faint" : "border-line text-mute hover:border-faint"
              }`}
            >
              {lengthLabel(l)}
              {l === PAID_LENGTH ? (
                <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-violet">
                  {locked ? (en ? "🔒 Paid" : "🔒 Platená") : en ? "Paid" : "Platená"}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {paidLocked ? (
        <p className={`mt-3 text-xs ${lockedTried ? "text-marker" : "text-faint"}`} role={lockedTried ? "status" : undefined}>
          {en ? "A 4-minute pitch (e.g. demo day) is in the paid version." : "4-minútový pitch (napr. demo day) je v platenej verzii."}{" "}
          <Link href={buyHref} className="font-bold text-accent">
            {en ? "Buy a pitch pack" : "Kúpiť balík pitchov"}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
