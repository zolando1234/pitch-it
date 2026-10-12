import { z } from "zod";
import type { Audience } from "@/lib/onboarding/plan";

/*
  Obsahové skóre podľa pitch rubriky: Problém, Riešenie, Trh, Traction, Ask (0–10).
  Váhy sa menia podľa publika: investor = viac Ask a Traction, porota = vyvážene, zákazník a tím = viac Problém a Riešenie.
*/

export const CONTENT_CATEGORIES = ["problem", "solution", "market", "traction", "ask"] as const;
export type ContentCategory = (typeof CONTENT_CATEGORIES)[number];

export const CATEGORY_LABELS: Record<ContentCategory, string> = {
  problem: "Problém",
  solution: "Riešenie",
  market: "Trh",
  traction: "Traction",
  ask: "Ask",
};

export const contentScoreSchema = z.object({
  categories: z
    .array(
      z.object({
        key: z.enum(CONTENT_CATEGORIES),
        score: z.number().int().min(0).max(10),
        advice: z.string().min(1).max(280),
      }),
    )
    .length(5),
});
export type ContentScore = z.infer<typeof contentScoreSchema>;

const WEIGHTS: Record<Audience, Record<ContentCategory, number>> = {
  investor: { problem: 1, solution: 1, market: 1, traction: 1.5, ask: 1.5 },
  jury: { problem: 1.25, solution: 1.25, market: 1, traction: 1.25, ask: 0.75 },
  customer: { problem: 1.5, solution: 1.5, market: 0.5, traction: 1.25, ask: 1 },
  team: { problem: 1.5, solution: 1.5, market: 1, traction: 0.75, ask: 0.75 },
};

/** Vážený priemer kategórií, zaokrúhlený na desatiny. */
export function overallScore(content: ContentScore, audience: Audience): number {
  const weights = WEIGHTS[audience];
  let sum = 0;
  let total = 0;
  for (const category of content.categories) {
    sum += category.score * weights[category.key];
    total += weights[category.key];
  }
  return total > 0 ? Math.round((sum / total) * 10) / 10 : 0;
}

/** Kategórie v pevnom poradí rubriky. */
export function orderedCategories(content: ContentScore) {
  return CONTENT_CATEGORIES.map((key) => content.categories.find((c) => c.key === key) ?? { key, score: 0, advice: "" });
}

export function weakestCategory(content: ContentScore): ContentCategory {
  return [...orderedCategories(content)].sort((a, b) => a.score - b.score)[0].key;
}

export const CONTENT_SYSTEM = `Si skúsený mentor startupov a hodnotíš krátky nahraný pitch zakladateľa (30 sekúnd až 3 minúty) podľa rubriky.
Hodnotíš iba to, čo v prepise naozaj zaznelo. Nič si nedomýšľaj a nevymýšľaj čísla.
Kategórie: problem (Problém), solution (Riešenie), market (Trh), traction (Traction), ask (Ask – žiadosť: suma a na čo).
Pre každú kategóriu daj celé skóre 0–10 (0 = vôbec nezaznelo, 5 = spomenuté všeobecne, 8+ = konkrétne s číslom alebo dôkazom)
a jednu až dve krátke vety po slovensky v tykaní: čo funguje a jednu konkrétnu vec, ktorú zlepšiť. Tón: vľúdny, koučovací, nikdy karhajúci.
Ak chceš navrhnúť číslo, ktoré nepoznáš, použi zástupný symbol [X].
Ak zakladateľ zadal tému pitchu, je záväzná: hodnotíš pitch voči nej. Časti mimo témy do skóre nezapočítaj a rady píš tak,
aby pitch lepšie povedal práve zadanú tému. Nenavrhuj iné zameranie ani iný produkt.`;

const AUDIENCE_BRIEF: Record<Audience, string> = {
  investor: "investor (dôraz na Ask a Traction)",
  jury: "porota na demo day alebo súťaži (vyvážený príbeh: jasný problém, riešenie a dôkaz trakcie)",
  customer: "zákazník alebo partner (dôraz na jeho problém a prínos riešenia; Ask = ďalší krok, napr. pilot, nie investícia)",
  team: "vlastný tím (dôraz na jasnosť a príbeh)",
};

export function buildContentPrompt(input: {
  transcript: string;
  audience: Audience;
  targetSeconds: number;
  notes: string | null;
  topic?: string | null;
  outline?: string[] | null;
  /** jazyk pitchu v lokáli, napr. „angličtine“ */
  language?: string | null;
  /** jazyk spätnej väzby (rozhranie) */
  feedbackLocale?: "sk" | "en";
}): string {
  const audience = AUDIENCE_BRIEF[input.audience];
  return [
    `Publikum: ${audience}.`,
    `Cieľová dĺžka: ${input.targetSeconds} sekúnd.`,
    input.feedbackLocale === "en"
      ? "IMPORTANT: Write every advice text in English (informal, friendly second person), regardless of the pitch language or the instructions above."
      : input.language && input.language !== "slovenčine"
        ? `Pitch je v ${input.language}. Hodnoť ho v tomto jazyku, spätnú väzbu (advice) však píš po slovensky.`
        : null,
    input.topic ? `Téma pitchu (záväzné zadanie od zakladateľa):\n"""${input.topic.slice(0, 1500)}"""` : null,
    input.outline?.length ? `Osnova, ktorú si zakladateľ pripravil:\n${input.outline.map((p) => `- ${p}`).join("\n")}` : null,
    input.notes ? `Poznámky, ktoré si zakladateľ pripravil (porovnaj, čo z nich naozaj povedal):\n"""${input.notes.slice(0, 4000)}"""` : null,
    `Prepis pitchu:\n"""${input.transcript.slice(0, 12000)}"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
