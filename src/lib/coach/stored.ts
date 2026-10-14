import { z } from "zod";
import { TALK_MODES, ruleFilterFor } from "@/lib/coach/modes";
import { computeFinalScore, type FinalScore } from "@/lib/coach/pose/scoring";
import type { SessionSummary } from "@/lib/coach/pose/session";

/*
  Súhrn živého trénera reči tela, ako sa ukladá k pokusu. Iba odvodené čísla a časy chýb,
  nikdy obraz: fotky a video z kamery zostávajú v prehliadači.
*/

const MAX_TIMELINE = 300;
const MAX_MISTAKES = 120;

const side = z.object({ left: z.number(), center: z.number(), right: z.number() });

export const storedCoachSchema = z.object({
  version: z.literal(2),
  teleprompter: z.boolean(),
  micMode: z.boolean(),
  /** stretnutie za stolom: bez pravidiel pódia a nôh */
  seated: z.boolean().optional(),
  summary: z.object({
    durationMs: z.number().min(0),
    personMs: z.number().min(0),
    avgScore: z.number(),
    statusShare: z.object({ good: z.number(), warn: z.number(), bad: z.number() }),
    cleanShare: z.number(),
    zoneShare: z.number(),
    gesturesPerMin: z.number().nullable(),
    stageShare: side,
    gazeShare: side,
    highlights: z.record(z.string(), z.number()),
    issues: z.array(z.object({ id: z.string().max(40), ms: z.number(), count: z.number() })).max(60),
    mistakes: z.array(z.object({ id: z.string().max(40), start: z.number(), end: z.number() })).max(MAX_MISTAKES),
    timeline: z
      .array(z.object({ t: z.number(), status: z.enum(["good", "warn", "bad", "idle"]), score: z.number() }))
      .max(MAX_TIMELINE),
  }),
});

export type StoredCoach = z.infer<typeof storedCoachSchema>;

/** priebeh môže mať tisíce vzoriek, na uloženie stačí pár stoviek */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)]);
}

/** Zo súhrnu tréningu spraví malý záznam na odoslanie (bez fotiek). */
export function toStoredCoach(summary: SessionSummary, opts: { teleprompter: boolean; micMode: boolean; seated?: boolean }): StoredCoach {
  return {
    version: 2,
    teleprompter: opts.teleprompter,
    micMode: opts.micMode,
    ...(opts.seated ? { seated: true } : {}),
    summary: {
      ...summary,
      issues: summary.issues.slice(0, 60),
      mistakes: summary.mistakes.slice(0, MAX_MISTAKES).map(({ id, start, end }) => ({ id, start, end })),
      timeline: downsample(summary.timeline, MAX_TIMELINE),
    },
  };
}

/** Uložený záznam späť na súhrn, aby sa dal zobraziť rovnakými komponentmi. */
export function fromStoredCoach(stored: StoredCoach): SessionSummary {
  return { ...stored.summary, mistakes: stored.summary.mistakes.map((m) => ({ ...m, snapshot: null })) } as SessionSummary;
}

/** Výsledné skóre pitchu: hodnotia sa všetky pravidlá ako pri bežnom prejave. */
export function finalScoreFor(stored: StoredCoach, locale: "sk" | "en" = "sk"): FinalScore {
  return computeFinalScore(fromStoredCoach(stored), ruleFilterFor(TALK_MODES[0], stored.teleprompter, stored.seated ?? false), locale);
}

export function parseStoredCoach(value: unknown): StoredCoach | null {
  const parsed = storedCoachSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
