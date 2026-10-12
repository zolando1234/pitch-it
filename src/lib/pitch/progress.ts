import { finalScoreFor, parseStoredCoach } from "@/lib/coach/stored";
import type { StatCard, StatDelta } from "@/lib/dashboard/overview";
import type { PitchAttemptRow } from "@/lib/db/types";
import { LANGUAGE_INFO, parseLanguage } from "@/lib/pitch/language";
import type { PitchMetrics } from "@/lib/pitch/metrics";
import { matchPct, parseOutlineResult } from "@/lib/pitch/outline";

/*
  Progres nahraných pitchov: z uložených pokusov priebeh hlavných metrík v čase.
  Čisté funkcie (bez servera), aby sa dali otestovať.
*/

export type PitchProgressRow = {
  id: string;
  number: number;
  createdAt: string;
  targetSeconds: number;
  languageLabel: string;
  /** reč tela 0–100 (null = bez kamery alebo málo údajov) */
  body: number | null;
  /** obsahové skóre 0–10 */
  content: number | null;
  /** vypĺňacie slová za minútu */
  fillers: number | null;
  /** slabiky za sekundu */
  tempo: number | null;
  /** zhoda s osnovou v % */
  outline: number | null;
};

export type MetricKey = "body" | "content" | "fillers" | "tempo" | "outline";

export const METRICS: Record<MetricKey, { title: string; unit: string; digits: number; better: "up" | "down" | "band" }> = {
  body: { title: "Reč tela", unit: "/ 100", digits: 0, better: "up" },
  content: { title: "Obsahové skóre", unit: "/ 10", digits: 1, better: "up" },
  fillers: { title: "Vypĺňacie slová", unit: "za min", digits: 1, better: "down" },
  tempo: { title: "Tempo", unit: "slabík/s", digits: 1, better: "band" },
  outline: { title: "Zhoda s osnovou", unit: "%", digits: 0, better: "up" },
};

export function progressRows(attempts: PitchAttemptRow[]): PitchProgressRow[] {
  return attempts
    .filter((a) => a.status === "ready")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((a, i) => {
      const coach = parseStoredCoach((a.body as { coach?: unknown } | null)?.coach ?? null);
      const metrics = a.metrics as PitchMetrics | null;
      const outline = parseOutlineResult(a.outline);
      return {
        id: a.id,
        number: i + 1,
        createdAt: a.created_at,
        targetSeconds: a.target_seconds,
        languageLabel: LANGUAGE_INFO[parseLanguage(a.language)].label,
        body: coach ? finalScoreFor(coach).total : null,
        content: a.content_score,
        fillers: metrics ? metrics.fillersPer60s : null,
        tempo: metrics?.tempo ?? null,
        outline: outline ? matchPct(outline) : null,
      };
    });
}

/** Prvá a posledná známa hodnota metriky (na porovnanie „odkiaľ kam“). */
export function firstAndLast(rows: PitchProgressRow[], key: MetricKey): { first: number; last: number; count: number } | null {
  const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
  if (!values.length) return null;
  return { first: values[0], last: values[values.length - 1], count: values.length };
}

/** Je zmena k lepšiemu? (pri tempe nerozhodujeme, záleží na cieľovom okne) */
export function improved(key: MetricKey, first: number, last: number): boolean | null {
  const better = METRICS[key].better;
  if (better === "band" || first === last) return null;
  return better === "up" ? last > first : last < first;
}

/** Karty na prehľade z nahraných pitchov: posledná hodnota a zmena oproti predošlému pitchu. */
export function pitchStatCards(rows: PitchProgressRow[]): StatCard[] {
  const spec: { key: MetricKey; label: string; icon: StatCard["icon"]; tone: StatCard["tone"] }[] = [
    { key: "body", label: "Reč tela", icon: "star", tone: "lime" },
    { key: "content", label: "Obsahové skóre", icon: "chat", tone: "violet" },
    { key: "fillers", label: "Vypĺňacie slová", icon: "chat", tone: "lime" },
    { key: "tempo", label: "Tempo reči", icon: "gauge", tone: "violet" },
  ];
  return spec.map(({ key, label, icon, tone }) => {
    const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
    const info = METRICS[key];
    const last = values.at(-1) ?? null;
    const prev = values.length > 1 ? values[values.length - 2] : null;
    const format = (v: number) => v.toFixed(info.digits).replace(".", ",");
    let delta: StatDelta | null = null;
    if (last !== null && prev !== null) {
      const diff = last - prev;
      const better = improved(key, prev, last);
      delta = {
        text: `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${format(Math.abs(diff))}`,
        sign: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
        verdict: better === null ? "same" : better ? "better" : "worse",
        description: "oproti predošlému pitchu",
      };
    }
    return {
      key,
      label,
      icon,
      tone,
      value: last === null ? null : format(last),
      unit: last === null ? null : info.unit,
      hint: null,
      delta,
      note: last === null ? "Po prvom pitchi" : values.length === 1 ? "Prvý pitch" : "",
    };
  });
}
