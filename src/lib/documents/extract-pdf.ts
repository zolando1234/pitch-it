import { extractText, getDocumentProxy } from "unpdf";
import type { ExtractedSlide } from "@/lib/documents/extract-pptx";

/*
  Text z PDF po stranách (strana = slide). Pitch decky exportované z nástrojov
  ako Keynote alebo Canva majú textovú vrstvu. Beží aj v prehliadači.
*/

const MAX_PAGES = 200;

export class PdfError extends Error {
  constructor(readonly code: "invalid" | "too_many_pages" | "encrypted") {
    super(code);
    this.name = "PdfError";
  }
}

function guessTitle(text: string): { title: string | null; body: string } {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (lines.length === 0) return { title: null, body: "" };
  const [first, ...rest] = lines;
  // Krátky prvý riadok považujeme za nadpis slidu.
  return first.length <= 80 ? { title: first, body: rest.join("\n") } : { title: null, body: lines.join("\n") };
}

export async function extractPdf(bytes: Uint8Array): Promise<ExtractedSlide[]> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    throw new PdfError(/password/i.test(message) ? "encrypted" : "invalid");
  }
  if (pdf.numPages > MAX_PAGES) throw new PdfError("too_many_pages");

  const { text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];
  return pages.map((pageText, index) => {
    const { title, body } = guessTitle(pageText ?? "");
    return { slideNumber: index + 1, title, body: body.slice(0, 20_000), notes: null };
  });
}
