"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PlanPicker, TopupButton } from "@/components/billing/plan-picker";
import { useLocale } from "@/components/i18n/locale-provider";
import type { PitchBalance } from "@/lib/billing/pitch-pack";
import { FREE_SECONDS, nextWeekStart } from "@/lib/billing/pricing";

const PAY = {
  sk: {
    thanks: "Ďakujeme za platbu.",
    crediting: "Aktivujeme ti plán, potrvá to pár sekúnd…",
    freeUsedUp: "Minúty zadarmo sú minuté",
    freeHeading: "Trénuj ďalej s plánom Pro alebo Unlimited.",
    freeExplain: (m: number) => `Využil si ${m} minút zadarmo. Platený plán ti odomkne pravidelný tréning so všetkými typmi prejavov a celým reportom.`,
    weekUsedUp: "Týždenné minúty sú minuté",
    weekHeading: "Dokúp si minúty alebo prejdi na Unlimited.",
    weekExplain: (reset: string) => `Nové minúty dostaneš ${reset}. Dovtedy si môžeš dokúpiť minúty navyše.`,
    teamUsedUp: "Tímové minúty sú minuté",
    teamAsk: (team: string) => `Tréning ti platí tím ${team}.`,
    teamOwner: (owner: string) => `Požiadaj vlastníka tímu (${owner}), aby rozšíril plán.`,
  },
  en: {
    thanks: "Thank you for your payment.",
    crediting: "Activating your plan, this takes a few seconds…",
    freeUsedUp: "Your free minutes are used up",
    freeHeading: "Keep training with Pro or Unlimited.",
    freeExplain: (m: number) => `You've used your ${m} free minutes. A paid plan unlocks regular practice with all training types and the full report.`,
    weekUsedUp: "This week's minutes are used up",
    weekHeading: "Buy extra minutes or switch to Unlimited.",
    weekExplain: (reset: string) => `You get new minutes ${reset}. Until then you can buy extra minutes.`,
    teamUsedUp: "Your team is out of minutes",
    teamAsk: (team: string) => `Your training is paid for by the team ${team}.`,
    teamOwner: (owner: string) => `Ask the team owner (${owner}) to extend the plan.`,
  },
};

/** Člen firemného tímu: pitche platí vlastník tímu. */
export type PitchTeam = { name: string; ownerEmail: string | null };

export { balanceLabel } from "@/lib/billing/pitch-pack";

/*
  Paywall nahrávania: keď minú minúty zadarmo (Free) alebo týždenné minúty (Pro),
  ponúkne plány, dokúpenie minút; člen tímu dostane kontakt na vlastníka.
*/

/** Zostatok pitchov. Načíta sa znova vždy, keď sa obrazovka ukáže (aj po návrate z reportu alebo z platby). */
export function usePitchBalance(initial: PitchBalance | null, waitingForPayment: boolean) {
  const [balance, setBalance] = useState(initial);
  const [paymentsEnabled, setPaymentsEnabled] = useState(true);
  const [team, setTeam] = useState<PitchTeam | null>(null);
  // Hlášku „Pripisujeme…“ ukážeme, len kým nie je z čoho pitchovať. Webhook býva rýchlejší
  // ako návrat zo Stripe, vtedy sú pitche pripísané už pri načítaní a netreba čakať.
  const [confirming, setConfirming] = useState(waitingForPayment && !(initial?.canPitch ?? false));
  const startCredits = useRef(initial?.credits ?? 0);
  const blocking = !(initial?.canPitch ?? false);

  const reload = useCallback(async () => {
    try {
      const response = await fetch("/api/billing/pitche", { cache: "no-store" });
      if (!response.ok) return null;
      const data = (await response.json()) as { balance: PitchBalance; paymentsEnabled: boolean; team?: PitchTeam | null };
      setBalance(data.balance);
      setPaymentsEnabled(data.paymentsEnabled);
      setTeam(data.team ?? null);
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

  return { balance, paymentsEnabled, team, confirming, reload };
}

export function PitchPaywall({
  paymentsEnabled,
  confirming,
  team = null,
  balance = null,
}: {
  paymentsEnabled: boolean;
  confirming: boolean;
  team?: PitchTeam | null;
  balance?: PitchBalance | null;
}) {
  const locale = useLocale();
  const tx = PAY[locale];

  if (team) {
    return (
      <section className="rounded-3xl border-2 border-signal p-6 md:p-8" aria-labelledby="paywall-nadpis">
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">{tx.teamUsedUp}</p>
        <h2 id="paywall-nadpis" className="h mt-3 text-3xl leading-tight md:text-4xl">
          {tx.teamAsk(team.name)}
        </h2>
        {team.ownerEmail ? <p className="mt-3 max-w-2xl text-lg text-mute">{tx.teamOwner(team.ownerEmail)}</p> : null}
      </section>
    );
  }

  if (confirming) {
    return (
      <div className="rounded-3xl border border-signal/50 bg-signal/10 p-6 md:p-8" role="status">
        <p className="h text-2xl">{tx.thanks}</p>
        <p className="mt-2 animate-pulse text-mute">{tx.crediting}</p>
      </div>
    );
  }

  const pro = balance?.plan === "pro";
  const reset = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sk-SK", { weekday: "long", day: "numeric", month: "long" }).format(nextWeekStart(new Date()));
  return (
    <section className="rounded-3xl border-2 border-signal p-6 md:p-8" aria-labelledby="paywall-nadpis">
      <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">{pro ? tx.weekUsedUp : tx.freeUsedUp}</p>
      <h2 id="paywall-nadpis" className="h mt-3 text-3xl leading-tight md:text-4xl">
        {pro ? tx.weekHeading : tx.freeHeading}
      </h2>
      <p className="mt-3 max-w-2xl text-lg text-mute">{pro ? tx.weekExplain(reset) : tx.freeExplain(FREE_SECONDS / 60)}</p>
      {pro ? (
        <div className="mt-6">
          <TopupButton />
        </div>
      ) : null}
      <div className="mt-8">
        <PlanPicker mode="app" current={balance?.plan ?? "free"} paymentsEnabled={paymentsEnabled} showFree={false} />
      </div>
    </section>
  );
}
