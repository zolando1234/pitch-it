import { activePlan, FREE_SECONDS } from "@/lib/billing/pricing";

/*
  Prehľad pre administrátora: používatelia, platiaci, využitie. Čisté funkcie nad surovými
  riadkami z úložiska, testované.
*/

export type AdminRaw = {
  users: Array<{ id: string; email: string | null; created_at: string; provider: string | null }>;
  profiles: Array<{ id: string; display_name: string | null }>;
  wallets: Array<{ user_id: string; free_used: number; credits: number; free_seconds_used?: number }>;
  /** predplatné Pro/Unlimited (staršie dáta ho nemajú) */
  subscriptions?: Array<{ user_id: string; plan: string; status: string }>;
  attempts: Array<{
    user_id: string;
    created_at: string;
    status: string;
    with_camera: boolean;
    language: string | null;
    target_seconds: number;
    duration_ms: number | null;
    content_score: number | null;
    qa: unknown;
  }>;
  purchases: Array<{ user_id: string | null; created_at: string; amount: number | null; credits: number | null }>;
  checkouts: Array<{ user_id: string | null; created_at: string }>;
  contexts: Array<{ user_id: string; documents: number; hasAbout: boolean }>;
};

export type AdminPlan = "paid" | "free" | "free_used_up";

export type AdminUserRow = {
  id: string;
  email: string;
  name: string | null;
  provider: string | null;
  registeredAt: string;
  lastPitchAt: string | null;
  pitches: number;
  /** minuté minúty zadarmo */
  freeUsed: number;
  credits: number;
  plan: AdminPlan;
  /** aktívne predplatné */
  subscription: "pro" | "unlimited" | null;
  /** zaplatené spolu v centoch */
  paidCents: number;
  documents: number;
};

export type AdminOverview = {
  generatedAt: string;
  users: { total: number; last7: number; last30: number };
  activation: { withPitch: number; pct: number };
  pitches: { total: number; last7: number; last30: number; ready: number; failed: number; perActiveUser: number; withCamera: number; withQa: number; avgMinutes: number };
  paying: { users: number; pct: number; revenueCents: number; purchases: number; checkoutsStarted: number; freeUsedUp: number };
  documentsUsers: number;
  languages: Array<{ code: string; count: number }>;
  /** posledných 30 dní (najstarší prvý) */
  daily: Array<{ date: string; signups: number; pitches: number }>;
  /** vývoj za posledných 90 dní ku koncu každého dňa: všetci, aktívni (pitch za 7 dní), opakovane platiaci */
  growth: Array<{ date: string; total: number; active: number; repeatPayers: number }>;
  /** dnes: aktívni za 7 dní a koľkí zaplatili viac ako raz */
  now: { active: number; repeatPayers: number };
  rows: AdminUserRow[];
};

const DAY = 86_400_000;
/** aktívny = aspoň jeden vyhodnotený pitch za posledných 7 dní */
export const ACTIVE_DAYS = 7;
const GROWTH_DAYS = 90;
const dayKey = (iso: string) => iso.slice(0, 10);

