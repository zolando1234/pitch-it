import { siteConfig } from "@/config/site";
import { activePlan, discountPercentFor, TOPUP } from "@/lib/billing/pricing";
import { createTopupCheckout, isStripeConfigured, StripeError } from "@/lib/billing/stripe";
import { getMembership } from "@/lib/db/teams";
import { getSubscription } from "@/lib/db/usage";
import { trackEvent } from "@/lib/events/track";
import { getLocale } from "@/lib/i18n/server";
import { apiError, apiOk, handleRouteError, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Dokúpenie minút k plánu Pro (0,17 €/min, predplatiteľ so zľavou; množstvo sa dá upraviť ešte v Checkoute). */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  if (!isStripeConfigured()) return apiError(503, "not_configured", "Platby zatiaľ nie sú zapnuté.");
  const limited = rateLimited(user.id, "minutes", RATE_LIMITS.micLink);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { minutes?: unknown } | null;
  const requested = Math.round(Number(body?.minutes ?? TOPUP.defaultMinutes));
  const minutes = Number.isFinite(requested) ? Math.min(TOPUP.maxMinutes, Math.max(TOPUP.minMinutes, requested)) : TOPUP.defaultMinutes;

  try {
    if (await getMembership(user.id)) return apiError(409, "team_member", "Tréning ti platí tvoj tím.");
    const subscription = await getSubscription(user.id);
    const plan = activePlan(subscription);
    if (plan !== "pro") return apiError(409, "not_pro", "Minúty sa dokupujú k plánu Pro.");
    const url = await createTopupCheckout({
      userId: user.id,
      email: user.email,
      customerId: subscription?.provider_customer_id ?? null,
      plan,
      minutes,
      successUrl: `${siteConfig.url}/app/nastavenia?platba=minuty#plan`,
      cancelUrl: `${siteConfig.url}/app/nastavenia#plan`,
      locale: await getLocale(),
    });
    await trackEvent(user.id, "checkout_started", { kind: "minutes", minutes, discount_percent: discountPercentFor(plan) });
    return apiOk({ url });
  } catch (error) {
    if (error instanceof StripeError) {
      console.error("[billing]", error.message);
      return apiError(502, "billing_failed", "Platobnú bránu sa nepodarilo otvoriť. Skús to o chvíľu.");
    }
    return handleRouteError(error, "billing.minutes");
  }
}
