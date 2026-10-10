import "server-only";

import { afterPitch, pitchBalance, type PitchBalance, type PitchWallet } from "@/lib/billing/pitch-pack";
import { check } from "@/lib/db/core";
import { getAdminDb } from "@/lib/store/client";
import { getKv } from "@/lib/store/kv";

/*
  Pitche zadarmo a zakúpené kredity. Zapisuje iba server (analýza pitchu, Stripe webhook).
*/

async function getWallet(userId: string): Promise<PitchWallet | null> {
  const { data, error } = await getAdminDb().from("pitch_wallets").select("free_used, credits").eq("user_id", userId).maybeSingle<PitchWallet>();
  check({ error }, "pitch_wallet.get");
  return data;
}

async function saveWallet(userId: string, wallet: PitchWallet): Promise<void> {
  const { error } = await getAdminDb().from("pitch_wallets").upsert({ user_id: userId, ...wallet }, { onConflict: "user_id" });
  check({ error }, "pitch_wallet.save");
}

export async function getPitchBalance(userId: string): Promise<PitchBalance> {
  return pitchBalance(await getWallet(userId));
}

/** Započíta jeden analyzovaný pitch. */
export async function consumePitch(userId: string): Promise<void> {
  await saveWallet(userId, afterPitch(await getWallet(userId)));
}

/**
 * Pripíše zakúpené pitche. Idempotentné podľa Stripe Checkout session:
 * Stripe môže tú istú udalosť doručiť viackrát. Vráti false, ak už bola pripísaná.
 */
export async function addPitchCredits(userId: string, credits: number, checkoutSessionId: string): Promise<boolean> {
  const kv = getKv();
  const key = `stripe:pitch-pack:${checkoutSessionId}`;
  if (!(await kv.setnx(key, userId))) return false;
  try {
    const wallet = await getWallet(userId);
    await saveWallet(userId, { free_used: wallet?.free_used ?? 0, credits: (wallet?.credits ?? 0) + credits });
  } catch (error) {
    // zápis zlyhal: Stripe udalosť zopakuje, preto pripísanie odomkneme
    await kv.del([key]);
    throw error;
  }
  return true;
}
