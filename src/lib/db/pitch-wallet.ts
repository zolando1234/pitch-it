import "server-only";

import { afterFreeSpeech, balanceFor, memberBalance, splitMemberSpeech, topupAfter, type PitchBalance, type PitchWallet } from "@/lib/billing/pitch-pack";
import { activePlan, weekStart, type PlanId } from "@/lib/billing/pricing";
import { check } from "@/lib/db/core";
import { billingUserId } from "@/lib/db/teams";
import type { SubscriptionRow } from "@/lib/db/types";
import { adminDb as getAdminDb } from "@/lib/store/db";
import { getKv } from "@/lib/store/kv";

/*
  Prístup k nahrávaniu: plán (predplatné), 10 minút zadarmo, týždenné minúty Pro a dokúpené minúty.
  Zapisuje iba server (analýza prejavu, Stripe webhook). Členovia firemného tímu nemajú vlastný
  prístup: čerpajú z plánu a peňaženky vlastníka tímu.
*/

async function getWallet(userId: string): Promise<PitchWallet | null> {
  const { data, error } = await getAdminDb().from("pitch_wallets").select("free_used, credits, topup_seconds, free_seconds_used").eq("user_id", userId).maybeSingle<PitchWallet>();
  check({ error }, "pitch_wallet.get");
  return data;
}

async function saveWallet(userId: string, wallet: PitchWallet): Promise<void> {
  const { error } = await getAdminDb().from("pitch_wallets").upsert({ user_id: userId, ...wallet }, { onConflict: "user_id" });
  check({ error }, "pitch_wallet.save");
}

/** Aktívny plán a počet zaplatených účtov (tímový plán) podľa predplatného. */
async function getPlanSeats(userId: string): Promise<{ plan: PlanId; seats: number }> {
  const { data, error } = await getAdminDb().from("subscriptions").select("plan, status, seats").eq("user_id", userId).maybeSingle<Pick<SubscriptionRow, "plan" | "status" | "seats">>();
  check({ error }, "subscriptions.plan");
  const plan = activePlan(data);
  return { plan, seats: plan === "free" ? 1 : Math.max(1, data?.seats ?? 1) };
}

/** Aktívny plán používateľa podľa predplatného (bez predplatného Free). */
export async function getPlan(userId: string): Promise<PlanId> {
  return (await getPlanSeats(userId)).plan;
}

/** Zaplatené účty pri aktívnom pláne (tímový plán); bez plánu null. */
export async function getPaidSeats(userId: string): Promise<number | null> {
  const { plan, seats } = await getPlanSeats(userId);
  return plan === "free" ? null : seats;
}

/** Nahraté sekundy od pondelka (týždenný limit Pro). */
async function weeklyUsedSeconds(userId: string, now: Date): Promise<number> {
  const { data, error } = await getAdminDb()
    .from("usage_events")
    .select("kind, quantity")
    .eq("user_id", userId)
    .gte("created_at", weekStart(now).toISOString())
    .limit(10_000);
  check({ error }, "usage.weekly");
  return ((data ?? []) as Array<{ kind: string; quantity: number }>).filter((r) => r.kind === "speech_seconds").reduce((sum, r) => sum + r.quantity, 0);
}

async function accessOf(payer: string, now: Date) {
  const [wallet, { plan, seats }] = await Promise.all([getWallet(payer), getPlanSeats(payer)]);
  const used = plan === "pro" ? await weeklyUsedSeconds(payer, now) : 0;
  return { wallet, plan, seats, used, balance: balanceFor({ plan, wallet, weeklyUsedSeconds: used, seats }) };
}

/**
 * Čo smie používateľ práve nahrať. Člen firemného tímu má vlastných 10 minút zadarmo
 * a po nich trénuje z plánu vlastníka tímu.
 */
export async function getPitchBalance(userId: string, now = new Date()): Promise<PitchBalance> {
  const payer = await billingUserId(userId);
  const owner = await accessOf(payer, now);
  if (payer === userId) return owner.balance;
  return memberBalance(owner.balance, await getWallet(userId));
}

