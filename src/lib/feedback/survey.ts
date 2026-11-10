import { z } from "zod";

/*
  Krátky dotazník pre ľudí, ktorí už nahrali pitch: tri otázky na hviezdičky (1 – 5), tri povinné otázky
  (ako sa s appkou pracovalo, na čo ju použil, čo mu chýba) a jedna nepovinná voľná.
  Kto ho vyplní, dostane raz 5 minút zadarmo navyše. Odpovede vidí administrácia. Čisté funkcie, testované.
*/

export const FEEDBACK_BONUS_SECONDS = 5 * 60;
export const FEEDBACK_COMMENT_MAX = 2000;
export const FEEDBACK_ANSWER_MAX = 1000;

export const FEEDBACK_QUESTIONS = [
  { key: "overall", sk: "Ako sa ti celkovo páči PitchIt?", en: "How do you like PitchIt overall?" },
  { key: "usefulness", sk: "Pomohla ti spätná väzba k prejavu?", en: "Was the feedback on your talk helpful?" },
  { key: "ease", sk: "Ako ľahko sa aplikácia používa?", en: "How easy is the app to use?" },
] as const;

export type FeedbackKey = (typeof FEEDBACK_QUESTIONS)[number]["key"];
export type FeedbackRatings = Record<FeedbackKey, number>;

/** Na čo človek appku použil (môže vybrať viac možností). */
export const FEEDBACK_USES = [
  { key: "meeting", sk: "Príprava na meeting", en: "Preparing for a meeting" },
  { key: "public", sk: "Verejné vystúpenie", en: "Public speaking" },
  { key: "investors", sk: "Pitch pre investorov", en: "Investor pitch" },
  { key: "other", sk: "Iné", en: "Other" },
] as const;
export type FeedbackUse = (typeof FEEDBACK_USES)[number]["key"];

/** Texty otázok mimo hviezdičiek (dotazník aj administrácia). */
export const FEEDBACK_LABELS = {
  experience: { sk: "Ako sa ti s appkou pracovalo?", en: "How was it working with the app?" },
  usedFor: { sk: "Na čo si appku použil/a?", en: "What did you use the app for?" },
  missing: { sk: "Čo ti na PitchIt chýba?", en: "What is PitchIt missing for you?" },
  comment: { sk: "Chceš nám ešte niečo odkázať?", en: "Anything else you'd like to tell us?" },
} as const;

const star = z.number().int().min(1).max(5);
const answer = z.string().trim().min(2).max(FEEDBACK_ANSWER_MAX);
const useKeys = FEEDBACK_USES.map((u) => u.key) as [FeedbackUse, ...FeedbackUse[]];

export const feedbackSchema = z.object({
  ratings: z.object({ overall: star, usefulness: star, ease: star }),
  experience: answer,
  usedFor: z
    .array(z.enum(useKeys))
    .min(1)
    .max(FEEDBACK_USES.length)
    .transform((list) => [...new Set(list)]),
  missing: answer,
  comment: z.string().max(FEEDBACK_COMMENT_MAX).optional().default(""),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
/** Odpovede na povinné otázky (uložené v stĺpci `answers`). */
export type FeedbackAnswers = Pick<FeedbackInput, "experience" | "usedFor" | "missing">;

/** `answers` chýba v odpovediach spred zavedenia povinných otázok. */
export type FeedbackRow = { user_id: string; created_at: string; ratings: Partial<FeedbackRatings> | null; answers?: Partial<FeedbackAnswers> | null; comment: string | null };

export type FeedbackSummary = {
  count: number;
  /** priemer hviezdičiek na otázku (1 desatinné miesto); bez odpovedí null */
  averages: Record<FeedbackKey, number | null>;
  /** koľko ľudí appku použilo na daný účel */
  uses: Record<FeedbackUse, number>;
  /** najnovšie prvé */
  items: Array<{ userId: string; email: string; createdAt: string; ratings: Partial<FeedbackRatings>; experience: string; usedFor: FeedbackUse[]; missing: string; comment: string }>;
};

export function summarizeFeedback(rows: FeedbackRow[], emails: Map<string, string | null>): FeedbackSummary {
  const averages = {} as Record<FeedbackKey, number | null>;
  for (const { key } of FEEDBACK_QUESTIONS) {
    const values = rows.map((r) => r.ratings?.[key]).filter((v): v is number => typeof v === "number");
    averages[key] = values.length ? Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10 : null;
  }
  const known = new Set<string>(useKeys);
  const usedFor = (r: FeedbackRow) => (Array.isArray(r.answers?.usedFor) ? r.answers.usedFor.filter((u): u is FeedbackUse => known.has(u)) : []);
  const uses = Object.fromEntries(FEEDBACK_USES.map((u) => [u.key, rows.filter((r) => usedFor(r).includes(u.key)).length])) as Record<FeedbackUse, number>;
  const items = rows
    .map((r) => ({
      userId: r.user_id,
      email: emails.get(r.user_id) ?? "–",
      createdAt: r.created_at,
      ratings: r.ratings ?? {},
      experience: (r.answers?.experience ?? "").trim(),
      usedFor: usedFor(r),
      missing: (r.answers?.missing ?? "").trim(),
      comment: (r.comment ?? "").trim(),
    }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return { count: rows.length, averages, uses, items };
}
