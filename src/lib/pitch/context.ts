import { z } from "zod";

/*
  O čom človek hovorí: voľný text o firme či prezentácii a text z nahraných dokumentov
  (PDF, PPTX). Text z dokumentov sa vytiahne v prehliadači, na server ide len text.
  Použije sa pri hodnotení obsahu a pri otázkach v Q&A.
*/

export const ABOUT_MAX = 5_000;
export const DOCUMENT_TEXT_MAX = 60_000;
export const MAX_DOCUMENTS = 5;
/** výťah faktov z dokumentov (vznikne raz pri nahraní, do promptov ide len on) */
export const SUMMARY_MAX = 1_500;
/** koľko textu dokumentov dostane AI na výťah (raz pri nahraní) */
export const SUMMARY_INPUT_MAX = 30_000;
/** koľko podkladov ide do jedného promptu */
const PROMPT_MAX = 3_000;

export type PitchDocument = {
  id: string;
  name: string;
  kind: "pdf" | "pptx";
  /** počet strán či slidov */
  pages: number;
  text: string;
  added_at: string;
};

export type PitchContext = {
  about: string;
  documents: PitchDocument[];
  /** výťah faktov z dokumentov; prázdny = výťah sa nepodaril, použije sa začiatok textov */
  summary?: string;
  /** id dokumentov, z ktorých výťah vznikol */
  summary_of?: string[];
};

export const pitchDocumentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(160),
  kind: z.enum(["pdf", "pptx"]),
  pages: z.number().int().min(0).max(1000),
  text: z.string().max(DOCUMENT_TEXT_MAX),
  added_at: z.string().max(40),
});

export const pitchContextSchema = z.object({
  about: z.string().max(ABOUT_MAX),
  documents: z.array(pitchDocumentSchema).max(MAX_DOCUMENTS),
});

export const hasContext = (context: PitchContext | null): context is PitchContext =>
  !!context && (context.about.trim().length > 0 || context.documents.some((d) => d.text.trim().length > 0));

const clean = (text: string) => text.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();

/** Text dokumentov na jednorazový výťah (každému dokumentu rovnaký diel). */
export function documentsForSummary(documents: PitchDocument[]): string {
  const share = Math.floor(SUMMARY_INPUT_MAX / Math.max(1, documents.length));
  return documents.map((d) => `[${d.name}]\n${clean(d.text).slice(0, share)}`).join("\n\n");
}

/** Výťah sedí k aktuálnym dokumentom? */
export const summaryIsCurrent = (context: PitchContext) =>
  !!context.summary_of && context.summary_of.length === context.documents.length && context.documents.every((d) => context.summary_of!.includes(d.id));

/**
 * Podklady pre AI ako krátky text: text o firme a výťah faktov z dokumentov (nie celé dokumenty),
 * aby každé hodnotenie stálo čo najmenej tokenov.
 */
export function contextForPrompt(context: PitchContext | null): string | null {
  if (!hasContext(context)) return null;
  const parts: string[] = [];
  if (context.about.trim()) parts.push(clean(context.about));
  if (context.documents.length) {
    const summary = summaryIsCurrent(context) ? context.summary?.trim() : "";
    // bez výťahu aspoň začiatok každého dokumentu
    parts.push(summary || context.documents.map((d) => `[${d.name}] ${clean(d.text).slice(0, Math.floor(SUMMARY_MAX / context.documents.length))}`).join("\n"));
  }
  const joined = parts.join("\n\n");
  return joined.length > PROMPT_MAX ? `${joined.slice(0, PROMPT_MAX)}…` : joined;
}

export const summarySchema = z.object({ facts: z.string().min(1).max(SUMMARY_MAX + 500) });

export const SUMMARY_SYSTEM = `Z dokumentov (prezentácia, materiály firmy) vytiahni stručný výťah faktov, ktoré rečník môže v prejave povedať
a na ktoré sa môže publikum pýtať: čo firma robí, pre koho, problém, riešenie, čísla (používatelia, tržby, trh, cena, financovanie),
konkurencia, tím, ďalšie kroky. Iba fakty z textu, nič nevymýšľaj. Krátke odrážky, spolu najviac ${SUMMARY_MAX} znakov, v jazyku dokumentov.`;
