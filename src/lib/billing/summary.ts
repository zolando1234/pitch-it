import { balanceLabel, teamBalanceLabel, type PitchBalance } from "@/lib/billing/pitch-pack";
import { remainingRealtimeSeconds, type Plan, type UsageTotals } from "@/lib/billing/plans";
import { formatDate, plural } from "@/lib/format";

/*
  Karta plánu v bočnom paneli: jeden riadok stavu a jedna akcia.
  Iba z predplatného a čerpania, žiadna umelá naliehavosť.
*/

export type PlanSummary = {
  title: string;
  detail: string;
  action: { label: string; href: string; emphasis: "primary" | "secondary" };
};

/** Karta v bočnom paneli: plán, zostatok minút a jedna akcia. */
export function pitchSummary(balance: PitchBalance, locale: "sk" | "en" = "sk"): PlanSummary {
  const en = locale === "en";
  const plans = { label: en ? "See plans" : "Pozrieť plány", href: PLAN_HREF };
  const manage = { label: en ? "My plan" : "Môj plán", href: PLAN_HREF, emphasis: "secondary" as const };
  if (balance.plan === "unlimited") return { title: "Unlimited", detail: balanceLabel(balance, locale), action: manage };
  if (balance.plan === "pro") {
    return balance.canPitch
      ? { title: "Pro", detail: balanceLabel(balance, locale), action: manage }
      : { title: "Pro", detail: balanceLabel(balance, locale), action: { label: en ? "Buy minutes" : "Dokúpiť minúty", href: PLAN_HREF, emphasis: "primary" } };
  }
  return {
    title: "Free",
    detail: balanceLabel(balance, locale),
    action: { ...plans, emphasis: balance.canPitch ? "secondary" : "primary" },
  };
}

/** Karta člena firemného tímu: tréning platí vlastník, nákup sa neponúka. */
export function teamPitchSummary(teamName: string, balance: PitchBalance, locale: "sk" | "en" = "sk"): PlanSummary {
  const en = locale === "en";
  return {
    title: en ? `Team ${teamName}` : `Tím ${teamName}`,
    detail: teamBalanceLabel(balance, locale),
    action: { label: en ? "My team" : "Môj tím", href: "/app/tim", emphasis: "secondary" },
  };
}

export type PlanSummaryInput = {
  plan: Plan;
  usage: UsageTotals;
  subscription: { plan: "free" | "pro"; status: string; current_period_end: string | null; cancel_at_period_end: boolean } | null;
};

const PLAN_HREF = "/app/nastavenia#plan";
const DAY_MS = 24 * 60 * 60 * 1000;

export function planSummary({ plan, usage, subscription }: PlanSummaryInput, now = new Date()): PlanSummary {
  const upgrade = { label: "Upgradovať", href: PLAN_HREF, emphasis: "primary" as const };
  const manage = { label: "Spravovať plán", href: PLAN_HREF, emphasis: "secondary" as const };

  if (subscription?.plan === "pro" && subscription.status === "past_due") {
    return { title: "Pro plán", detail: "Platba neprešla", action: { ...manage, label: "Skontrolovať platbu" } };
  }

  if (plan.id === "pro") {
    const end = subscription?.current_period_end ? new Date(subscription.current_period_end) : null;
    if (subscription?.status === "trialing" && end) {
      const days = Math.max(0, Math.ceil((end.getTime() - now.getTime()) / DAY_MS));
      const left = days === 0 ? "Posledný deň" : `${days} ${plural(days, "deň zostáva", "dni zostávajú", "dní zostáva")}`;
      return { title: "Pro plán", detail: left, action: upgrade };
    }
    if (subscription?.cancel_at_period_end && end) {
      return { title: "Pro plán", detail: `Platí do ${formatDate(end)}`, action: manage };
    }
    const used = Math.ceil(usage.realtime_seconds / 60);
    return { title: "Pro plán", detail: `${used} z ${plan.limits.realtimeMinutes} min tento mesiac`, action: manage };
  }

  const remaining = Math.floor(remainingRealtimeSeconds(plan, usage) / 60);
  return {
    title: "Free plán",
    detail: remaining > 0 ? `Zostáva ${remaining} z ${plan.limits.realtimeMinutes} min` : "Minúty na tento mesiac sú minuté",
    action: upgrade,
  };
}
