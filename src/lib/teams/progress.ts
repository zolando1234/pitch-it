import type { MetricKey, PitchProgressRow } from "@/lib/pitch/progress";
import { weekStart } from "@/lib/billing/pricing";

/*
  Progres členov firemného tímu pre vlastníka: koľkokrát si tréning vyskúšali, ako často
  a ako sa menia skóre. Z uložených pokusov, bez prepisov a nahrávok. Čisté funkcie, testované.
*/

export type MemberSummary = {
  attempts: number;
  last7: number;
  thisWeek: number;
  thisMonth: number;
  /** nahraté minúty spolu (zaokrúhlené) */
  minutes: number;
  lastAt: string | null;
  /** dni od posledného pokusu (null = nikdy) */
  daysSince: number | null;
  /** obsahové skóre 0–10: prvé, posledné a priemer */
  content: { first: number; last: number; avg: number; count: number } | null;
  /** odpovede na otázky 0–10 */
  qa: { first: number; last: number; avg: number; count: number } | null;
  /** reč tela 0–100 */
  body: { first: number; last: number; avg: number; count: number } | null;
  /** počet pokusov podľa typu tréningu */
  byKind: Record<"public" | "client" | "meeting", number>;
  /** zmena obsahového skóre z prvého na posledný pokus: "up" | "down" | "flat" | null (menej ako 2 pokusy) */
  trend: "up" | "down" | "flat" | null;
};

const DAY = 24 * 60 * 60 * 1000;

function range(rows: PitchProgressRow[], key: MetricKey): MemberSummary["content"] {
  const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
  if (!values.length) return null;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  return { first: values[0], last: values[values.length - 1], avg: Math.round(avg * 10) / 10, count: values.length };
}

/** Súhrn pokusov člena (riadky od najstaršieho). `durations` = dĺžky nahrávok v sekundách podľa id pokusu. */
export function summarizeMember(rows: PitchProgressRow[], durations: Map<string, number>, now = new Date()): MemberSummary {
  const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const week = weekStart(now).getTime();
  const month = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const times = sorted.map((r) => new Date(r.createdAt).getTime());
  const seconds = sorted.reduce((sum, r) => sum + (durations.get(r.id) ?? r.targetSeconds), 0);
  const lastAt = sorted.length ? sorted[sorted.length - 1].createdAt : null;
  const content = range(sorted, "content");
  const trend = content && content.count >= 2 ? (content.last - content.first > 0.2 ? "up" : content.last - content.first < -0.2 ? "down" : "flat") : null;
  return {
    attempts: sorted.length,
    last7: times.filter((t) => t >= now.getTime() - 7 * DAY).length,
    thisWeek: times.filter((t) => t >= week).length,
    thisMonth: times.filter((t) => t >= month).length,
    minutes: Math.round(seconds / 60),
    lastAt,
    daysSince: lastAt ? Math.max(0, Math.floor((now.getTime() - new Date(lastAt).getTime()) / DAY)) : null,
    content,
    qa: range(sorted, "qa"),
    body: range(sorted, "body"),
    byKind: {
      public: sorted.filter((r) => r.mode === "public").length,
      client: sorted.filter((r) => r.mode === "client").length,
      meeting: sorted.filter((r) => r.mode === "meeting").length,
    },
    trend,
  };
}

export type TeamTotals = { members: number; active7: number; attempts: number; thisMonth: number; neverTried: number; minutes: number };

/** Súhrn celého tímu: kto trénoval za posledných 7 dní a kto ešte nič nevyskúšal. */
export function teamTotals(summaries: MemberSummary[]): TeamTotals {
  return {
    members: summaries.length,
    active7: summaries.filter((s) => s.last7 > 0).length,
    attempts: summaries.reduce((n, s) => n + s.attempts, 0),
    thisMonth: summaries.reduce((n, s) => n + s.thisMonth, 0),
    neverTried: summaries.filter((s) => s.attempts === 0).length,
    minutes: summaries.reduce((n, s) => n + s.minutes, 0),
  };
}
