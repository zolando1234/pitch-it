import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import { getStripeConfig } from "@/config/server-env";

/*
  Minimálna integrácia Stripe cez REST (bez SDK): Checkout, zákaznícky portál
  a overenie podpisu webhooku. Bez kľúčov sa nič nevolá a UI ukáže, že platby nie sú zapnuté.
*/

const API = "https://api.stripe.com/v1";
const SIGNATURE_TOLERANCE_SECONDS = 300;

export class StripeError extends Error {
  readonly code: "not_configured" | "request_failed" | "invalid_signature";

  constructor(code: "not_configured" | "request_failed" | "invalid_signature", message: string) {
    super(message);
    this.code = code;
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
    throw new StripeError("request_failed", `Stripe ${path} ${response.status}: ${detail.slice(0, 200)}`);
  }
  return (await response.json()) as T;
}

export function isStripeConfigured(): boolean {
  return getStripeConfig() !== null;
}

export async function createCheckoutSession(input: {
  userId: string;
  email: string | null;
  customerId: string | null;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const config = getStripeConfig();
  if (!config?.proPriceId) throw new StripeError("not_configured", "Platby nie sú nakonfigurované.");
  const params: Record<string, string> = {
    mode: "subscription",
    "line_items[0][price]": config.proPriceId,
    "line_items[0][quantity]": "1",
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    "subscription_data[metadata][user_id]": input.userId,
    "metadata[user_id]": input.userId,
    allow_promotion_codes: "true",
    locale: "sk",
  };
  if (input.customerId) params.customer = input.customerId;
  else if (input.email) params.customer_email = input.email;
  const session = await stripePost<{ url?: string }>("/checkout/sessions", params);
  if (!session.url) throw new StripeError("request_failed", "Stripe nevrátil adresu platby.");
  return session.url;
}

/** Jednorazová platba za balík pitchov. Zľavový kód (napr. SWZA) sa dá zadať priamo v Checkoute. */
export async function createPitchPackCheckout(input: {
  userId: string;
  email: string | null;
  successUrl: string;
  cancelUrl: string;
  pack: { credits: number; priceCents: number; currency: string; name: string };
}): Promise<string> {
  const params: Record<string, string> = {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": input.pack.currency,
    "line_items[0][price_data][unit_amount]": String(input.pack.priceCents),
    "line_items[0][price_data][product_data][name]": input.pack.name,
    "line_items[0][price_data][product_data][description]": `${input.pack.credits} nahraných pitchov s analýzou a reportom`,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.userId,
    "metadata[user_id]": input.userId,
    "metadata[kind]": "pitch_pack",
    "metadata[credits]": String(input.pack.credits),
    "payment_intent_data[metadata][user_id]": input.userId,
    allow_promotion_codes: "true",
    locale: "sk",
  };
  if (input.email) params.customer_email = input.email;
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
  items?: { data?: Array<{ current_period_end?: number }> };
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
