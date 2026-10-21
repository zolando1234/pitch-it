import JSZip from "jszip";

/*
  Extrakcia textu z DOCX: odseky (w:p) a ich texty (w:t) z word/document.xml.
  Nespúšťa makrá ani nečíta externé odkazy.
*/

const MAX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024;

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, "&");
}

/** Text dokumentu po odsekoch (prázdne odseky sa vynechajú). */
export function docxParagraphs(documentXml: string): string[] {
  const result: string[] = [];
  for (const paragraph of documentXml.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) ?? []) {
    const runs = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => decodeXml(match[1]));
    const line = runs.join("").replace(/\s+/g, " ").trim();
    if (line) result.push(line);
  }
  return result;
}

/** Je archív ZIP wordový dokument? */
export async function isDocx(zip: JSZip): Promise<boolean> {
  return zip.file("word/document.xml") !== null;
}

export async function extractDocx(bytes: Uint8Array): Promise<{ pages: number; text: string }> {
  const zip = await JSZip.loadAsync(bytes);
  const entry = zip.file("word/document.xml");
  if (!entry) throw Object.assign(new Error("invalid"), { code: "invalid" });
  const xml = await entry.async("string");
  if (xml.length > MAX_UNCOMPRESSED_BYTES) throw Object.assign(new Error("invalid"), { code: "invalid" });
  const lines = docxParagraphs(xml);
  if (!lines.length) throw Object.assign(new Error("empty"), { code: "empty" });
  // približne 500 slov na stranu
  const words = lines.join(" ").split(/\s+/).length;
  return { pages: Math.max(1, Math.round(words / 500)), text: lines.join("\n") };
}
