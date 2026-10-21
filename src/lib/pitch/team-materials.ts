import { z } from "zod";
import { pitchDocumentSchema, type PitchContext } from "@/lib/pitch/context";

/*
  Materiály tímu: dokumenty, podľa ktorých sa hodnotia prejavy členov (výťah faktov z nich
  ide do rozboru) a výber, čo sa hodnotí. Čisté funkcie, testované.
*/

export const MATERIAL_MAX_DOCUMENTS = 10;
export const CRITERIA = ["topic", "points", "facts", "length"] as const;
export type Criterion = (typeof CRITERIA)[number];
export const DEFAULT_CRITERIA: Criterion[] = ["topic", "points", "facts"];

export const CRITERION_LABELS: Record<Criterion, { sk: string; en: string; hint: { sk: string; en: string } }> = {
  topic: { sk: "Dodržanie témy", en: "Staying on topic", hint: { sk: "drží sa témy materiálov", en: "stays on the topic of the materials" } },
  points: { sk: "Kľúčové body", en: "Key points", hint: { sk: "pokryje hlavné body z materiálov", en: "covers the main points from the materials" } },
  facts: { sk: "Presnosť faktov", en: "Accuracy of facts", hint: { sk: "čísla a tvrdenia sedia s materiálmi", en: "numbers and claims match the materials" } },
  length: { sk: "Dĺžka prejavu", en: "Talk length", hint: { sk: "prejav sa vojde do zadanej dĺžky", en: "the talk fits the requested length" } },
};

export type TeamMaterials = {
  documents: PitchContext["documents"];
  summary: string;
  summary_of: string[];
  criteria: Criterion[];
};

export const teamMaterialsSchema = z.object({
  documents: z.array(pitchDocumentSchema).max(MATERIAL_MAX_DOCUMENTS),
  criteria: z.array(z.enum(CRITERIA)).max(CRITERIA.length),
});

export const EMPTY_MATERIALS: TeamMaterials = { documents: [], summary: "", summary_of: [], criteria: DEFAULT_CRITERIA };

/** Materiály ako kontext (o firme: nič) na výťah a do promptov. */
export const materialsAsContext = (m: TeamMaterials): PitchContext => ({ about: "", documents: m.documents, summary: m.summary, summary_of: m.summary_of });

/** Text s kritériami pre prompt (pri prázdnom výbere sa hodnotí téma a kľúčové body). */
export function criteriaForPrompt(criteria: Criterion[]): string {
  const list = criteria.length ? criteria : (["topic", "points"] as Criterion[]);
  return list.map((c) => `- ${CRITERION_LABELS[c].sk}: ${CRITERION_LABELS[c].hint.sk}`).join("\n");
}

/** Priemerná zhoda s materiálmi (0–100) z pokusov, kde sa počítala; null, ak žiadny nemá. */
export function averageMatch(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  return nums.length ? Math.round(nums.reduce((a, b) => a + b, 0) / nums.length) : null;
}
