import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getStripeConfig } from "@/config/server-env";
import type { PromoCode } from "@/lib/billing/promo";
import {
  chargeCents,
  discountPercentFor,
  priceLookupKey,
  teamDiscountPercent,
  TOPUP,
  topupCentsPerMinute,
  type BillingInterval,
  type PaidPlan,
  type PlanId,
} from "@/lib/billing/pricing";

/*
  Minimálna integrácia Stripe cez REST (bez SDK): predplatné Pro/Unlimited, zmena plánu,
  dokúpené minúty, zákaznícky portál a overenie podpisu webhooku. Bez kľúčov sa nič nevolá a UI ukáže, že platby nie sú zapnuté.
*/

const API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeError extends Error {
  readonly code: "not_configured" | "request_failed" | "invalid_signature";
  /** HTTP stav odpovede Stripe (pri request_failed) */
  readonly status?: number;

  constructor(code: "not_configured" | "request_failed" | "invalid_signature", message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
    this.name = "StripeError";
  }
}

function encode(params: Record<string, string>): string {
  return new URLSearchParams(params).toString();
}

async function stripePost<T>(path: string, params: Record<string, string>): Promise<T> {
  const config = getStripeConfig();
  if (!config) throw new StripeError("not_configured", "Platby nie sú nakonfigurované.");
  const response = await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: encode(params),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new StripeError("request_failed", `Stripe ${path} ${response.status}: ${detail.slice(0, 200)}`, response.status);
  }
  return (await response.json()) as T;
}

export function isStripeConfigured(): boolean {
  return getStripeConfig() !== null;
}

