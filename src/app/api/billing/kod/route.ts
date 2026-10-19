import { promoErrorMessage, resolvePromo } from "@/lib/billing/promo";
import { getSubscription } from "@/lib/db/usage";
import { getLocale } from "@/lib/i18n/server";
import { apiError, apiOk, handleRouteError, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Náhľad zľavového kódu pred platbou: percento a obdobie, na ktoré platí (zoznam kódov ostáva na serveri). */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "promo-check", RATE_LIMITS.promoCheck);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
  try {
    const locale = await getLocale();
    const subscription = await getSubscription(user.id);
    const result = resolvePromo(body?.code, null, Boolean(subscription?.provider_subscription_id));
    if (!result) return apiError(400, "invalid_request", locale === "en" ? "Enter a code." : "Zadaj kód.");
    if (!result.ok) return apiError(400, "invalid_promo", promoErrorMessage(result.reason, locale));
    return apiOk({ code: result.promo.code, percentOff: result.promo.percentOff, interval: result.promo.interval });
  } catch (error) {
    return handleRouteError(error, "billing.promo_check");
  }
}