export function buildAdminOverview(raw: AdminRaw, now = new Date()): AdminOverview {
  const t = now.getTime();
  const within = (iso: string, days: number) => t - Date.parse(iso) <= days * DAY;
  const names = new Map(raw.profiles.map((p) => [p.id, p.display_name]));
  const wallets = new Map(raw.wallets.map((w) => [w.user_id, w]));
  const contexts = new Map(raw.contexts.map((c) => [c.user_id, c]));

  const byUser = new Map<string, AdminRaw["attempts"]>();
  for (const a of raw.attempts) byUser.set(a.user_id, [...(byUser.get(a.user_id) ?? []), a]);
  const paidByUser = new Map<string, number>();
  for (const p of raw.purchases) if (p.user_id) paidByUser.set(p.user_id, (paidByUser.get(p.user_id) ?? 0) + (p.amount ?? 0));

  const subscriptions = new Map((raw.subscriptions ?? []).map((x) => [x.user_id, activePlan(x)]));

  const rows: AdminUserRow[] = raw.users.map((u) => {
    const attempts = byUser.get(u.id) ?? [];
    const wallet = wallets.get(u.id);
    const freeSeconds = wallet?.free_seconds_used ?? 0;
    const credits = wallet?.credits ?? 0;
    const bought = paidByUser.has(u.id);
    const sub = subscriptions.get(u.id);
    const subscription = sub === "pro" || sub === "unlimited" ? sub : null;
    const plan: AdminPlan = subscription || bought || credits > 0 ? "paid" : freeSeconds >= FREE_SECONDS ? "free_used_up" : "free";
    const freeUsed = Math.round(freeSeconds / 60);
    const last = attempts.reduce<string | null>((max, a) => (!max || a.created_at > max ? a.created_at : max), null);
    return {
      id: u.id,
      email: u.email ?? "–",
      name: names.get(u.id) ?? null,
      provider: u.provider,
      registeredAt: u.created_at,
      lastPitchAt: last,
      pitches: attempts.filter((a) => a.status === "ready").length,
      freeUsed,
      credits,
      plan,
      subscription,
      paidCents: paidByUser.get(u.id) ?? 0,
      documents: contexts.get(u.id)?.documents ?? 0,
    };
  });
  rows.sort((a, b) => b.registeredAt.localeCompare(a.registeredAt));

  const ready = raw.attempts.filter((a) => a.status === "ready");
  const withPitch = rows.filter((r) => r.pitches > 0).length;
  const paying = rows.filter((r) => r.plan === "paid").length;
  const languages = new Map<string, number>();
  for (const a of ready) languages.set(a.language ?? "sk", (languages.get(a.language ?? "sk") ?? 0) + 1);
  const durations = ready.map((a) => a.duration_ms ?? 0).filter((d) => d > 0);

  const daily: AdminOverview["daily"] = [];
  for (let i = 29; i >= 0; i--) {
    const date = new Date(t - i * DAY).toISOString().slice(0, 10);
    daily.push({
      date,
      signups: raw.users.filter((u) => dayKey(u.created_at) === date).length,
      pitches: ready.filter((a) => dayKey(a.created_at) === date).length,
    });
  }

  // vývoj v čase: koniec dňa = posledná milisekunda dňa (UTC)
  const purchasesByUser = new Map<string, string[]>();
  for (const p of raw.purchases) if (p.user_id) purchasesByUser.set(p.user_id, [...(purchasesByUser.get(p.user_id) ?? []), p.created_at]);
  const growthAt = (end: number) => {
    const endIso = new Date(end).toISOString();
    const fromIso = new Date(end - ACTIVE_DAYS * DAY).toISOString();
    return {
      total: raw.users.filter((u) => u.created_at <= endIso).length,
      active: new Set(ready.filter((a) => a.created_at <= endIso && a.created_at > fromIso).map((a) => a.user_id)).size,
      repeatPayers: [...purchasesByUser.values()].filter((dates) => dates.filter((d) => d <= endIso).length >= 2).length,
    };
  };
  const growth: AdminOverview["growth"] = [];
  for (let i = GROWTH_DAYS - 1; i >= 0; i--) {
    const day = new Date(t - i * DAY).toISOString().slice(0, 10);
    const end = i === 0 ? t : Date.parse(`${day}T23:59:59.999Z`);
    growth.push({ date: day, ...growthAt(end) });
  }
  const today = growthAt(t);

  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);
  return {
    generatedAt: now.toISOString(),
    users: { total: rows.length, last7: raw.users.filter((u) => within(u.created_at, 7)).length, last30: raw.users.filter((u) => within(u.created_at, 30)).length },
    activation: { withPitch, pct: pct(withPitch, rows.length) },
    pitches: {
      total: ready.length,
      last7: ready.filter((a) => within(a.created_at, 7)).length,
      last30: ready.filter((a) => within(a.created_at, 30)).length,
      ready: ready.length,
      failed: raw.attempts.filter((a) => a.status === "failed").length,
      perActiveUser: withPitch ? Math.round((ready.length / withPitch) * 10) / 10 : 0,
      withCamera: ready.filter((a) => a.with_camera).length,
      withQa: ready.filter((a) => !!a.qa).length,
      avgMinutes: durations.length ? Math.round((durations.reduce((s, d) => s + d, 0) / durations.length / 60_000) * 10) / 10 : 0,
    },
    paying: {
      users: paying,
      pct: pct(paying, rows.length),
      revenueCents: raw.purchases.reduce((s, p) => s + (p.amount ?? 0), 0),
      purchases: raw.purchases.length,
      checkoutsStarted: raw.checkouts.length,
      freeUsedUp: rows.filter((r) => r.plan === "free_used_up").length,
    },
    documentsUsers: raw.contexts.filter((c) => c.documents > 0 || c.hasAbout).length,
    languages: [...languages.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count),
    daily,
    growth,
    now: { active: today.active, repeatPayers: today.repeatPayers },
    rows,
  };
}
