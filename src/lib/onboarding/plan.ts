import { z } from "zod";

/*
  Úvodný kvíz (3 otázky z dizajnu PitchIt): komu pitchuješ, ako dlho a čo ukázať najprv.
  Odpovede nastavia časovač, cieľové tempo a váhy kategórií obsahového skóre.
  Čisté funkcie, bežia na serveri aj v prehliadači.
*/

export const ANSWERS_VERSION = 2;

export const AUDIENCES = ["investor", "jury", "customer", "team"] as const;
export type Audience = (typeof AUDIENCES)[number];

export const PITCH_LENGTHS = [30, 60, 180] as const;
export type PitchLength = (typeof PITCH_LENGTHS)[number];

/** Čo ukázať vo feedbacku ako prvé. */
export const FIRST_FOCUS = ["tempo", "fillery", "obsah"] as const;
export type FirstFocus = (typeof FIRST_FOCUS)[number];

export const NOTES_MAX = 4000;

export const onboardingAnswersSchema = z.object({
  audience: z.enum(AUDIENCES),
  lengthSeconds: z.union([z.literal(30), z.literal(60), z.literal(180)]),
  focus: z.enum(FIRST_FOCUS),
});
export type OnboardingAnswers = z.infer<typeof onboardingAnswersSchema>;

export const onboardingSubmissionSchema = onboardingAnswersSchema.extend({
  notes: z.string().trim().max(NOTES_MAX, `Najviac ${NOTES_MAX} znakov.`).optional().default(""),
});

type Option<T> = { value: T; label: string; detail: string; summary: string };
export type Question<T> = { key: keyof OnboardingAnswers; title: string; subtitle: string; options: Option<T>[] };

/** Otázky presne podľa dizajnu (poradie, texty, krátke zhrnutie do plánu). */
export const QUESTIONS = [
  {
    key: "audience",
    title: "Komu pitchuješ?",
    subtitle: "Podľa toho zmeníme, čo skórujeme.",
    options: [
      { value: "investor", label: "Investorovi", detail: "Stretnutie s VC alebo angelom. Dôraz na Traction a Ask", summary: "Investorovi" },
      { value: "jury", label: "Porote", detail: "Demo day, súťaž, akcelerátor. Jasný príbeh aj čísla", summary: "Porote" },
      { value: "customer", label: "Zákazníkovi alebo partnerovi", detail: "Predaj či pilot. Dôraz na problém a prínos", summary: "Zákazníkovi" },
      { value: "team", label: "Tímu", detail: "Interná prezentácia. Dôraz na jasnosť a víziu", summary: "Tímu" },
    ],
  } satisfies Question<Audience>,
  {
    key: "lengthSeconds",
    title: "Aká dlhá má byť tvoja prezentácia?",
    subtitle: "Nastavíme časovač a cieľové tempo reči.",
    options: [
      { value: 30, label: "30 sekúnd", detail: "Výťahový pitch, prvý dojem na evente", summary: "30 sekúnd" },
      { value: 60, label: "1 minúta", detail: "Úvod na stretnutí, najčastejšia dĺžka", summary: "1 minúta" },
      { value: 180, label: "3 minúty", detail: "Demo day alebo súťaž s celým príbehom", summary: "3 minúty" },
    ],
  } satisfies Question<PitchLength>,
  {
    key: "focus",
    title: "Čo ťa najviac straší?",
    subtitle: "Tú metriku ti ukážeme ako prvú.",
    options: [
      { value: "tempo", label: "Tempo a pauzy", detail: "Rozprávam príliš rýchlo alebo bez nádychu", summary: "Tempo" },
      { value: "fillery", label: "Vypĺňacie slová", detail: "Ehm, akože, proste, vlastne…", summary: "Vypĺňacie slová" },
      { value: "obsah", label: "Obsah a štruktúra", detail: "Problém, Riešenie, Trh, Traction, Ask", summary: "Obsah" },
    ],
  } satisfies Question<FirstFocus>,
] as const;

