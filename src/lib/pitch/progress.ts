import { finalScoreFor, parseStoredCoach } from "@/lib/coach/stored";
import type { StatCard, StatDelta } from "@/lib/dashboard/stat-card";
import type { PitchAttemptRow } from "@/lib/db/types";
import { LANGUAGE_INFO, parseLanguage } from "@/lib/pitch/language";
import type { PitchMetrics } from "@/lib/pitch/metrics";
import { matchPct, parseOutlineResult } from "@/lib/pitch/outline";
import { parseQaResult } from "@/lib/pitch/qa";

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
  /** odpovede na otázky (Q&A, otázky klienta) alebo reakcie na klienta, 0–10 */
  qa: number | null;
  /** typ tréningu */
  mode: TrainingKind;
  /** téma zadaná pred nahrávaním (prázdna = bez témy) */
  topic: string;
  /** krátky kľúč témy do URL filtra */
  topicKey: string;
};

export type TrainingKind = "public" | "client" | "meeting";
export const TRAINING_KINDS: TrainingKind[] = ["public", "client", "meeting"];

/** Kľúč témy: rovnaká téma (bez ohľadu na veľké písmená a medzery) = rovnaký kľúč. */
export function topicKeyOf(topic: string): string {
  const norm = topic.trim().toLowerCase().replace(/\s+/g, " ");
  if (!norm) return "";
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Pokusy podľa filtra typu a témy; čísla pokusov sa prečíslujú v rámci výberu. */
export function filterRows(rows: PitchProgressRow[], filter: { kind?: TrainingKind | null; topicKey?: string | null }): PitchProgressRow[] {
  return rows
    .filter((r) => (!filter.kind || r.mode === filter.kind) && (!filter.topicKey || r.topicKey === filter.topicKey))
    .map((r, i) => ({ ...r, number: i + 1 }));
}

/** Témy s počtom pokusov (najčastejšie prvé). */
export function topicsOf(rows: PitchProgressRow[]): Array<{ key: string; topic: string; count: number }> {
  const map = new Map<string, { key: string; topic: string; count: number }>();
  for (const r of rows) {
    if (!r.topicKey) continue;
    const item = map.get(r.topicKey) ?? { key: r.topicKey, topic: r.topic, count: 0 };
    item.count += 1;
    map.set(r.topicKey, item);
  }
  return [...map.values()].sort((a, b) => b.count - a.count);
}

export type MetricKey = "body" | "content" | "fillers" | "tempo" | "outline" | "qa";

export const METRICS: Record<MetricKey, { title: string; unit: string; digits: number; better: "up" | "down" | "band" }> = {
  body: { title: "Reč tela", unit: "/ 100", digits: 0, better: "up" },
  content: { title: "Obsahové skóre", unit: "/ 10", digits: 1, better: "up" },
  fillers: { title: "Vypĺňacie slová", unit: "za min", digits: 1, better: "down" },
  tempo: { title: "Tempo", unit: "slabík/s", digits: 1, better: "band" },
  outline: { title: "Zhoda s osnovou", unit: "%", digits: 0, better: "up" },
  qa: { title: "Odpovede na otázky", unit: "/ 10", digits: 1, better: "up" },
};

const METRICS_EN_UNIT: Record<MetricKey, string> = { body: "/ 100", content: "/ 10", fillers: "per min", tempo: "syll./s", outline: "%", qa: "/ 10" };
export const METRICS_EN_TITLE: Record<MetricKey, string> = {
  body: "Body language",
  content: "Content score",
  fillers: "Filler words",
  tempo: "Pace",
  outline: "Outline match",
  qa: "Answers to questions",
};
export const metricText = (key: MetricKey, locale: "sk" | "en") =>
  locale === "en" ? { title: METRICS_EN_TITLE[key], unit: METRICS_EN_UNIT[key] } : { title: METRICS[key].title, unit: METRICS[key].unit };

export function progressRows(attempts: PitchAttemptRow[]): PitchProgressRow[] {
  return attempts
    .filter((a) => a.status === "ready")
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((a, i) => {
      const coach = parseStoredCoach((a.body as { coach?: unknown } | null)?.coach ?? null);
      const metrics = a.metrics as PitchMetrics | null;
      const outline = parseOutlineResult(a.outline);
      const topic = outline?.topic?.trim() ?? "";
      const qa = parseQaResult(a.qa);
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
        qa: qa?.score ?? null,
        mode: a.mode === "client" || a.mode === "meeting" ? a.mode : "public",
        topic,
        topicKey: topicKeyOf(topic),
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
export function pitchStatCards(rows: PitchProgressRow[], locale: "sk" | "en" = "sk"): StatCard[] {
  const en = locale === "en";
  const spec: { key: MetricKey; label: string; icon: StatCard["icon"]; tone: StatCard["tone"] }[] = [
    { key: "body", label: en ? "Body language" : "Reč tela", icon: "star", tone: "lime" },
    { key: "content", label: en ? "Content score" : "Obsahové skóre", icon: "chat", tone: "violet" },
    { key: "fillers", label: en ? "Filler words" : "Vypĺňacie slová", icon: "chat", tone: "lime" },
    { key: "tempo", label: en ? "Speaking pace" : "Tempo reči", icon: "gauge", tone: "violet" },
  ];
  return spec.map(({ key, label, icon, tone }) => {
    const values = rows.map((r) => r[key]).filter((v): v is number => v !== null);
    const info = METRICS[key];
    const last = values.at(-1) ?? null;
    const prev = values.length > 1 ? values[values.length - 2] : null;
    const format = (v: number) => (en ? v.toFixed(info.digits) : v.toFixed(info.digits).replace(".", ","));
    let delta: StatDelta | null = null;
    if (last !== null && prev !== null) {
      const diff = last - prev;
      const better = improved(key, prev, last);
      delta = {
        text: `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${format(Math.abs(diff))}`,
        sign: diff > 0 ? "up" : diff < 0 ? "down" : "flat",
        verdict: better === null ? "same" : better ? "better" : "worse",
        description: en ? "compared with the previous pitch" : "oproti predošlému pitchu",
      };
    }
    return {
      key,
      label,
      icon,
      tone,
      value: last === null ? null : format(last),
      unit: last === null ? null : en ? METRICS_EN_UNIT[key] : info.unit,
      hint: null,
      delta,
      note: last === null ? (en ? "After your first pitch" : "Po prvom pitchi") : values.length === 1 ? (en ? "First pitch" : "Prvý pitch") : "",
    };
  });
}
