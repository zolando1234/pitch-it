/*
  Plány a mesačné limity. Limity vychádzajú z odhadu nákladov (docs/decision-log.md, D8).
  Cena Pro je hypotéza na overenie, nie fakt.
*/

export type PlanId = "free" | "pro";

export type PlanLimits = {
  realtimeMinutes: number;
  reports: number;
  deckAnalyses: number;
  textTurns: number;
  exerciseEvaluations: number;
  hints: number;
  projects: number;
  maxSessionMinutes: number;
};

export type Plan = {
  id: PlanId;
  name: string;
  priceMonthlyEur: number;
  tagline: string;
  limits: PlanLimits;
  features: string[];
};

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: "free",
    name: "Free",
    priceMonthlyEur: 0,
    tagline: "Vyskúšaj si simuláciu na vlastných podkladoch.",
    limits: {
      realtimeMinutes: 20,
      reports: 3,
      deckAnalyses: 2,
      textTurns: 60,
      exerciseEvaluations: 10,
      hints: 15,
      projects: 1,
      maxSessionMinutes: 12,
    },
    features: [
      "20 minút hlasového tréningu mesačne",
      "3 reporty po tréningu",
      "1 projekt a analýza 2 podkladov",
      "Cvičenia z tvojich slabých miest",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    priceMonthlyEur: 29,
    tagline: "Pre foundera, ktorý sa pripravuje na konkrétne stretnutia.",
    limits: {
      realtimeMinutes: 180,
      reports: 40,
      deckAnalyses: 20,
      textTurns: 600,
      exerciseEvaluations: 200,
      hints: 200,
      projects: 10,
      maxSessionMinutes: 30,
    },
    features: [
      "180 minút hlasového tréningu mesačne",
      "40 reportov mesačne",
      "Až 10 projektov a 20 analýz podkladov",
      "Partner meeting a due diligence scenáre do 30 minút",
      "Porovnanie pokroku medzi tréningmi",
    ],
  },
};

export type UsageKind =
  | "realtime_seconds"
  | "text_turn"
  | "report"
  | "deck_analysis"
  | "exercise_evaluation"
  | "hint"
  | "transcription_seconds"
  /** nahraté sekundy prejavu (týždenný limit Pro), zapisuje sa na toho, kto platí */
  | "speech_seconds";

export type UsageTotals = Record<UsageKind, number>;

export function emptyUsage(): UsageTotals {
  return {
    realtime_seconds: 0,
    text_turn: 0,
    report: 0,
    deck_analysis: 0,
    exercise_evaluation: 0,
    hint: 0,
    transcription_seconds: 0,
    speech_seconds: 0,
  };
}

/** Začiatok aktuálneho fakturačného obdobia (kalendárny mesiac v UTC). */
export function periodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export type Entitlement =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: "limit_reached" | "subscription_inactive"; remaining: 0 };

const LIMIT_FOR: Record<Exclude<UsageKind, "realtime_seconds" | "transcription_seconds" | "speech_seconds">, keyof PlanLimits> = {
  text_turn: "textTurns",
  report: "reports",
  deck_analysis: "deckAnalyses",
  exercise_evaluation: "exerciseEvaluations",
  hint: "hints",
};

/** Zostávajúce sekundy realtime hlasu v období. */
export function remainingRealtimeSeconds(plan: Plan, usage: UsageTotals): number {
  return Math.max(0, plan.limits.realtimeMinutes * 60 - usage.realtime_seconds);
}

export function checkEntitlement(
  plan: Plan,
  usage: UsageTotals,
  kind: Exclude<UsageKind, "transcription_seconds" | "speech_seconds">,
  subscriptionActive = true,
): Entitlement {
  if (!subscriptionActive) return { allowed: false, reason: "subscription_inactive", remaining: 0 };
  if (kind === "realtime_seconds") {
    const remaining = remainingRealtimeSeconds(plan, usage);
    // Menej ako 30 sekúnd na rozhovor nestačí.
    return remaining >= 30 ? { allowed: true, remaining } : { allowed: false, reason: "limit_reached", remaining: 0 };
  }
  const limit = plan.limits[LIMIT_FOR[kind]];
  const remaining = Math.max(0, limit - usage[kind]);
  return remaining > 0 ? { allowed: true, remaining } : { allowed: false, reason: "limit_reached", remaining: 0 };
}

/** Pro plán platí iba pri aktívnom predplatnom; inak sa uplatnia limity Free. */
export function effectivePlan(subscription: { plan: string; status: string } | null): Plan {
  // staršie limity (projekty, AI investor): Pro aj Unlimited dostanú limity Pro
  if ((subscription?.plan === "pro" || subscription?.plan === "unlimited") && (subscription.status === "active" || subscription.status === "trialing")) {
    return PLANS.pro;
  }
  return PLANS.free;
}

/** Maximálna dĺžka relácie v sekundách podľa plánu, scenára a zostatku. */
export function sessionSecondsAllowed(plan: Plan, requestedMinutes: number, remainingSeconds: number): number {
  const capped = Math.min(requestedMinutes, plan.limits.maxSessionMinutes) * 60;
  return Math.max(0, Math.min(capped, remainingSeconds));
}
