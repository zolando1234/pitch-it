import { z } from "zod";
import { countFillers } from "@/lib/analytics/speech/text-metrics";
import type { PitchLanguage } from "@/lib/pitch/language";

/*
  Q&A po prejave: AI položí 1 až 4 otázky k téme (z podkladov a toho, čo zaznelo),
  v jazyku prejavu. Odpovede sa nahrajú, prepíšu a ohodnotia zvlášť od prejavu.
*/

export const QA_MAX_QUESTIONS = 4;
/** najdlhšia odpoveď na jednu otázku */
export const QA_ANSWER_MAX_MS = 120_000;

export const questionsSchema = z.object({
  questions: z.array(z.string().min(5).max(300)).min(1).max(QA_MAX_QUESTIONS),
});

export const QUESTIONS_SYSTEM = `Si publikum po verejnom vystúpení (zvedavý, ale náročný poslucháč, novinár alebo investor).
Po prejave kladieš otázky, ktoré by reálne padli v Q&A: overujú tvrdenia, pýtajú sa na čísla, riziká, konkurenciu, ďalšie kroky
alebo na to, čo v prejave chýbalo. Každá otázka je krátka (jedna veta, najviac 25 slov), konkrétna a týka sa témy.
Neopakuj rovnaký typ otázky. Žiadne úvody ani číslovanie, iba text otázky.`;

export function buildQuestionsPrompt(input: {
  count: number;
  language: string;
  topic?: string | null;
  outline?: string[] | null;
  context?: string | null;
  transcript?: string | null;
  /** náhodné semienko, aby sa otázky pri ďalšom pokuse menili */
  seed: number;
}): string {
  return [
    `Polož presne ${input.count} ${input.count === 1 ? "otázku" : "otázky"}. Otázky napíš v jazyku: ${input.language}.`,
    input.topic ? `Téma prejavu:\n"""${input.topic.slice(0, 1500)}"""` : null,
    input.outline?.length ? `Osnova:\n${input.outline.map((p) => `- ${p}`).join("\n")}` : null,
    input.context ? `Podklady o firme a prezentácii:\n"""${input.context}"""` : null,
    input.transcript ? `Čo v prejave zaznelo (prepis, môže byť neúplný):\n"""${input.transcript.slice(0, 6_000)}"""` : null,
    !input.topic && !input.context && !input.transcript ? "O téme nič nevieme: polož všeobecné otázky, aké padajú po prezentácii projektu." : null,
    `Variant ${input.seed}: vyber iné uhly pohľadu ako pri bežných otázkach.`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export const answerScoreSchema = z.object({
  answers: z
    .array(
      z.object({
        index: z.number().int().min(0).max(QA_MAX_QUESTIONS - 1),
        score: z.number().int().min(0).max(10),
        strength: z.string().max(280),
        improve: z.string().min(1).max(280),
      }),
    )
    .min(1)
    .max(QA_MAX_QUESTIONS),
  summary: z.string().min(1).max(400),
});
export type AnswerScore = z.infer<typeof answerScoreSchema>;

export const ANSWERS_SYSTEM = `Si kouč verejného vystupovania a hodnotíš odpovede rečníka v Q&A po prejave.
Pre každú odpoveď daj celé skóre 0–10: 0 = bez odpovede, 5 = odpovedal, ale vágne alebo okolo, 8+ = priamo, stručne, s konkrétnym faktom či príkladom.
Hodnoť: či odpovedal na otázku, stručnosť (ideálne 20–60 sekúnd), konkrétnosť a istotu. Hodnotíš iba to, čo v prepise naozaj zaznelo.
strength = čo bolo dobré (jedna veta, môže byť prázdne), improve = jedna konkrétna rada, ako odpovedať lepšie. summary = jedna až dve vety k celému Q&A.
Tón vľúdny, koučovací, v tykaní.`;

export function buildAnswersPrompt(input: {
  answers: { question: string; transcript: string; durationMs: number }[];
  language: string;
  feedbackLocale: "sk" | "en";
  context?: string | null;
}): string {
  return [
    input.feedbackLocale === "en"
      ? "IMPORTANT: Write strength, improve and summary in English (informal, friendly second person)."
      : "Texty strength, improve a summary píš po slovensky.",
    `Jazyk odpovedí: ${input.language}.`,
    input.context ? `Fakty o firme (na kontrolu, či odpovede sedia):\n"""${input.context}"""` : null,
    input.answers
      .map((a, i) => `Otázka ${i} (index ${i}): ${a.question}\nOdpoveď (${Math.round(a.durationMs / 1000)} s): """${a.transcript.trim() || "(bez odpovede)"}"""`)
      .join("\n\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export type QaAnswer = {
  question: string;
  transcript: string;
  durationMs: number;
  fillers: number;
  score: number | null;
  strength: string;
  improve: string;
};

export type QaResult = {
  version: 1;
  language: PitchLanguage;
  answers: QaAnswer[];
  /** priemer skóre odpovedí (0–10), null bez hodnotenia */
  score: number | null;
  summary: string | null;
};

export function buildQaResult(input: {
  language: PitchLanguage;
  answers: { question: string; transcript: string; durationMs: number }[];
  scores: AnswerScore | null;
}): QaResult {
  const answers: QaAnswer[] = input.answers.map((a, i) => {
    const s = input.scores?.answers.find((x) => x.index === i) ?? null;
    return {
      question: a.question,
      transcript: a.transcript,
      durationMs: a.durationMs,
      fillers: countFillers(a.transcript, input.language).total,
      // bez odpovede je skóre 0 aj bez AI
      score: a.transcript.trim() ? (s?.score ?? null) : 0,
      strength: s?.strength ?? "",
      improve: s?.improve ?? "",
    };
  });
  const scored = answers.map((a) => a.score).filter((x): x is number => x !== null);
  return {
    version: 1,
    language: input.language,
    answers,
    score: scored.length ? Math.round((scored.reduce((a, b) => a + b, 0) / scored.length) * 10) / 10 : null,
    summary: input.scores?.summary ?? null,
  };
}

export function parseQaResult(value: unknown): QaResult | null {
  if (!value || typeof value !== "object" || (value as { version?: unknown }).version !== 1) return null;
  const v = value as QaResult;
  return Array.isArray(v.answers) ? v : null;
}
