import "server-only";

import { randomInt } from "node:crypto";
import { check, DbError, must } from "@/lib/db/core";
import type { PitchAttemptRow, PitchEventRow } from "@/lib/db/types";
import { getAdminDb, getUserDb } from "@/lib/store/client";

/*
  Nahrané pitche a akcie. Pokusy zapisuje server (service_role), čítanie ide cez RLS:
  účastník vidí svoje pokusy, organizátor pokusy zdieľané do svojej akcie.
*/

export async function insertPitchAttempt(row: Pick<PitchAttemptRow, "user_id" | "audience" | "target_seconds" | "focus" | "with_camera" | "duration_ms" | "mode">): Promise<PitchAttemptRow> {
  const result = await getAdminDb().from("pitch_attempts").insert(row).select("*").single<PitchAttemptRow>();
  return must(result, "pitch.insert");
}

export async function updatePitchAttempt(id: string, patch: Partial<Omit<PitchAttemptRow, "id" | "user_id" | "created_at">>): Promise<void> {
  check(await getAdminDb().from("pitch_attempts").update(patch).eq("id", id), "pitch.update");
}

/** Pokus, ktorý smie vidieť prihlásený používateľ (vlastný alebo zdieľaný do jeho akcie). */
export async function getPitchAttempt(id: string): Promise<PitchAttemptRow | null> {
  const db = await getUserDb();
  const { data, error } = await db.from("pitch_attempts").select("*").eq("id", id).maybeSingle<PitchAttemptRow>();
  if (error) throw new DbError("query_failed", `pitch.get: ${error.code}`);
  return data;
}

/** Poradové číslo pokusu používateľa (1 = prvý). */
export async function attemptNumber(attempt: PitchAttemptRow): Promise<number> {
  const db = await getUserDb();
  const { count, error } = await db
    .from("pitch_attempts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", attempt.user_id)
    .lte("created_at", attempt.created_at);
  if (error) throw new DbError("query_failed", `pitch.number: ${error.code}`);
  return count ?? 1;
}

export async function listOwnPitchAttempts(userId: string, limit = 20): Promise<PitchAttemptRow[]> {
  const db = await getUserDb();
  const result = await db.from("pitch_attempts").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(limit);
  return must(result, "pitch.list") as PitchAttemptRow[];
}

/** Posledné zdieľanie používateľa (na predvyplnenie formulára). */
export async function lastShare(userId: string): Promise<Pick<PitchAttemptRow, "share_name" | "share_team" | "share_email" | "event_id"> | null> {
  const db = await getUserDb();
  const { data } = await db
    .from("pitch_attempts")
    .select("share_name, share_team, share_email, event_id")
    .eq("user_id", userId)
    .not("shared_at", "is", null)
    .order("shared_at", { ascending: false })
    .limit(1)
    .maybeSingle<Pick<PitchAttemptRow, "share_name" | "share_team" | "share_email" | "event_id">>();
  return data;
}

/** Zdieľa pokus a všetky ďalšie pokusy používateľa s rovnakou akciou (mentor vidí progres). */
export async function sharePitchAttempts(userId: string, attemptId: string, share: { eventId: string | null; name: string; team: string; email: string }): Promise<void> {
  const admin = getAdminDb();
  const patch = { event_id: share.eventId, share_name: share.name, share_team: share.team, share_email: share.email, shared_at: new Date().toISOString() };
  check(await admin.from("pitch_attempts").update(patch).eq("user_id", userId).eq("id", attemptId), "pitch.share");
  // Staršie pokusy bez akcie pripojíme tiež, aby mentor videl 1. aj posledný pokus.
  if (!share.eventId) return;
  check(await admin.from("pitch_attempts").update(patch).eq("user_id", userId).is("event_id", null), "pitch.share.older");
}

export async function findEventByCode(code: string): Promise<PitchEventRow | null> {
  const { data } = await getAdminDb().from("pitch_events").select("*").eq("code", code.toUpperCase()).maybeSingle<PitchEventRow>();
  return data;
}

export async function getEvent(id: string): Promise<PitchEventRow | null> {
  const { data } = await getAdminDb().from("pitch_events").select("*").eq("id", id).maybeSingle<PitchEventRow>();
  return data;
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export async function createEvent(organizerId: string, name: string): Promise<PitchEventRow> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    const result = await getAdminDb().from("pitch_events").insert({ organizer_id: organizerId, name, code }).select("*").single<PitchEventRow>();
    if (!result.error) return result.data;
    if (result.error.code !== "23505") throw new DbError("query_failed", `event.create: ${result.error.code}`);
  }
  throw new DbError("conflict", "event.create: kód sa nepodarilo vygenerovať");
}

export async function listOwnEvents(): Promise<PitchEventRow[]> {
  const db = await getUserDb();
  const result = await db.from("pitch_events").select("*").order("created_at", { ascending: false });
  return must(result, "event.list") as PitchEventRow[];
}

/** Zdieľané pokusy akcie (RLS pustí iba organizátora). */
export async function listEventAttempts(eventId: string): Promise<PitchAttemptRow[]> {
  const db = await getUserDb();
  const result = await db.from("pitch_attempts").select("*").eq("event_id", eventId).not("shared_at", "is", null).order("created_at", { ascending: true });
  return must(result, "event.attempts") as PitchAttemptRow[];
}
