"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import {
  canUseLength,
  CUSTOM_MAX_SECONDS,
  CUSTOM_MIN_SECONDS,
  UNLIMITED_MAX_SECONDS,
  isValidLength,
  lengthLabel,
  RECORD_LENGTHS,
  type PitchBalance,
} from "@/lib/billing/pitch-pack";

/*
  Dĺžka nahrávania. Predvolené dĺžky alebo vlastná v celých minútach, najviac toľko,
  koľko zostáva minút (Free: čas zadarmo, Pro: týždenné a dokúpené minúty). Voľba sa pamätá v prehliadači.
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
  plansHref,
}: ReturnType<typeof usePitchLength> & { balance: PitchBalance | null; plansHref: string }) {
  const [lockedTried, setLockedTried] = useState(false);
  const en = useLocale() === "en";
  /** najviac minút pre vlastnú dĺžku (podľa zostatku) */
  const maxMinutes = Math.max(1, Math.floor(Math.min(UNLIMITED_MAX_SECONDS, balance?.maxSeconds ?? CUSTOM_MAX_SECONDS) / 60));
  const customLocked = !canUseLength(CUSTOM_MIN_SECONDS, balance);
  const someLocked = !canUseLength(CUSTOM_MAX_SECONDS, balance);
  const isCustom = !(RECORD_LENGTHS as readonly number[]).includes(length);
  const [customOpen, setCustomOpen] = useState(false);
  const [minutes, setMinutes] = useState(String(isCustom ? length / 60 : 10));
  const showCustom = isCustom || customOpen;

  const applyMinutes = (value: string) => {
    setMinutes(value);
    const seconds = Math.round(Number(value)) * 60;
    if (isValidLength(seconds) && canUseLength(seconds, balance)) choose(seconds);
  };

  const chip = (key: string, active: boolean, locked: boolean, label: string, onClick: () => void) => (
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
      {locked ? "🔒 " : ""}
      {label}
    </button>
  );

  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="dlzka-nadpis">
      <h2 id="dlzka-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
        {en ? "Length" : "Dĺžka"}
      </h2>
      <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-labelledby="dlzka-nadpis">
        {RECORD_LENGTHS.map((l) =>
          chip(String(l), length === l && !customOpen, !canUseLength(l, balance), lengthLabel(l), () => {
            setCustomOpen(false);
            choose(l);
          }),
        )}
        {chip("custom", showCustom, customLocked, en ? "Custom" : "Vlastná", () => {
          setCustomOpen(true);
          applyMinutes(minutes);
        })}
      </div>
      {showCustom && !customLocked ? (
        <label className="mt-4 flex items-center gap-3 text-sm text-mute">
          {en ? "Minutes" : "Minúty"}
          <input
            type="number"
            inputMode="numeric"
            min={CUSTOM_MIN_SECONDS / 60}
            max={maxMinutes}
            step={1}
            value={minutes}
            onChange={(e) => applyMinutes(e.target.value)}
            className="w-24 rounded-xl border border-line bg-transparent px-3 py-2 text-base font-bold text-paper focus:border-signal focus:outline-none"
          />
          <span className="text-xs text-faint">
            {en ? `1 to ${maxMinutes} minutes, e.g. a lecture or a longer talk.` : `1 až ${maxMinutes} minút, napríklad prednáška alebo dlhší prejav.`}
          </span>
        </label>
      ) : null}
      {someLocked && balance ? (
        <p className={`mt-3 text-xs ${lockedTried ? "text-marker" : "text-faint"}`} role={lockedTried ? "status" : undefined}>
          {balance.plan === "pro"
            ? en
              ? `You have ${maxMinutes} min left this week.`
              : `Tento týždeň ti zostáva ${maxMinutes} min.`
            : en
              ? `You have ${maxMinutes} free min left.`
              : `Zostáva ti ${maxMinutes} min zadarmo.`}{" "}
          <Link href={plansHref} className="font-bold text-accent">
            {balance.plan === "pro" ? (en ? "Buy minutes" : "Dokúpiť minúty") : en ? "See plans" : "Pozrieť plány"}
          </Link>
        </p>
      ) : null}
    </section>
  );
}
