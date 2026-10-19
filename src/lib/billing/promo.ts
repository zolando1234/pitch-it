import "server-only";

import type { BillingInterval } from "@/lib/billing/pricing";

/*
  Zľavové kódy na predplatné (zadávajú sa v aplikácii pred Checkoutom). Zoznam je len na serveri,
  aby sa kódy nedostali do JavaScriptu v prehliadači. Kód sa vypína prepnutím `active` na false.
  Zľava platí na jednu platbu (Stripe kupón s duration=once); predĺžiť ju jednotlivcovi
  sa dá ručne v Stripe (kupón na predplatné). Kód platí len pre prvé predplatné používateľa.
  Čisté funkcie, testované.
*/

export type PromoCode = {
  /** kód, ktorý používateľ zadá (na veľkosti písmen nezáleží) */
  code: string;
  percentOff: number;
  /** na aké obdobie platby kód platí */
  interval: BillingInterval;
  active: boolean;
  /** ID kupónu v Stripe; zmena zľavy potrebuje nové ID */
  couponId: string;
};

export const PROMO_CODES: readonly PromoCode[] = [
  { code: "TESTER", percentOff: 60, interval: "month", active: true, couponId: "pitchit_tester_60_once" },
];

export type PromoResult =
  | { ok: true; promo: PromoCode }
  | { ok: false; reason: "unknown" | "wrong_interval" | "already_subscribed" };

const normalize = (code: string) => code.trim().toUpperCase();

/** Overí zadaný kód pre nové predplatné; null = kód nezadaný. */
export function resolvePromo(
  input: unknown,
  interval: BillingInterval,
  hadSubscription: boolean,
  codes: readonly PromoCode[] = PROMO_CODES,
): PromoResult | null {
  if (typeof input !== "string" || normalize(input) === "") return null;
  const promo = codes.find((c) => c.active && normalize(c.code) === normalize(input));
  if (!promo) return { ok: false, reason: "unknown" };
  if (promo.interval !== interval) return { ok: false, reason: "wrong_interval" };
  if (hadSubscription) return { ok: false, reason: "already_subscribed" };
  return { ok: true, promo };
}

/** Text chyby pre používateľa. */
export function promoErrorMessage(reason: Exclude<PromoResult, { ok: true }>["reason"], locale: "sk" | "en" = "sk"): string {
  const en = locale === "en";
  switch (reason) {
    case "unknown":
      return en ? "This discount code is not valid." : "Tento zľavový kód neplatí.";
    case "wrong_interval":
      return en ? "This code only works with monthly billing." : "Tento kód platí len na mesačné predplatné.";
    case "already_subscribed":
      return en ? "This code is only for your first subscription." : "Tento kód platí len na prvé predplatné.";
  }
}