/** Cieľ nahrávky podľa toho, čo používateľa najviac straší (zobrazí sa pred nahrávaním). */
export const FOCUS_GOALS: Record<FirstFocus, string> = {
  tempo: "Hovor pokojne a nechaj si priestor na pauzy.",
  fillery: "Vynechaj ehm, akože a vlastne. Radšej sa na chvíľu odmlč.",
  obsah: "Povedz problém, riešenie, trh, traction a čo od poslucháča chceš.",
};

export const AUDIENCE_LABELS: Record<Audience, string> = { investor: "Investorovi", jury: "Porote", customer: "Zákazníkovi", team: "Tímu" };

/* ---------- angličtina ---------- */

type Locale = "sk" | "en";

export const QUESTIONS_EN = [
  {
    key: "audience",
    title: "Who are you pitching to?",
    subtitle: "We adjust what we score accordingly.",
    options: [
      { value: "investor", label: "An investor", detail: "Meeting with a VC or angel. Focus on traction and the ask", summary: "Investor" },
      { value: "jury", label: "A jury", detail: "Demo day, competition, accelerator. A clear story and numbers", summary: "Jury" },
      { value: "customer", label: "A customer or partner", detail: "Sale or pilot. Focus on the problem and the value", summary: "Customer" },
      { value: "team", label: "Your team", detail: "Internal presentation. Focus on clarity and vision", summary: "Team" },
    ],
  } satisfies Question<Audience>,
  {
    key: "lengthSeconds",
    title: "How long should your pitch be?",
    subtitle: "We set the timer and the target speaking pace.",
    options: [
      { value: 30, label: "30 seconds", detail: "Elevator pitch, first impression at an event", summary: "30 seconds" },
      { value: 60, label: "1 minute", detail: "Opening of a meeting, the most common length", summary: "1 minute" },
      { value: 180, label: "3 minutes", detail: "Demo day or competition with the whole story", summary: "3 minutes" },
    ],
  } satisfies Question<PitchLength>,
  {
    key: "focus",
    title: "What worries you most?",
    subtitle: "We show you that metric first.",
    options: [
      { value: "tempo", label: "Pace and pauses", detail: "I speak too fast or without breathing", summary: "Pace" },
      { value: "fillery", label: "Filler words", detail: "Um, like, you know, basically…", summary: "Filler words" },
      { value: "obsah", label: "Content and structure", detail: "Problem, solution, market, traction, ask", summary: "Content" },
    ],
  } satisfies Question<FirstFocus>,
] as const;

const FOCUS_GOALS_EN: Record<FirstFocus, string> = {
  tempo: "Speak calmly and leave room for pauses.",
  fillery: "Skip the ums, likes and basicallys. Pause for a moment instead.",
  obsah: "Cover the problem, solution, market, traction and what you want from the listener.",
};

const AUDIENCE_LABELS_EN: Record<Audience, string> = { investor: "To an investor", jury: "To a jury", customer: "To a customer", team: "To your team" };

export const questionsFor = (locale: Locale) => (locale === "en" ? QUESTIONS_EN : QUESTIONS);
export const focusGoal = (focus: FirstFocus, locale: Locale) => (locale === "en" ? FOCUS_GOALS_EN : FOCUS_GOALS)[focus];
export const audienceLabel = (audience: Audience, locale: Locale) => (locale === "en" ? AUDIENCE_LABELS_EN : AUDIENCE_LABELS)[audience];

/** Predvolené nastavenie pre používateľa bez odpovedí (preskočil kvíz). */
export const DEFAULT_ANSWERS: OnboardingAnswers = { audience: "jury", lengthSeconds: 60, focus: "tempo" };

/** Načíta odpovede z profilu; staršie alebo neplatné verzie nahradí predvolenými. */
export function readAnswers(raw: unknown): OnboardingAnswers {
  const parsed = onboardingAnswersSchema.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_ANSWERS;
}

/** Zhrnutie pre kartu „Tvoj plán“. */
export function planSummary(answers: OnboardingAnswers, locale: Locale = "sk") {
  const questions = questionsFor(locale);
  const pick = (index: number, value: unknown) =>
    (questions[index].options as ReadonlyArray<Option<unknown>>).find((option) => option.value === value)?.summary ?? "";
  return {
    audience: pick(0, answers.audience),
    length: pick(1, answers.lengthSeconds),
    first: pick(2, answers.focus),
  };
}
