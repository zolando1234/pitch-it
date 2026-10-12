"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FREE_PITCHES, PITCH_PACK, PITCH_PROMO, formatEur, type PitchBalance } from "@/lib/billing/pitch-pack";
import { useLocale } from "@/components/i18n/locale-provider";

const PAY = {
  sk: {
    withCode: "s kódom",
    openFailed: "Platbu sa nepodarilo otvoriť. Skús to znova.",
    noServer: "Nepodarilo sa spojiť so serverom.",
    opening: "Otváram platbu…",
    buy: (n: number) => `Kúpiť ${n} pitchov`,
    codeHint: (code: string) => `Jednorazovo, bez predplatného. Kód ${code} zadaj pri platbe do poľa „Pridať propagačný kód“.`,
    thanks: "Ďakujeme za platbu.",
    crediting: "Pripisujeme ti pitche, potrvá to pár sekúnd…",
    usedUp: "Pitche zadarmo sú minuté",
    keepGoing: (n: number) => `Trénuj ďalej s balíkom ${n} pitchov.`,
    explain: (free: number) =>
      `Využil si ${free} pitche zadarmo. Každý ďalší pitch má rovnakú analýzu: reč tela, tempo, vypĺňacie slová, obsah a zhodu s osnovou.`,
    oneOff: (n: number) => `jednorazovo za ${n} pitchov, bez predplatného`,
    codeStep: (code: string) => `Kód ${code} zadaj v ďalšom kroku pri platbe do poľa „Pridať propagačný kód“. Platbu spracúva Stripe.`,
    disabled: "Platby zatiaľ nie sú zapnuté.",
  },
  en: {
    withCode: "with code",
    openFailed: "The payment could not be opened. Try again.",
    noServer: "Could not connect to the server.",
    opening: "Opening payment…",
    buy: (n: number) => `Buy ${n} pitches`,
    codeHint: (code: string) => `One-off, no subscription. Enter code ${code} at checkout in the “Add promotion code” field.`,
    thanks: "Thank you for your payment.",
    crediting: "Adding your pitches, this takes a few seconds…",
    usedUp: "Your free pitches are used up",
    keepGoing: (n: number) => `Keep training with a pack of ${n} pitches.`,
    explain: (free: number) =>
      `You've used your ${free} free pitches. Every further pitch gets the same analysis: body language, pace, filler words, content and outline match.`,
    oneOff: (n: number) => `one-off for ${n} pitches, no subscription`,
    codeStep: (code: string) => `Enter code ${code} in the next step at checkout, in the “Add promotion code” field. Payments are handled by Stripe.`,
    disabled: "Payments are not enabled yet.",
  },
};

export { balanceLabel } from "@/lib/billing/pitch-pack";

/*
  Paywall nahrávania: zostatok pitchov a nákup balíka cez Stripe Checkout.
*/

/** Zostatok pitchov. Načíta sa znova vždy, keď sa obrazovka ukáže (aj po návrate z reportu alebo z platby). */
export function usePitchBalance(initial: PitchBalance | null, waitingForPayment: boolean) {
  const [balance, setBalance] = useState(initial);
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  // Hlášku „Pripisujeme…“ ukážeme, len kým nie je z čoho pitchovať. Webhook býva rýchlejší
  // ako návrat zo Stripe, vtedy sú pitche pripísané už pri načítaní a netreba čakať.
  const [confirming, setConfirming] = useState(waitingForPayment && !(initial?.canPitch ?? false));
  const startCredits = useRef(initial?.credits ?? 0);
  const blocking = !(initial?.canPitch ?? false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/billing/pitche", { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as { balance: PitchBalance; paymentsEnabled: boolean };
      setBalance(data.balance);
      setPaymentsEnabled(data.paymentsEnabled);
      return data.balance;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (initial === null) return;
    void reload(); // eslint-disable-line react-hooks/set-state-in-effect -- stav sa nastaví až po odpovedi servera
  }, [initial, reload]);

  // po platbe Stripe pripíše kredity cez webhook o chvíľu neskôr, preto chvíľu kontrolujeme
  useEffect(() => {
    if (!waitingForPayment || initial === null) return;
    let tries = 0;
    const id = setInterval(async () => {
      tries++;
      const next = await reload();
      // bez pitchov stačí, že sa dá pitchovať; inak (nákup z Nastavení) čakáme na nové kredity
      const credited = !!next && (blocking ? next.canPitch : next.credits > startCredits.current);
      if (credited || tries >= 20) {
        clearInterval(id);
        setConfirming(false);
      }
    }, 2000);
    return () => clearInterval(id);
  }, [waitingForPayment, initial, reload, blocking]);

  return { balance, paymentsEnabled, confirming, reload };
}

