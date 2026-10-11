import { balanceLabel, formatEur, PITCH_PACK, type PitchBalance } from "@/lib/billing/pitch-pack";
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

/** Karta v bočnom paneli: zostatok pitchov a nákup balíka. */
export function pitchSummary(balance: PitchBalance): PlanSummary {
  const buy = { label: `Kúpiť ${PITCH_PACK.credits} pitchov`, href: PLAN_HREF };
  if (!balance.canPitch) {
    return { title: "Pitche sú minuté", detail: `Balík ${PITCH_PACK.credits} pitchov za ${formatEur(PITCH_PACK.priceCents)}`, action: { ...buy, emphasis: "primary" } };
  }
  return { title: "Tvoje pitche", detail: balanceLabel(balance), action: { ...buy, emphasis: "secondary" } };
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