async function stripeGet<T>(path: string, query: Record<string, string> = {}): Promise<T> {
  const config = getStripeConfig();
  if (!config) throw new StripeError("not_configured", "Platby nie sú nakonfigurované.");
  const qs = encode(query);
  const response = await fetch(`${API}${path}${qs ? `?${qs}` : ""}`, {
    headers: { Authorization: `Bearer ${config.secretKey}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new StripeError("request_failed", `Stripe ${path} ${response.status}: ${detail.slice(0, 200)}`, response.status);
  }
  return (await response.json()) as T;
}

const PLAN_NAMES: Record<PaidPlan, string> = { pro: "PitchIt Pro", unlimited: "PitchIt Unlimited" };
const priceCache = new Map<string, string>();

/**
 * ID ceny plánu v Stripe. Ceny sa hľadajú podľa lookup_key; ak ešte neexistujú (nový Stripe účet
 * alebo zmena cenníka), vytvoria sa. Zmena sumy v pricing.ts preto potrebuje nový lookup_key.
 */
export async function planPriceId(plan: PaidPlan, interval: BillingInterval): Promise<string> {
  const key = priceLookupKey(plan, interval);
  const cached = priceCache.get(key);
  if (cached) return cached;
  const found = await stripeGet<{ data: Array<{ id: string }> }>("/prices", { "lookup_keys[]": key, active: "true", limit: "1" });
  let id = found.data[0]?.id;
  if (!id) {
    const created = await stripePost<{ id: string }>("/prices", {
      currency: "eur",
      unit_amount: String(chargeCents(plan, interval)),
      "recurring[interval]": interval,
      "product_data[name]": PLAN_NAMES[plan],
      lookup_key: key,
      "metadata[plan]": plan,
    });
    id = created.id;
  }
  priceCache.set(key, id);
  return id;
}

const couponCache = new Set<string>();

/** Kupón v Stripe podľa nášho ID; ak ešte neexistuje, vytvorí sa (zmena zľavy potrebuje nové ID). */
async function ensureCoupon(id: string, params: Record<string, string>): Promise<string> {
  if (couponCache.has(id)) return id;
  try {
    await stripeGet(`/coupons/${encodeURIComponent(id)}`);
  } catch (error) {
    if (!(error instanceof StripeError) || error.status !== 404) throw error;
    await stripePost("/coupons", { id, ...params });
  }
  couponCache.add(id);
  return id;
}

/** Kupón zľavového kódu v Stripe (jedna platba). */
export function ensurePromoCoupon(promo: PromoCode): Promise<string> {
  return ensureCoupon(promo.couponId, {
    percent_off: String(promo.percentOff),
    duration: "once",
    name: `${promo.code} −${promo.percentOff} %`,
    "metadata[promo_code]": promo.code,
  });
}

/** Kupón množstevnej zľavy tímu (platí, kým trvá predplatné); null = 1 účet, bez zľavy. */
export async function ensureTeamCoupon(seats: number): Promise<string | null> {
  const percent = teamDiscountPercent(seats);
  if (percent <= 0) return null;
  return ensureCoupon(`pitchit_team_${percent}`, {
    percent_off: String(percent),
    duration: "forever",
    name: `Tím −${percent} %`,
    "metadata[kind]": "team",
  });
}

/**
 * Stripe Checkout pre nové predplatné (Pro alebo Unlimited, mesačne alebo ročne) pre počet účtov
 * (tím: quantity = účty, množstevná zľava kupónom), voliteľne so zľavovým kódom (nie spolu s tímovou zľavou).
 */
export async function createSubscriptionCheckout(input: {
  userId: string;
  email: string | null;
  customerId: string | null;
  plan: PaidPlan;
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  locale?: "sk" | "en";
  promo?: PromoCode | null;
  seats?: number;
}): Promise<string> {
  const seats = Math.max(1, input.seats ?? 1);
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": await planPriceId(input.plan, input.interval),
    "line_items[0][quantity]": String(seats),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    "subscription_data[metadata][user_id]": input.userId,
    "subscription_data[metadata][plan]": input.plan,
    "subscription_data[metadata][interval]": input.interval,
    "subscription_data[metadata][seats]": String(seats),
    "metadata[user_id]": input.userId,
    "metadata[kind]": "subscription",
    "metadata[plan]": input.plan,
    allow_promotion_codes: "true",
    locale: input.locale === "en" ? "en" : "sk",
  };
  const teamCoupon = await ensureTeamCoupon(seats);
  if (teamCoupon) {
    // Stripe nedovolí kupón spolu s poľom na promo kódy v Checkoute
    delete params.allow_promotion_codes;
    params["discounts[0][coupon]"] = teamCoupon;
  } else if (input.promo) {
    delete params.allow_promotion_codes;
    params["discounts[0][coupon]"] = await ensurePromoCoupon(input.promo);
    params["metadata[promo_code]"] = input.promo.code;
    params["subscription_data[metadata][promo_code]"] = input.promo.code;
  }
  if (input.customerId) params.customer = input.customerId;
  else if (input.email) params.customer_email = input.email;
  const session = await stripePost<{ url?: string }>("/checkout/sessions", params);
  if (!session.url) throw new StripeError("request_failed", "Stripe nevrátil adresu platby.");
  return session.url;
}

/**
 * Zmena plánu alebo počtu účtov existujúceho predplatného; rozdiel sa doúčtuje hneď (pomerne).
 * Pri zmene počtu účtov sa vymení aj kupón množstevnej zľavy (1 účet = bez zľavy).
 */
export async function changeSubscriptionPlan(
  subscriptionId: string,
  plan: PaidPlan,
  interval: BillingInterval,
  seats?: { from: number; to: number },
): Promise<void> {
  const subscription = await stripeGet<{ items?: { data?: Array<{ id: string }> } }>(`/subscriptions/${encodeURIComponent(subscriptionId)}`);
  const itemId = subscription.items?.data?.[0]?.id;
  if (!itemId) throw new StripeError("request_failed", "Predplatné nemá položku na zmenu.");
  const params: Record<string, string> = {
    "items[0][id]": itemId,
    "items[0][price]": await planPriceId(plan, interval),
    proration_behavior: "always_invoice",
    cancel_at_period_end: "false",
    "metadata[plan]": plan,
    "metadata[interval]": interval,
  };
  if (seats && seats.from !== seats.to) {
    params["items[0][quantity]"] = String(seats.to);
    params["metadata[seats]"] = String(seats.to);
    const coupon = await ensureTeamCoupon(seats.to);
    // tímový kupón nahradí predošlé zľavy; pri jednom účte sa zľavy zrušia (prázdna hodnota)
    if (coupon) params["discounts[0][coupon]"] = coupon;
    else if (teamDiscountPercent(seats.from) > 0) params.discounts = "";
  }
  await stripePost(`/subscriptions/${encodeURIComponent(subscriptionId)}`, params);
}

/**
 * Jednorazový nákup minút k Pro: cena za minútu (predplatiteľ so zľavou), množstvo si zákazník upraví v Checkoute.
 * Cena za minútu ide aj do metadát, aby webhook z výslednej sumy spočítal minúty.
 */
export async function createTopupCheckout(input: {
  userId: string;
  email: string | null;
  customerId: string | null;
  plan: PlanId;
  minutes: number;
  successUrl: string;
  cancelUrl: string;
  locale?: "sk" | "en";
}): Promise<string> {
  const en = input.locale === "en";
  const discount = discountPercentFor(input.plan);
  const centsPerMinute = topupCentsPerMinute(input.plan);
  const discountNote = discount > 0 ? (en ? ` Includes −${discount}% subscriber discount.` : ` S predplatiteľskou zľavou −${discount} %.`) : "";
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": String(input.minutes),
    "line_items[0][price_data][currency]": "eur",
    "line_items[0][price_data][unit_amount_decimal]": String(centsPerMinute),
    "line_items[0][price_data][product_data][name]": en ? "PitchIt: extra minutes" : "PitchIt: minúty navyše",
    "line_items[0][price_data][product_data][description]": en
      ? `Recording minutes on top of the weekly Pro limit. They don't expire.${discountNote}`
      : `Minúty nahrávania nad týždenný limit Pro. Neprepadajú.${discountNote}`,
    "line_items[0][adjustable_quantity][enabled]": "true",
    "line_items[0][adjustable_quantity][minimum]": String(TOPUP.minMinutes),
    "line_items[0][adjustable_quantity][maximum]": String(TOPUP.maxMinutes),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    "metadata[user_id]": input.userId,
    "metadata[kind]": "minutes",
    "metadata[cents_per_minute]": String(centsPerMinute),
    "metadata[discount_percent]": String(discount),
    "payment_intent_data[metadata][user_id]": input.userId,
    locale: en ? "en" : "sk",
  };
  if (input.customerId) params.customer = input.customerId;
  else if (input.email) params.customer_email = input.email;
  const session = await stripePost<{ url?: string }>("/checkout/sessions", params);
  if (!session.url) throw new StripeError("request_failed", "Stripe nevrátil adresu platby.");
  return session.url;
}

export async function createPortalSession(customerId: string, returnUrl: string): Promise<string> {
  const session = await stripePost<{ url?: string }>("/billing_portal/sessions", { customer: customerId, return_url: returnUrl });
  if (!session.url) throw new StripeError("request_failed", "Stripe nevrátil adresu portálu.");
  return session.url;
}

/** Overí hlavičku Stripe-Signature (HMAC-SHA256 nad „t.payload“). */
export function verifyWebhookSignature(payload: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((part) => {
      const [key, ...rest] = part.split("=");
      return [key.trim(), rest.join("=")];
    }),
  ) as Record<string, string>;
  const timestamp = Number(parts.t);
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > SIGNATURE_TOLERANCE_SECONDS) return false;
  const signatures = header
    .split(",")
    .filter((part) => part.trim().startsWith("v1="))
    .map((part) => part.trim().slice(3));
  const expected = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(expected, "hex"));
  });
}

export type StripeSubscription = {
  id: string;
  customer: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end?: number;
  items?: { data?: Array<{ quantity?: number; current_period_end?: number; price?: { lookup_key?: string | null; recurring?: { interval?: string } | null } }> };
  metadata?: Record<string, string>;
};

/** Stav Stripe → stav v našej tabuľke subscriptions. */
export function mapSubscriptionStatus(status: string): "active" | "trialing" | "past_due" | "canceled" | "incomplete" {
  switch (status) {
    case "active":
    case "trialing":
    case "past_due":
    case "incomplete":
      return status;
    case "unpaid":
      return "past_due";
    default:
      return "canceled";
  }
}
