/*
  Cenník pre jednotlivcov (firmy majú vlastný cenník, zatiaľ cez firemný tím):
  - Free: 10 minút nahrávania zadarmo po registrácii (raz navždy), rozdelí si ich, ako chce.
  - Pro: plný prístup, 60 minút nahrávania týždenne, minúty navyše za 0,17 €/min
    (predplatiteľ má na ne zľavu SUBSCRIBER_DISCOUNT_PERCENT).
  - Unlimited: plný prístup bez časového limitu.
  Ročná platba je lacnejšia (cena za mesiac pri ročnej platbe). Čisté funkcie, testované.
*/

export type PaidPlan = "pro" | "unlimited";
export type PlanId = "free" | PaidPlan;
export type BillingInterval = "month" | "year";

/** sekundy nahrávania zadarmo po registrácii (raz navždy) */
export const FREE_SECONDS = 10 * 60;
/** Pro: minúty nahrávania za týždeň (pondelok až nedeľa) */
export const PRO_WEEKLY_SECONDS = 60 * 60;

export const PLAN_PRICES: Record<PaidPlan, { monthlyCents: number; yearlyMonthlyCents: number }> = {
  pro: { monthlyCents: 1000, yearlyMonthlyCents: 800 },
  unlimited: { monthlyCents: 2500, yearlyMonthlyCents: 1800 },
};

/** Dokúpené minúty (len k Pro): cena za minútu a rozsah jedného nákupu. */
export const TOPUP = { centsPerMinute: 17, minMinutes: 10, maxMinutes: 600, defaultMinutes: 60 } as const;

/** Zľava v percentách na nákupy navyše (dokúpené minúty) pre používateľov s aktívnym predplatným. */
export const SUBSCRIBER_DISCOUNT_PERCENT = 10;

/** Zľava, ktorá patrí plánu (Free nemá predplatné, takže nič). */
export const discountPercentFor = (plan: PlanId) => (plan === "free" ? 0 : SUBSCRIBER_DISCOUNT_PERCENT);

/** Cena minúty navyše v centoch po zľave; môže mať desatiny (0,17 € − 10 % = 15,3 centa, Stripe berie unit_amount_decimal). */
export function topupCentsPerMinute(plan: PlanId): number {
  return (TOPUP.centsPerMinute * (100 - discountPercentFor(plan))) / 100;
}

/** Cena nákupu minút: pôvodná suma, suma po zľave (zaokrúhlená na centy ako v Stripe) a percento zľavy. */
export function topupPrice(minutes: number, plan: PlanId): { fullCents: number; cents: number; discountPercent: number } {
  const discountPercent = discountPercentFor(plan);
  const fullCents = minutes * TOPUP.centsPerMinute;
  return { fullCents, cents: Math.round((fullCents * (100 - discountPercent)) / 100), discountPercent };
}

/*
  Tímový plán: vlastník tímu platí plán za počet účtov (vrátane seba), Stripe quantity = účty.
  Množstevná zľava podľa počtu účtov: viac ako 1 → 10 %, viac ako 5 → 13 %, viac ako 10 → 15 %.
*/
export const TEAM_DISCOUNT_TIERS: ReadonlyArray<{ minSeats: number; percent: number }> = [
  { minSeats: 11, percent: 15 },
  { minSeats: 6, percent: 13 },
  { minSeats: 2, percent: 10 },
];
/** najviac účtov v tímovom pláne (vlastník + TEAM_MAX_MEMBERS v teams/core.ts) */
export const TEAM_MAX_SEATS = 51;

/** Množstevná zľava tímu v percentách (1 účet = bez zľavy). */
export function teamDiscountPercent(seats: number): number {
  return TEAM_DISCOUNT_TIERS.find((tier) => seats >= tier.minSeats)?.percent ?? 0;
}

/** Platný počet účtov (celé číslo 1 až TEAM_MAX_SEATS), inak null. */
export function parseSeats(value: unknown): number | null {
  const seats = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof seats === "number" && Number.isInteger(seats) && seats >= 1 && seats <= TEAM_MAX_SEATS ? seats : null;
}

/** Cena plánu za obdobie pre počet účtov: bez zľavy, po množstevnej zľave (zaokrúhlené na centy) a percento. */
export function teamChargeCents(plan: PaidPlan, interval: BillingInterval, seats: number): { fullCents: number; cents: number; discountPercent: number } {
  const discountPercent = teamDiscountPercent(seats);
  const fullCents = chargeCents(plan, interval) * seats;
  return { fullCents, cents: Math.round((fullCents * (100 - discountPercent)) / 100), discountPercent };
}

/** Suma, ktorú Stripe účtuje za jedno obdobie. */
export function chargeCents(plan: PaidPlan, interval: BillingInterval): number {
  const price = PLAN_PRICES[plan];
  return interval === "year" ? price.yearlyMonthlyCents * 12 : price.monthlyCents;
}

/** Úspora ročnej platby v percentách (zaokrúhlená). */
export function yearlySavingPercent(plan: PaidPlan): number {
  const price = PLAN_PRICES[plan];
  return Math.round((1 - price.yearlyMonthlyCents / price.monthlyCents) * 100);
}

/** Stabilný kľúč ceny v Stripe (lookup_key), napr. pitchit_pro_year. */
export const priceLookupKey = (plan: PaidPlan, interval: BillingInterval) => `pitchit_${plan}_${interval}`;

export const isPaidPlan = (value: unknown): value is PaidPlan => value === "pro" || value === "unlimited";
export const isInterval = (value: unknown): value is BillingInterval => value === "month" || value === "year";

/** Začiatok týždňa (pondelok 00:00 UTC), od ktorého sa počíta týždenný limit Pro. */
export function weekStart(now: Date): Date {
  const day = (now.getUTCDay() + 6) % 7; // pondelok = 0
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
}

/** Kedy sa týždenný limit obnoví (najbližší pondelok). */
export function nextWeekStart(now: Date): Date {
  const start = weekStart(now);
  return new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
}

/** Predplatné platí pri stave active/trialing/past_due (past_due: Stripe ešte skúša platbu). */
export function activePlan(subscription: { plan: string; status: string } | null): PlanId {
  if (!subscription || !isPaidPlan(subscription.plan)) return "free";
  return ["active", "trialing", "past_due"].includes(subscription.status) ? subscription.plan : "free";
}

/**
 * Koľko dokúpených minút znamená zaplatená suma (Stripe posiela sumu, množstvo si zákazník mení).
 * centsPerMinute je cena za minútu, za ktorú sa Checkout vytvoril (po zľave); chýba pri starších platbách.
 */
export function topupMinutesFor(amountSubtotalCents: number, centsPerMinute: number = TOPUP.centsPerMinute): number {
  const unit = Number.isFinite(centsPerMinute) && centsPerMinute > 0 && centsPerMinute <= TOPUP.centsPerMinute ? centsPerMinute : TOPUP.centsPerMinute;
  return Math.max(0, Math.round(amountSubtotalCents / unit));
}
