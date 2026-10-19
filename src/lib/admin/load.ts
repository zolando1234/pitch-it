import "server-only";

import { check } from "@/lib/db/core";
import { getAdminDb } from "@/lib/store/client";
import { buildAdminOverview, type AdminOverview, type AdminRaw } from "@/lib/admin/overview";

/*
  Načíta všetko pre administráciu (iba po overení, že ide o administrátora).
  Heslá ani obsah nahrávok sa nečítajú.
*/

type Row = Record<string, unknown>;

async function all(table: string, columns: string): Promise<Row[]> {
  const { data, error } = await getAdminDb().from<Row[]>(table).select(columns);
  check({ error }, `admin.${table}`);
  return (data ?? []) as Row[];
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const [users, profiles, wallets, attempts, events, contexts, subscriptions] = await Promise.all([
    all("auth_users", "id, email, created_at, meta"),
    all("profiles", "id, display_name"),
    all("pitch_wallets", "user_id, free_used, credits, free_seconds_used"),
    all("pitch_attempts", "user_id, created_at, status, with_camera, language, target_seconds, duration_ms, content_score, qa"),
    all("product_events", "user_id, name, created_at, properties"),
    all("pitch_contexts", "user_id, about, documents"),
    all("subscriptions", "user_id, plan, status"),
  ]);
  const raw: AdminRaw = {
    users: users.map((u) => ({
      id: String(u.id),
      email: (u.email as string) ?? null,
      created_at: String(u.created_at ?? ""),
      provider: ((u.meta as { provider?: string } | null)?.provider as string) ?? null,
    })),
    profiles: profiles.map((p) => ({ id: String(p.id), display_name: (p.display_name as string) ?? null })),
    wallets: wallets.map((w) => ({ user_id: String(w.user_id), free_used: Number(w.free_used ?? 0), credits: Number(w.credits ?? 0), free_seconds_used: Number(w.free_seconds_used ?? 0) })),
    subscriptions: subscriptions.map((x) => ({ user_id: String(x.user_id), plan: String(x.plan ?? "free"), status: String(x.status ?? "") })),
    attempts: attempts.map((a) => ({
      user_id: String(a.user_id),
      created_at: String(a.created_at ?? ""),
      status: String(a.status ?? ""),
      with_camera: Boolean(a.with_camera),
      language: (a.language as string) ?? null,
      target_seconds: Number(a.target_seconds ?? 0),
      duration_ms: a.duration_ms == null ? null : Number(a.duration_ms),
      content_score: a.content_score == null ? null : Number(a.content_score),
      qa: a.qa ?? null,
    })),
    purchases: events
      .filter((e) => e.name === "purchase_completed")
      .map((e) => {
        const props = (e.properties ?? {}) as { amount?: number | null; credits?: number | null };
        return { user_id: (e.user_id as string) ?? null, created_at: String(e.created_at ?? ""), amount: props.amount ?? null, credits: props.credits ?? null };
      }),
    checkouts: events.filter((e) => e.name === "checkout_started").map((e) => ({ user_id: (e.user_id as string) ?? null, created_at: String(e.created_at ?? "") })),
    contexts: contexts.map((c) => ({
      user_id: String(c.user_id),
      documents: Array.isArray(c.documents) ? c.documents.length : 0,
      hasAbout: typeof c.about === "string" && c.about.trim().length > 0,
    })),
  };
  return buildAdminOverview(raw);
}
