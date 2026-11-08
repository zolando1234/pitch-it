import { z } from "zod";

/*
  Krátky dotazník pre ľudí, ktorí už nahrali pitch: pár otázok na hviezdičky (1 – 5) a jedno textové pole.
  Kto ho vyplní, dostane raz 5 minút zadarmo navyše. Odpovede vidí administrácia. Čisté funkcie, testované.
*/

export const FEEDBACK_BONUS_SECONDS = 5 * 60;
export const FEEDBACK_COMMENT_MAX = 2000;

export const FEEDBACK_QUESTIONS = [
  { key: "overall", sk: "Ako sa ti celkovo páči PitchIt?", en: "How do you like PitchIt overall?" },
  { key: "usefulness", sk: "Pomohla ti spätná väzba k prejavu?", en: "Was the feedback on your talk helpful?" },
  { key: "ease", sk: "Ako ľahko sa aplikácia používa?", en: "How easy is the app to use?" },
] as const;

export type FeedbackKey = (typeof FEEDBACK_QUESTIONS)[number]["key"];
export type FeedbackRatings = Record<FeedbackKey, number>;

const star = z.number().int().min(1).max(5);

export const feedbackSchema = z.object({
  ratings: z.object({ overall: star, usefulness: star, ease: star }),
  comment: z.string().max(FEEDBACK_COMMENT_MAX).optional().default(""),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;

export type FeedbackRow = { user_id: string; created_at: string; ratings: Partial<FeedbackRatings> | null; comment: string | null };

export type FeedbackSummary = {
  count: number;
  /** priemer hviezdičiek na otázku (1 desatinné miesto); bez odpovedí null */
  averages: Record<FeedbackKey, number | null>;
  /** najnovšie prvé */
  items: Array<{ userId: string; email: string; createdAt: string; ratings: Partial<FeedbackRatings>; comment: string }>;
};

export function summarizeFeedback(rows: FeedbackRow[], emails: Map<string, string | null>): FeedbackSummary {
  const averages = {} as Record<FeedbackKey, number | null>;
  for (const { key } of FEEDBACK_QUESTIONS) {
    const values = rows.map((r) => r.ratings?.[key]).filter((v): v is number => typeof v === "number");
    averages[key] = values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null;
  }
  const items = rows
    .map((r) => ({ userId: r.user_id, email: emails.get(r.user_id) ?? "–", createdAt: r.created_at, ratings: r.ratings ?? {}, comment: (r.comment ?? "").trim() }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { count: rows.length, averages, items };
}
