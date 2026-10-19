import { siteConfig } from "@/config/site";
import { createPortalSession, isStripeConfigured, StripeError } from "@/lib/billing/stripe";
import { getSubscription } from "@/lib/db/usage";
import { apiError, apiOk, handleRouteError, requireApiUser } from "@/lib/http/route";

/** Zákaznícky portál Stripe: zrušenie predplatného, platobná karta, faktúry. */
export async function POST() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  if (!isStripeConfigured()) return apiError(503, "not_configured", "Platby zatiaľ nie sú zapnuté.");
  try {
    const subscription = await getSubscription(user.id);
    if (!subscription?.provider_customer_id) return apiError(404, "no_customer", "Zatiaľ nemáš žiadne predplatné.");
    return apiOk({ url: await createPortalSession(subscription.provider_customer_id, `${siteConfig.url}/app/nastavenia#plan`) });
  } catch (error) {
    if (error instanceof StripeError) {
      console.error("[billing]", error.message);
      return apiError(502, "billing_failed", "Správu predplatného sa nepodarilo otvoriť. Skús to o chvíľu.");
    }
    return handleRouteError(error, "billing.portal");
  }
}
