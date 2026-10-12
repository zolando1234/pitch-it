import { siteConfig } from "@/config/site";
import { PITCH_PACK } from "@/lib/billing/pitch-pack";
import { createPitchPackCheckout, isStripeConfigured, StripeError } from "@/lib/billing/stripe";
import { getLocale } from "@/lib/i18n/server";
import { getPitchBalance } from "@/lib/db/pitch-wallet";
import { trackEvent } from "@/lib/events/track";
import { apiError, apiOk, handleRouteError, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Koľko pitchov používateľovi zostáva (zadarmo aj zakúpených). */
export async function GET() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  try {
    return apiOk({ balance: await getPitchBalance(user.id), paymentsEnabled: isStripeConfigured() });
  } catch (error) {
    return handleRouteError(error, "billing.pitch_balance");
  }
}

/** Presmerovanie na Stripe Checkout: jednorazová platba za balík pitchov. */
export async function POST() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  if (!isStripeConfigured()) return apiError(503, "not_configured", "Platby zatiaľ nie sú zapnuté.");
  const limited = rateLimited(user.id, "pitch-pack", RATE_LIMITS.micLink);
  if (limited) return limited;

  try {
    const url = await createPitchPackCheckout({
      userId: user.id,
      email: user.email,
      successUrl: `${siteConfig.url}/app/nahravka?platba=ok`,
      cancelUrl: `${siteConfig.url}/app/nahravka`,
      pack: PITCH_PACK,
      locale: await getLocale(),
    });
    await trackEvent(user.id, "checkout_started", { kind: "pitch_pack" });
    return apiOk({ url });
  } catch (error) {
    if (error instanceof StripeError) {
      console.error("[billing]", error.message);
      return apiError(502, "billing_failed", "Platobnú bránu sa nepodarilo otvoriť. Skús to o chvíľu.");
    }
    return handleRouteError(error, "billing.pitch_pack");
  }
}