/** Cena v tlačidle: pôvodná prečiarknutá a cena s kódom. */
function PromoPrice() {
  const locale = useLocale();
  return (
    <span className="whitespace-nowrap">
      <s className="opacity-60">{formatEur(PITCH_PACK.priceCents, locale)}</s> {formatEur(PITCH_PROMO.priceCents, locale)} {PAY[locale].withCode} {PITCH_PROMO.code}
    </span>
  );
}

/** Otvorí Stripe Checkout pre balík pitchov. */
export function useBuyPitchPack() {
  const tx = PAY[useLocale()];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const buy = async () => {
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/billing/pitche", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
      if (response.ok && data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data?.error?.message ?? tx.openFailed);
    } catch {
      setError(tx.noServer);
    }
    setPending(false);
  };
  return { buy, pending, error };
}

/** Samostatné tlačidlo nákupu (napr. v Nastaveniach). */
export function BuyPitchPackButton() {
  const { buy, pending, error } = useBuyPitchPack();
  const tx = PAY[useLocale()];
  return (
    <div>
      <button
        type="button"
        onClick={() => void buy()}
        disabled={pending}
        className="rounded-full bg-signal px-7 py-3.5 text-base font-bold text-on-signal transition hover:bg-signal-hover disabled:opacity-50"
      >
        {pending ? (
          tx.opening
        ) : (
          <>
            {tx.buy(PITCH_PACK.credits)} · <PromoPrice />
          </>
        )}
      </button>
      <p className="mt-2 text-[13px] text-faint">
        {tx.codeHint(PITCH_PROMO.code)}
      </p>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function PitchPaywall({ paymentsEnabled, confirming }: { paymentsEnabled: boolean; confirming: boolean }) {
  const { buy, pending, error } = useBuyPitchPack();
  const locale = useLocale();
  const tx = PAY[locale];

  if (confirming) {
    return (
      <div className="rounded-3xl border border-signal/50 bg-signal/10 p-6 md:p-8" role="status">
        <p className="h text-2xl">{tx.thanks}</p>
        <p className="mt-2 animate-pulse text-mute">{tx.crediting}</p>
      </div>
    );
  }

  return (
    <section className="rounded-3xl border-2 border-signal p-6 md:p-8" aria-labelledby="paywall-nadpis">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">{tx.usedUp}</p>
      <h2 id="paywall-nadpis" className="h mt-3 text-3xl leading-tight md:text-4xl">
        {tx.keepGoing(PITCH_PACK.credits)}
      </h2>
      <p className="mt-3 max-w-2xl text-lg text-mute">
        {tx.explain(FREE_PITCHES)}
      </p>
      <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="h text-5xl">
            <s className="text-3xl text-mute">{formatEur(PITCH_PACK.priceCents, locale)}</s> {formatEur(PITCH_PROMO.priceCents, locale)}
          </p>
          <p className="mt-1 text-sm text-mute">
            {tx.withCode} <b className="text-paper">{PITCH_PROMO.code}</b> · {tx.oneOff(PITCH_PACK.credits)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buy()}
          disabled={pending || !paymentsEnabled}
          className="rounded-full bg-signal px-10 py-5 text-xl font-bold text-on-signal transition hover:bg-signal-hover disabled:opacity-40"
        >
          {pending ? (
            tx.opening
          ) : (
            <>
              {tx.buy(PITCH_PACK.credits)} · <PromoPrice /> →
            </>
          )}
        </button>
      </div>
      <p className="mt-4 text-sm text-faint">
        {tx.codeStep(PITCH_PROMO.code)}
      </p>
      {!paymentsEnabled ? <p className="mt-3 text-sm text-marker">{tx.disabled}</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
}
