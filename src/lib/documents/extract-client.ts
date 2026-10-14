import { DOCUMENT_TEXT_MAX } from "@/lib/pitch/context";
import { MAX_DOCUMENT_BYTES, sniffDocumentKind, type DocumentKind } from "@/lib/documents/file-check";
import type { ExtractedSlide } from "@/lib/documents/extract-pptx";

/*
  Text z dokumentu priamo v prehliadači: súbor sa nikam nenahráva (žiadny limit veľkosti
  požiadavky na serveri), na server ide len vytiahnutý text.
*/

export type ExtractResult =
  | { ok: true; kind: DocumentKind; pages: number; text: string }
  | { ok: false; reason: "type" | "size" | "empty" | "encrypted" | "invalid" };

function slidesToText(slides: ExtractedSlide[]): string {
  return slides
    .map((s) => [s.title, s.body, s.notes ? `(${s.notes})` : null].filter(Boolean).join("\n"))
    .filter((t) => t.trim())
    .join("\n\n")
    .slice(0, DOCUMENT_TEXT_MAX);
}

export async function extractDocument(file: File): Promise<ExtractResult> {
  if (file.size > MAX_DOCUMENT_BYTES) return { ok: false, reason: "size" };
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffDocumentKind(bytes);
  if (!kind) return { ok: false, reason: "type" };
  try {
    const slides =
      kind === "pdf"
        ? await (await import("@/lib/documents/extract-pdf")).extractPdf(bytes)
        : await (await import("@/lib/documents/extract-pptx")).extractPptx(bytes);
    const text = slidesToText(slides);
    if (!text.trim()) return { ok: false, reason: "empty" };
    return { ok: true, kind, pages: slides.length, text };
  } catch (error) {
    const code = (error as { code?: string; message?: string })?.code ?? (error as Error)?.message;
    return { ok: false, reason: code === "encrypted" ? "encrypted" : code === "empty" ? "empty" : "invalid" };
  }
}
