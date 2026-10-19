import "server-only";

import {
  checkEntitlement,
  effectivePlan,
  emptyUsage,
  periodStart,
  type Entitlement,
  type Plan,
  type UsageKind,
  type UsageTotals,
} from "@/lib/billing/plans";
import { check } from "@/lib/db/core";
import type { SubscriptionRow } from "@/lib/db/types";
import { getAdminDb, getUserDb } from "@/lib/store/client";

export async function getSubscription(userId: string): Promise<SubscriptionRow | null> {
  const db = await getUserDb();
  const { data, error } = await db
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle<SubscriptionRow>();
  check({ error }, "subscriptions.get");
  return data;
}

export async function getUsageTotals(userId: string, since: Date): Promise<UsageTotals> {
  const db = await getUserDb();
  const { data, error } = await db
    .from("usage_events")
    .select("kind, quantity")
    .eq("user_id", userId)
    .gte("created_at", since.toISOString())
    .limit(10_000);
  check({ error }, "usage.totals");
  const totals = emptyUsage();
  for (const row of (data ?? []) as Array<{ kind: UsageKind; quantity: number }>) {
    if (row.kind in totals) totals[row.kind] += row.quantity;
  }
  return totals;
}

export type BillingContext = {
  plan: Plan;
  subscription: SubscriptionRow | null;
  usage: UsageTotals;
  periodStart: Date;
};

export async function getBillingContext(userId: string, now = new Date()): Promise<BillingContext> {
  const start = periodStart(now);
  const [subscription, usage] = await Promise.all([getSubscription(userId), getUsageTotals(userId, start)]);
  return { plan: effectivePlan(subscription), subscription, usage, periodStart: start };
}

export async function getEntitlement(
  userId: string,
  kind: Exclude<UsageKind, "transcription_seconds" | "speech_seconds">,
): Promise<{ entitlement: Entitlement; context: BillingContext }> {
  const context = await getBillingContext(userId);
  return { entitlement: checkEntitlement(context.plan, context.usage, kind), context };
}

/** Zapíše spotrebu. Iba server (service_role). */
export async function recordUsage(
  userId: string,
  kind: UsageKind,
  quantity: number,
  sessionId: string | null = null,
): Promise<void> {
  if (quantity <= 0) return;
  const { error } = await getAdminDb()
    .from("usage_events")
    .insert({ user_id: userId, kind, quantity: Math.round(quantity), session_id: sessionId });
  check({ error }, "usage.record");
}
