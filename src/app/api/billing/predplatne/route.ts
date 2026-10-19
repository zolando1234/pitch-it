import { siteConfig } from "@/config/site";
import { activePlan, isInterval, isPaidPlan, parseSeats, TEAM_MAX_SEATS, teamDiscountPercent } from "@/lib/billing/pricing";
import { promoErrorMessage, resolvePromo } from "@/lib/billing/promo";
import { changeSubscriptionPlan, createPortalSession, createSubscriptionCheckout, isStripeConfigured, StripeError } from "@/lib/billing/stripe";
import { getMembership, getOwnedTeam, teamHeadcount } from "@/lib/db/teams";
import { minPaidSeats } from "@/lib/teams/core";
import { getSubscription } from "@/lib/db/usage";
import { trackEvent } from "@/lib/events/track";
import { getLocale } from "@/lib/i18n/server";
import { apiError, apiOk, handleRouteError, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";
import { getAdminDb } from "@/lib/store/client";

/**
 * Predplatné Pro alebo Unlimited (mesačne/ročne). Bez predplatného → Stripe Checkout,
 * s iným plánom → zmena plánu (rozdiel sa doúčtuje), s tým istým → zákaznícky portál.
 */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  if (!isStripeConfigured()) return apiError(503, "not_configured", "Platby zatiaľ nie sú zapnuté.");
  const limited = rateLimited(user.id, "subscription", RATE_LIMITS.micLink);
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as { plan?: unknown; interval?: unknown; code?: unknown; seats?: unknown } | null;
  if (!isPaidPlan(body?.plan) || !isInterval(body?.interval)) return apiError(400, "invalid_request", "Neznámy plán.");
  const { plan, interval } = body;
  const requestedSeats = body.seats === undefined ? null : parseSeats(body.seats);
  if (body.seats !== undefined && requestedSeats === null) return apiError(400, "invalid_request", `Počet účtov musí byť 1 až ${TEAM_MAX_SEATS}.`);

  try {
    if (await getMembership(user.id)) return apiError(409, "team_member", "Tréning ti platí tvoj tím. Plán mení vlastník tímu.");
    const locale = await getLocale();
    const subscription = await getSubscription(user.id);
    const returnUrl = `${siteConfig.url}/app/nastavenia#plan`;
    const current = activePlan(subscription);
    const currentSeats = current === "free" ? 1 : Math.max(1, subscription?.seats ?? 1);
    // bez zadaného počtu sa ponechá súčasný (zmena plánu v Nastaveniach)
    const seats = requestedSeats ?? currentSeats;

    // tímový plán musí pokryť vlastníka, členov aj čakajúce pozvánky
    const team = await getOwnedTeam(user.id);
    if (team) {
      const headcount = await teamHeadcount(team.id);
      const min = minPaidSeats(headcount.members, headcount.invites);
      if (seats < min) {
        return apiError(
          409,
          "seats_too_few",
          locale === "en"
            ? `Your team has ${min} accounts including you and pending invitations. Pay for at least ${min}, or remove members first.`
            : `Tím má aj s tebou a čakajúcimi pozvánkami ${min} účtov. Zaplať aspoň ${min} alebo najprv odober členov.`,
        );
      }
    }

    if (current !== "free" && subscription?.provider_subscription_id) {
      if (current === plan && subscription.interval === interval && seats === currentSeats && subscription.provider_customer_id) {
        return apiOk({ url: await createPortalSession(subscription.provider_customer_id, returnUrl) });
      }
      await changeSubscriptionPlan(subscription.provider_subscription_id, plan, interval, { from: currentSeats, to: seats });
      // webhook to potvrdí; plán zapíšeme hneď, aby sa prejavil bez čakania
      await getAdminDb().from("subscriptions").update({ plan, interval, seats, cancel_at_period_end: false }).eq("user_id", user.id);
      await trackEvent(user.id, "plan_changed", { from: current, to: plan, interval, seats });
      return apiOk({ changed: true });
    }

    // zľavový kód len pri novom predplatnom; platí iba pre prvé predplatné používateľa
    const promo = resolvePromo(body.code, interval, Boolean(subscription?.provider_subscription_id));
    if (promo && !promo.ok) return apiError(400, "invalid_promo", promoErrorMessage(promo.reason, locale));
    if (promo && teamDiscountPercent(seats) > 0) {
      return apiError(
        400,
        "invalid_promo",
        locale === "en" ? "A discount code can't be combined with the team discount." : "Zľavový kód sa nedá spojiť s tímovou zľavou.",
      );
    }

    const url = await createSubscriptionCheckout({
      userId: user.id,
      email: user.email,
      customerId: subscription?.provider_customer_id ?? null,
      plan,
      interval,
      successUrl: `${siteConfig.url}/app/nastavenia?platba=ok#plan`,
      cancelUrl: returnUrl,
      locale,
      promo: promo?.promo ?? null,
      seats,
    });
    await trackEvent(user.id, "checkout_started", { kind: "subscription", plan, interval, seats, promo_code: promo?.promo.code ?? null });
    return apiOk({ url });
  } catch (error) {
    if (error instanceof StripeError) {
      console.error("[billing]", error.message);
      return apiError(502, "billing_failed", "Platobnú bránu sa nepodarilo otvoriť. Skús to o chvíľu.");
    }
    return handleRouteError(error, "billing.subscription");
  }
}
