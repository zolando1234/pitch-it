import "server-only";

import { check } from "@/lib/db/core";
import type { FeedbackInput } from "@/lib/feedback/survey";
import { getAdminDb } from "@/lib/store/client";
import { getKv } from "@/lib/store/kv";

/*
  Dotazník spokojnosti: jeden záznam na používateľa (primárny kľúč user_id). Zapisuje iba server.
*/

export async function hasAppFeedback(userId: string): Promise<boolean> {
  const { data, error } = await getAdminDb().from("app_feedback").select("user_id").eq("user_id", userId).maybeSingle<{ user_id: string }>();
  check({ error }, "app_feedback.get");
  return data !== null;
}

/**
 * Uloží odpovede; false = používateľ už dotazník vyplnil. Vkladanie podľa primárneho kľúča by záznam prepísalo,
 * preto o prvom vyplnení rozhoduje zámok v KV.
 */
export async function saveAppFeedback(userId: string, input: FeedbackInput): Promise<boolean> {
  const kv = getKv();
  const key = `app_feedback:v1:${userId}`;
  if (!(await kv.setnx(key, "1"))) return false;
  try {
    const { error } = await getAdminDb().from("app_feedback").insert({
      user_id: userId,
      ratings: input.ratings,
      answers: { experience: input.experience, usedFor: input.usedFor, missing: input.missing },
      comment: input.comment.trim(),
    });
    check({ error }, "app_feedback.save");
  } catch (error) {
    // zápis zlyhal: používateľ môže dotazník odoslať znova
    await kv.del([key]);
    throw error;
  }
  return true;
}

/** Nahral už používateľ aspoň jeden vyhodnotený pitch? Dotazník je len pre tých, čo PitchIt skúsili. */
export async function hasReadyPitch(userId: string): Promise<boolean> {
  const { data, error } = await getAdminDb().from("pitch_attempts").select("id").eq("user_id", userId).eq("status", "ready").limit(1);
  check({ error }, "app_feedback.attempts");
  return Array.isArray(data) && data.length > 0;
}
