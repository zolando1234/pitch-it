import { z } from "zod";

/*
  O čom človek hovorí: voľný text o firme či prezentácii a text z nahraných dokumentov
  (PDF, PPTX). Text z dokumentov sa vytiahne v prehliadači, na server ide len text.
  Použije sa pri hodnotení obsahu a pri otázkach v Q&A.
*/

export const ABOUT_MAX = 5_000;
export const DOCUMENT_TEXT_MAX = 60_000;
export const MAX_DOCUMENTS = 5;
/** koľko podkladov ide do jedného promptu */
const PROMPT_MAX = 24_000;

export type PitchDocument = {
  id: string;
  name: string;
  kind: "pdf" | "pptx";
  /** počet strán či slidov */
  pages: number;
  text: string;
  added_at: string;
};

export type PitchContext = { about: string; documents: PitchDocument[] };

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

/** Podklady pre AI ako jeden text (skrátený, aby sa zmestil do promptu). */
export function contextForPrompt(context: PitchContext | null): string | null {
  if (!hasContext(context)) return null;
  const parts: string[] = [];
  if (context.about.trim()) parts.push(context.about.trim());
  for (const doc of context.documents) {
    const text = doc.text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (text) parts.push(`[${doc.name}]\n${text}`);
  }
  const joined = parts.join("\n\n");
  return joined.length > PROMPT_MAX ? `${joined.slice(0, PROMPT_MAX)}…` : joined;
}
