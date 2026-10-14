"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  canUseLength,
  CUSTOM_MAX_SECONDS,
  CUSTOM_MIN_SECONDS,
  FREE_MAX_SECONDS,
  isValidLength,
  lengthLabel,
  RECORD_LENGTHS,
  type PitchBalance,
} from "@/lib/billing/pitch-pack";

/*
  Dĺžka nahrávania. Predvolené dĺžky alebo vlastná v celých minútach; nad 3 minúty len
  v platenej verzii (kúpený balík pitchov). Voľba sa pamätá v prehliadači.
*/

const KEY = "pitchit-pitch-length";

export function usePitchLength(initial: number) {
  const [length, setLength] = useState<number>(initial);
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY));
      if (isValidLength(saved)) setLength(saved); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage je len na klientovi
    } catch {
      // ostáva predvolená dĺžka
    }
  }, []);
  const choose = (next: number) => {
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
  const paidLocked = !canUseLength(CUSTOM_MAX_SECONDS, balance);
  const isCustom = !(RECORD_LENGTHS as readonly number[]).includes(length);
  const [customOpen, setCustomOpen] = useState(false);
  const [minutes, setMinutes] = useState(String(isCustom ? length / 60 : 10));
  const showCustom = isCustom || customOpen;

  const applyMinutes = (value: string) => {
    setMinutes(value);
    const seconds = Math.round(Number(value)) * 60;
    if (isValidLength(seconds)) choose(seconds);
  };

  const chip = (key: string, active: boolean, locked: boolean, label: string, onClick: () => void, paidTag: boolean) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={active}
      aria-disabled={locked}
      onClick={() => (locked ? setLockedTried(true) : onClick())}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded-full border-2 px-4 py-2 text-sm font-bold transition ${
        active ? "border-signal bg-signal/10 text-paper" : locked ? "border-dashed border-line text-faint" : "border-line text-mute hover:border-faint"
      }`}
    >
      {label}
      {paidTag ? (
        <span className="rounded-full bg-violet/15 px-2 py-0.5 text-[10px] uppercase tracking-wider text-violet">
          {locked ? (en ? "🔒 Paid" : "🔒 Platená") : en ? "Paid" : "Platená"}
        </span>
      ) : null}
    </button>
  );

  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="dlzka-nadpis">
      <h2 id="dlzka-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
        {en ? "Length" : "Dĺžka"}
      </h2>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="dlzka-nadpis">
        {RECORD_LENGTHS.map((l) =>
          chip(String(l), length === l && !customOpen, l > FREE_MAX_SECONDS && paidLocked, lengthLabel(l), () => {
            setCustomOpen(false);
            choose(l);
          }, l > FREE_MAX_SECONDS),
        )}
        {chip("custom", showCustom, paidLocked, en ? "Custom" : "Vlastná", () => {
          setCustomOpen(true);
          applyMinutes(minutes);
        }, true)}
      </div>
      {showCustom && !paidLocked ? (
        <label className="mt-4 flex items-center gap-3 text-sm text-mute">
          {en ? "Minutes" : "Minúty"}
          <input
            type="number"
            inputMode="numeric"
            min={CUSTOM_MIN_SECONDS / 60}
            max={CUSTOM_MAX_SECONDS / 60}
            step={1}
            value={minutes}
            onChange={(e) => applyMinutes(e.target.value)}
            className="w-24 rounded-xl border border-line bg-transparent px-3 py-2 text-base font-bold text-paper focus:border-signal focus:outline-none"
          />
          <span className="text-xs text-faint">
            {en ? `1 to ${CUSTOM_MAX_SECONDS / 60} minutes, e.g. a lecture or a longer talk.` : `1 až ${CUSTOM_MAX_SECONDS / 60} minút, napríklad prednáška alebo dlhší prejav.`}
          </span>
        </label>
      ) : null}
      {paidLocked ? (
        <p className={`mt-3 text-xs ${lockedTried ? "text-marker" : "text-faint"}`} role={lockedTried ? "status" : undefined}>
          {en ? "Talks longer than 3 minutes and a custom length are in the paid version." : "Prejav dlhší ako 3 minúty a vlastná dĺžka sú v platenej verzii."}{" "}
          <Link href={buyHref} className="font-bold text-accent">
            {en ? "Buy a pitch pack" : "Kúpiť balík pitchov"}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
