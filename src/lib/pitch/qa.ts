import { z } from "zod";
import { countFillers } from "@/lib/analytics/speech/text-metrics";
import type { PitchLanguage } from "@/lib/pitch/language";

/*
  Q&A po prejave: AI položí 1 až 5 otázok (podľa dĺžky prejavu) k téme (z podkladov a toho, čo zaznelo),
  v jazyku prejavu. Odpovede sa nahrajú, prepíšu a ohodnotia zvlášť od prejavu.
*/

export const QA_MAX_QUESTIONS = 5;

/** Najviac otázok podľa dĺžky prejavu: do 5 min 1, do 10 min 2, do 30 min 3, potom 5. */
export function qaMaxQuestionsFor(durationMs: number): number {
  const minutes = durationMs / 60_000;
  if (minutes < 5) return 1;
  if (minutes < 10) return 2;
  if (minutes < 30) return 3;
  return QA_MAX_QUESTIONS;
}
/** otázky klienta počas stretnutia */
export const CLIENT_MAX_QUESTIONS = 10;
/** najviac hodnotených odpovedí (Q&A aj stretnutie s klientom) */
export const MAX_ANSWERS = CLIENT_MAX_QUESTIONS;
/** najdlhšia odpoveď na jednu otázku */
export const QA_ANSWER_MAX_MS = 120_000;

export const questionsSchema = z.object({
  questions: z.array(z.string().min(5).max(300)).min(1).max(QA_MAX_QUESTIONS),
});

export const QUESTIONS_SYSTEM = `Si publikum po verejnom vystúpení (zvedavý, ale náročný poslucháč, novinár alebo investor).
Po prejave kladieš otázky, ktoré by reálne padli v Q&A: overujú tvrdenia, pýtajú sa na čísla, riziká, konkurenciu, ďalšie kroky
alebo na to, čo v prejave chýbalo. Každá otázka je krátka (jedna veta, najviac 25 slov), konkrétna a týka sa témy.
Neopakuj rovnaký typ otázky. Žiadne úvody ani číslovanie, iba text otázky.`;

/** Otázky klienta počas stretnutia: prerušia výklad a viažu sa na to, čo práve zaznelo. */
export const CLIENT_QUESTIONS_SYSTEM = `Si klient na obchodnom stretnutí za stolom. Rečník ti vysvetľuje svoju ponuku, produkt alebo riešenie
a ty ho v prirodzenej chvíli prerušíš otázkou, ako to robia skutoční klienti: čo to znamená pre tvoju firmu, koľko to stojí, ako dlho trvá zavedenie,
aké sú riziká, ako je to v porovnaní s tým, čo používaš teraz, alebo si necháš vysvetliť niečo, čo nebolo jasné.
Otázka sa musí viazať na to, čo rečník povedal naposledy (koniec prepisu), nie na niečo, čo ešte nezaznelo.
Jedna krátka veta, najviac 25 slov, hovorovo, bez úvodov a bez číslovania. Neopakuj otázky, ktoré už padli.`;

export function buildQuestionsPrompt(input: {
  count: number;
  language: string;
  topic?: string | null;
  outline?: string[] | null;
  context?: string | null;
  transcript?: string | null;
  /** náhodné semienko, aby sa otázky pri ďalšom pokuse menili */
  seed: number;
  /** otázky, ktoré už padli (stretnutie s klientom) */
  asked?: string[];
  /** klient prerušuje počas výkladu: dôležitý je koniec prepisu */
  client?: boolean;
}): string {
  const transcript = input.transcript?.trim() ?? "";
  return [
    `Polož presne ${input.count} ${input.count === 1 ? "otázku" : "otázky"}. Otázky napíš v jazyku: ${input.language}.`,
    input.topic ? `Téma prejavu:\n"""${input.topic.slice(0, 1500)}"""` : null,
    input.outline?.length ? `Osnova:\n${input.outline.map((p) => `- ${p}`).join("\n")}` : null,
    input.context ? `Podklady o firme a prezentácii:\n"""${input.context}"""` : null,
    transcript && input.client
      ? `Čo rečník doteraz povedal (prepis; najdôležitejší je koniec, na ten nadviaž):\n"""${transcript.length > 6_000 ? `…${transcript.slice(-6_000)}` : transcript}"""`
      : transcript
        ? `Čo v prejave zaznelo (prepis, môže byť neúplný):\n"""${transcript.slice(0, 6_000)}"""`
        : null,
    input.asked?.length ? `Už položené otázky (neopakuj ich ani ich obmenu):\n${input.asked.map((q) => `- ${q}`).join("\n")}` : null,
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
        index: z.number().int().min(0).max(MAX_ANSWERS - 1),
        score: z.number().int().min(0).max(10),
        strength: z.string().max(280),
        improve: z.string().min(1).max(280),
      }),
    )
    .min(1)
    .max(MAX_ANSWERS),
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
