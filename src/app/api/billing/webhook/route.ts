import { NextResponse } from "next/server";
import { getStripeConfig } from "@/config/server-env";
import { mapSubscriptionStatus, verifyWebhookSignature, type StripeSubscription } from "@/lib/billing/stripe";
import { addPitchCredits } from "@/lib/db/pitch-wallet";
import { trackEvent } from "@/lib/events/track";
import { getAdminDb } from "@/lib/store/client";
import { isUuid } from "@/lib/validation/ids";

/*
  Stripe webhook: zdroj pravdy o predplatnom. Overuje podpis, je idempotentný
  (zapisuje stav, nie prírastky) a nikdy neverí údajom z prehliadača.
*/

type StripeEvent = { id: string; type: string; data: { object: Record<string, unknown> } };

type CheckoutSession = {
  id: string;
  client_reference_id?: string;
  customer?: string;
  subscription?: string;
  payment_status?: string;
  amount_total?: number;
  metadata?: Record<string, string>;
};

/** Balík pitchov: pripíše kredity, až keď je platba naozaj zaplatená. */
async function creditPitchPack(session: CheckoutSession) {
  const userId = session.metadata?.user_id ?? session.client_reference_id;
  const credits = Number(session.metadata?.credits);
  if (!isUuid(userId) || !Number.isInteger(credits) || credits <= 0) {
    console.error("[billing] balík pitchov bez používateľa alebo počtu", session.id);
    return;
  }
  if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") return;
  if (await addPitchCredits(userId, credits, session.id)) {
    await trackEvent(userId, "purchase_completed", { kind: "pitch_pack", credits, amount: session.amount_total ?? null });
  }
}

async function upsertFromSubscription(subscription: StripeSubscription, fallbackUserId: string | null) {
  const admin = getAdminDb();
  let userId = subscription.metadata?.user_id ?? fallbackUserId;
  if (!isUuid(userId)) {
    const { data } = await admin
      .from("subscriptions")
      .select("user_id")
      .eq("provider_customer_id", subscription.customer)
      .maybeSingle<{ user_id: string }>();
    userId = data?.user_id ?? null;
  }
  if (!isUuid(userId)) {
    console.error("[billing] webhook bez používateľa pre subscription", subscription.id);
    return;
  }
  const status = mapSubscriptionStatus(subscription.status);
  const periodEnd = subscription.current_period_end ?? subscription.items?.data?.[0]?.current_period_end ?? null;
  const { error } = await admin.from("subscriptions").upsert(
    {
      user_id: userId,
      plan: status === "canceled" ? "free" : "pro",
      status,
      provider: "stripe",
      provider_customer_id: subscription.customer,
      provider_subscription_id: subscription.id,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      cancel_at_period_end: subscription.cancel_at_period_end,
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`subscriptions.upsert: ${error.message}`);
  return userId;
}

export async function POST(request: Request) {
  const config = getStripeConfig();
  if (!config) return NextResponse.json({ error: "not_configured" }, { status: 503 });

  const payload = await request.text();
  if (!verifyWebhookSignature(payload, request.headers.get("stripe-signature"), config.webhookSecret)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 400 });
  }

  let event: StripeEvent;
  try {
    event = JSON.parse(payload) as StripeEvent;
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  try {
    const session = event.data.object as unknown as CheckoutSession;
    if (event.type.startsWith("checkout.session.") && session.metadata?.kind === "pitch_pack") {
      // completed (karta) alebo async_payment_succeeded (oneskorené platobné metódy)
      if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") await creditPitchPack(session);
    } else if (event.type === "checkout.session.completed") {
      if (isUuid(session.client_reference_id) && typeof session.customer === "string") {
        await getAdminDb()
          .from("subscriptions")
          .update({ provider: "stripe", provider_customer_id: session.customer, provider_subscription_id: session.subscription ?? null })
          .eq("user_id", session.client_reference_id);
        await trackEvent(session.client_reference_id, "purchase_completed", { plan: "pro" });
      }
    } else if (event.type.startsWith("customer.subscription.")) {
      await upsertFromSubscription(event.data.object as unknown as StripeSubscription, null);
    }
    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[billing] webhook zlyhal:", error instanceof Error ? error.message : error);
    // 500 → Stripe udalosť doručí znova.
    return NextResponse.json({ error: "processing_failed" }, { status: 500 });
  }
}
