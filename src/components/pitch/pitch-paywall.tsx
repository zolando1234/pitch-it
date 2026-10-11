"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FREE_PITCHES, PITCH_PACK, PITCH_PROMO, formatEur, type PitchBalance } from "@/lib/billing/pitch-pack";

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
  return (
    <span className="whitespace-nowrap">
      <s className="opacity-60">{formatEur(PITCH_PACK.priceCents)}</s> {formatEur(PITCH_PROMO.priceCents)} s kódom {PITCH_PROMO.code}
    </span>
  );
}

/** Otvorí Stripe Checkout pre balík pitchov. */
export function useBuyPitchPack() {
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
      setError(data?.error?.message ?? "Platbu sa nepodarilo otvoriť. Skús to znova.");
    } catch {
      setError("Nepodarilo sa spojiť so serverom.");
    }
    setPending(false);
  };
  return { buy, pending, error };
}

/** Samostatné tlačidlo nákupu (napr. v Nastaveniach). */
export function BuyPitchPackButton() {
  const { buy, pending, error } = useBuyPitchPack();
  return (
    <div>
      <button
        type="button"
        onClick={() => void buy()}
        disabled={pending}
        className="rounded-full bg-signal px-7 py-3.5 text-base font-bold text-on-signal transition hover:bg-signal-hover disabled:opacity-50"
      >
        {pending ? (
          "Otváram platbu…"
        ) : (
          <>
            Kúpiť {PITCH_PACK.credits} pitchov · <PromoPrice />
          </>
        )}
      </button>
      <p className="mt-2 text-[13px] text-faint">
        Jednorazovo, bez predplatného. Kód <b>{PITCH_PROMO.code}</b> zadaj pri platbe do poľa „Pridať propagačný kód“.
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

  if (confirming) {
    return (
      <div className="rounded-3xl border border-signal/50 bg-signal/10 p-6 md:p-8" role="status">
        <p className="h text-2xl">Ďakujeme za platbu.</p>
        <p className="mt-2 animate-pulse text-mute">Pripisujeme ti pitche, potrvá to pár sekúnd…</p>
      </div>
    );
  }

  return (
    <section className="rounded-3xl border-2 border-signal p-6 md:p-8" aria-labelledby="paywall-nadpis">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">Pitche zadarmo sú minuté</p>
      <h2 id="paywall-nadpis" className="h mt-3 text-3xl leading-tight md:text-4xl">
        Trénuj ďalej s balíkom {PITCH_PACK.credits} pitchov.
      </h2>
      <p className="mt-3 max-w-2xl text-lg text-mute">
        Využil si {FREE_PITCHES} pitche zadarmo. Každý ďalší pitch má rovnakú analýzu: reč tela, tempo, vypĺňacie slová, obsah a zhodu s osnovou.
      </p>
      <div className="mt-6 flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <p className="h text-5xl">
            <s className="text-3xl text-mute">{formatEur(PITCH_PACK.priceCents)}</s> {formatEur(PITCH_PROMO.priceCents)}
          </p>
          <p className="mt-1 text-sm text-mute">
            s kódom <b className="text-paper">{PITCH_PROMO.code}</b> · jednorazovo za {PITCH_PACK.credits} pitchov, bez predplatného
          </p>
        </div>
        <button
          type="button"
          onClick={() => void buy()}
          disabled={pending || !paymentsEnabled}
          className="rounded-full bg-signal px-10 py-5 text-xl font-bold text-on-signal transition hover:bg-signal-hover disabled:opacity-40"
        >
          {pending ? (
            "Otváram platbu…"
          ) : (
            <>
              Kúpiť {PITCH_PACK.credits} pitchov · <PromoPrice /> →
            </>
          )}
        </button>
      </div>
      <p className="mt-4 text-sm text-faint">
        Kód <b>{PITCH_PROMO.code}</b> zadaj v ďalšom kroku pri platbe do poľa „Pridať propagačný kód“. Platbu spracúva Stripe.
      </p>
      {!paymentsEnabled ? <p className="mt-3 text-sm text-marker">Platby zatiaľ nie sú zapnuté.</p> : null}
      {error ? (
        <p role="alert" className="mt-3 text-coral">
          {error}
        </p>
      ) : null}
    </section>
  );
}