async function recordSpeech(userId: string, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  const { error } = await getAdminDb().from("usage_events").insert({ user_id: userId, kind: "speech_seconds", quantity: seconds, session_id: null });
  check({ error }, "usage.speech");
}

/** Plán Pro míňa týždenné a potom dokúpené minúty; Unlimited nič. Čas sa zapisuje na toho, kto platí. */
async function chargePlan(payer: string, access: Awaited<ReturnType<typeof accessOf>>, seconds: number): Promise<void> {
  if (seconds <= 0) return;
  if (access.plan === "pro") {
    const topup = access.wallet?.topup_seconds ?? 0;
    const next = topupAfter({ weeklyUsedSeconds: access.used, topupSeconds: topup, seconds, seats: access.seats });
    if (next !== topup) await saveWallet(payer, { ...access.wallet, free_used: access.wallet?.free_used ?? 0, credits: access.wallet?.credits ?? 0, topup_seconds: next });
  }
  await recordSpeech(payer, seconds);
}

/**
 * Započíta analyzovaný prejav. Vo Free ide o čas zadarmo (alebo kredit zo staršieho balíka), v Pro minúty
 * (najprv týždenné, potom dokúpené). Člen tímu míňa najprv vlastných 10 minút zadarmo, až potom plán vlastníka
 * (ak ho vlastník nemá, ostáva pri vlastných minútach).
 */
export async function consumeSpeech(userId: string, seconds: number, now = new Date()): Promise<void> {
  const payer = await billingUserId(userId);
  const rounded = Math.max(1, Math.round(seconds));
  const access = await accessOf(payer, now);

  if (payer !== userId) {
    const own = await getWallet(userId);
    if (access.plan === "free") {
      await saveWallet(userId, afterFreeSpeech(own, rounded));
      await recordSpeech(userId, rounded);
      return;
    }
    const split = splitMemberSpeech(rounded, own?.free_seconds_used ?? 0);
    if (split.fromOwnFree > 0) {
      await saveWallet(userId, { ...own, free_used: own?.free_used ?? 0, credits: own?.credits ?? 0, free_seconds_used: (own?.free_seconds_used ?? 0) + split.fromOwnFree });
    }
    await chargePlan(payer, access, split.fromPlan);
    return;
  }

  if (access.plan === "free") {
    await saveWallet(payer, afterFreeSpeech(access.wallet, rounded));
    await recordSpeech(payer, rounded);
    return;
  }
  await chargePlan(payer, access, rounded);
}

/** Idempotentné pripísanie podľa Stripe Checkout session (Stripe môže udalosť doručiť viackrát). */
async function creditOnce(key: string, userId: string, apply: (wallet: PitchWallet | null) => PitchWallet): Promise<boolean> {
  const kv = getKv();
  if (!(await kv.setnx(key, userId))) return false;
  try {
    await saveWallet(userId, apply(await getWallet(userId)));
  } catch (error) {
    // zápis zlyhal: Stripe udalosť zopakuje, preto pripísanie odomkneme
    await kv.del([key]);
    throw error;
  }
  return true;
}

/** Starší balík pitchov (už sa nepredáva; dobehnuté platby sa ešte pripíšu). */
export async function addPitchCredits(userId: string, credits: number, checkoutSessionId: string): Promise<boolean> {
  return creditOnce(`stripe:pitch-pack:${checkoutSessionId}`, userId, (w) => ({ ...w, free_used: w?.free_used ?? 0, credits: (w?.credits ?? 0) + credits }));
}

/** Dokúpené minúty k Pro. Nevyčerpané ostávajú aj do ďalších týždňov. */
export async function addTopupMinutes(userId: string, minutes: number, checkoutSessionId: string): Promise<boolean> {
  return creditOnce(`stripe:minutes:${checkoutSessionId}`, userId, (w) => ({
    ...w,
    free_used: w?.free_used ?? 0,
    credits: w?.credits ?? 0,
    topup_seconds: (w?.topup_seconds ?? 0) + minutes * 60,
  }));
}
