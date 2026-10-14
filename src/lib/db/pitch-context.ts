import "server-only";

import { check } from "@/lib/db/core";
import type { PitchContext } from "@/lib/pitch/context";
import { getAdminDb } from "@/lib/store/client";

/*
  O čom používateľ hovorí (sekcia Dokumenty). Zapisuje iba server po overení prihlásenia.
*/

export async function getPitchContext(userId: string): Promise<PitchContext | null> {
  const { data, error } = await getAdminDb().from("pitch_contexts").select("about, documents, summary, summary_of").eq("user_id", userId).maybeSingle<PitchContext>();
  check({ error }, "pitch_context.get");
  if (!data) return null;
  return {
    about: data.about ?? "",
    documents: Array.isArray(data.documents) ? data.documents : [],
    summary: data.summary ?? "",
    summary_of: Array.isArray(data.summary_of) ? data.summary_of : [],
  };
}

export async function savePitchContext(userId: string, context: PitchContext): Promise<void> {
  const { error } = await getAdminDb().from("pitch_contexts").upsert({ user_id: userId, ...context }, { onConflict: "user_id" });
  check({ error }, "pitch_context.save");
}
