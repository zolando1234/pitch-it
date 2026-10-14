import { z } from "zod";
import type { Audience } from "@/lib/onboarding/plan";

/*
  Téma a osnova, ktorú si zakladateľ uloží pred nahrávaním, a jej porovnanie s pitchom:
  ktoré body zazneli, či sa držal témy, či nepreskakoval a či bolo vysvetlenie zrozumiteľné.
*/

export const OUTLINE_MAX_POINTS = 12;
export const TOPIC_MAX_LENGTH = 1500;

export const outlineInputSchema = z
  .object({
    topic: z.string().trim().max(TOPIC_MAX_LENGTH),
    points: z.array(z.string().trim().min(1).max(200)).max(OUTLINE_MAX_POINTS),
  })
  .refine((o) => o.topic.length > 0 || o.points.length > 0);

export type PitchOutline = z.infer<typeof outlineInputSchema>;

/** Body osnovy z textu: jeden bod na riadok, odrážky a čísla na začiatku sa zahodia. */
export function parseOutlinePoints(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(/^\s*(?:[-–•*]|\d+[.)])\s*/, "").trim())
    .filter(Boolean)
    .map((line) => line.slice(0, 200))
    .slice(0, OUTLINE_MAX_POINTS);
}

export function toOutline(topic: string, text: string): PitchOutline | null {
  const outline = { topic: topic.trim().slice(0, TOPIC_MAX_LENGTH), points: parseOutlinePoints(text) };
  return outline.topic || outline.points.length ? outline : null;
}

// ---------- kľúčové slová (živé odškrtávanie aj porovnanie bez AI) ----------

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

export const tokenize = (s: string) => normalize(s).match(/[a-z0-9]+/g) ?? [];

/** Kmeň kľúčového slova, aby sa chytili aj skloňované tvary (riešenie → riešenia, trhu → trh). */
export const stemOf = (keyword: string) => {
  const n = normalize(keyword);
  if (n.length === 4 && /[aeiouy]$/.test(n)) return n.slice(0, 3);
  return n.length <= 4 ? n : n.slice(0, Math.min(n.length - 2, 7));
};

export const matchesStem = (token: string, stem: string) => (stem.length <= 2 ? token === stem : token.startsWith(stem));

const STOPWORDS = new Set(
  ["ktory", "ktora", "ktore", "ktori", "preto", "alebo", "nasa", "nase", "nasi", "tiez", "este", "velmi", "takze", "potom", "ako", "aby", "ked", "len", "iba", "pre", "pri", "pod", "nad", "cez", "bez", "tak", "ale", "aj", "sme", "som", "je", "su", "byt"].map(normalize),
);

/** Kľúčové slová bodu osnovy: slová s aspoň 4 písmenami okrem bežných spojok. */
export function keywordsOf(point: string): string[] {
  const words = point.split(/\s+/).filter((w) => {
    const n = tokenize(w)[0];
    return n && n.length >= 4 && !STOPWORDS.has(n);
  });
  return words.length ? words : [point];
}

// ---------- výsledok porovnania ----------

export type PointStatus = "covered" | "partial" | "missing";
export type OrderVerdict = "kept" | "minor" | "jumped";

export const outlineCheckSchema = z.object({
  points: z.array(
    z.object({
      index: z.number().int().min(0),
      status: z.enum(["covered", "partial", "missing"]),
      clarity: z.number().int().min(0).max(10),
      note: z.string().min(1).max(240),
    }),
  ),
  onTopicPct: z.number().int().min(0).max(100),
  order: z.enum(["kept", "minor", "jumped"]),
  digressions: z.array(z.string().min(1).max(160)).max(3),
  clarity: z.number().int().min(0).max(10),
  takeaway: z.string().min(1).max(300),
  advice: z.string().min(1).max(280),
});
export type OutlineCheck = z.infer<typeof outlineCheckSchema>;

export type OutlinePointResult = { text: string; status: PointStatus; clarity: number | null; note: string | null };

/** Uložené pri pokuse (stĺpec `outline`). `check` je null, keď v nahrávke nebol prepis reči. */
export type OutlineResult = {
  version: 1;
  topic: string;
  points: string[];
  check: {
    /** ai = hodnotil jazykový model, keywords = len zhoda kľúčových slov (bez AI) */
    source: "ai" | "keywords";
    points: OutlinePointResult[];
    onTopicPct: number | null;
    order: OrderVerdict | null;
    digressions: string[];
    clarity: number | null;
    takeaway: string | null;
    advice: string | null;
  } | null;
};

/** Porovnanie bez AI: bod je pokrytý, keď zaznie aspoň polovica jeho kľúčových slov. */
export function keywordStatus(point: string, transcript: string): PointStatus {
  const tokens = tokenize(transcript);
  const stems = keywordsOf(point).map(stemOf);
  const hits = stems.filter((s) => tokens.some((t) => matchesStem(t, s))).length;
  if (hits === 0) return "missing";
  return hits * 2 >= stems.length ? "covered" : "partial";
}

export function outlineByKeywords(outline: PitchOutline, transcript: string): OutlineResult {
  return {
    version: 1,
    ...outline,
    check: {
      source: "keywords",
      points: outline.points.map((text) => ({ text, status: keywordStatus(text, transcript), clarity: null, note: null })),
      onTopicPct: null,
      order: null,
      digressions: [],
      clarity: null,
      takeaway: null,
      advice: null,
    },
  };
}

/** Výsledok modelu zladený s osnovou; bod, ktorý model vynechal, doplní zhoda kľúčových slov. */
export function outlineFromCheck(outline: PitchOutline, check: OutlineCheck, transcript: string): OutlineResult {
  return {
    version: 1,
    ...outline,
    check: {
      source: "ai",
      points: outline.points.map((text, index) => {
        const row = check.points.find((p) => p.index === index);
        return row
          ? { text, status: row.status, clarity: row.status === "missing" ? 0 : row.clarity, note: row.note }
          : { text, status: keywordStatus(text, transcript), clarity: null, note: null };
      }),
      onTopicPct: check.onTopicPct,
      order: check.order,
      digressions: check.digressions,
      clarity: check.clarity,
      takeaway: check.takeaway,
      advice: check.advice,
    },
  };
}

const STATUS_WEIGHT: Record<PointStatus, number> = { covered: 1, partial: 0.5, missing: 0 };

/** Zhoda s osnovou v percentách: pokrytý bod = 1, čiastočne = ½. Bez bodov rozhoduje držanie sa témy. */
export function matchPct(result: OutlineResult): number | null {
  const check = result.check;
  if (!check) return null;
  if (!check.points.length) return check.onTopicPct;
  return Math.round((check.points.reduce((sum, p) => sum + STATUS_WEIGHT[p.status], 0) / check.points.length) * 100);
}

export function parseOutlineResult(value: unknown): OutlineResult | null {
  const v = value as OutlineResult | null;
  return v && v.version === 1 && Array.isArray(v.points) ? v : null;
}

// ---------- prompt ----------

export const OUTLINE_SYSTEM = `Si skúsený mentor startupov. Porovnávaš nahraný pitch s témou a osnovou, ktorú si zakladateľ pripravil pred nahrávaním.
Téma je záväzné zadanie: celé hodnotenie robíš voči nej. Čo s témou nesúvisí, sa nezapočíta ako pokrytie žiadneho bodu ani ako držanie sa témy,
aj keď to znie dobre. Nevymýšľaj iné zameranie pitchu, než aké zakladateľ zadal.
Hodnotíš iba to, čo v prepise naozaj zaznelo. Prepis je automatický a môže mať chyby rozpoznávania reči, drobné skomoleniny neber ako nezrozumiteľnosť.
Pre každý bod osnovy (podľa jeho indexu) urči:
- status: covered = bod zaznel a je vysvetlený tak, že ho poslucháč pochopí; partial = bod sa len spomenul alebo chýba vysvetlenie; missing = nezaznel,
- clarity 0–10: ako zrozumiteľne bol bod vysvetlený človeku, ktorý o startupe nič nevie (0, ak bod chýba),
- note: jedna krátka veta, čo k bodu zaznelo alebo čo chýbalo.
Ďalej:
- onTopicPct 0–100: aký podiel pitchu sa držal témy a osnovy,
- order: kept = poradie bodov dodržané; minor = drobné prehodenie alebo krátka odbočka; jumped = preskakoval medzi bodmi tam a späť alebo sa k bodom vracal,
- digressions: najviac 3 krátke opisy odbočiek mimo témy (prázdne pole, ak žiadne neboli),
- clarity 0–10: celková zrozumiteľnosť pitchu,
- takeaway: jedna až dve vety, čo si poslucháč z pitchu reálne odnesie (napíš to jeho očami, nie čo zakladateľ chcel povedať), a či to zodpovedá zadanej téme,
- advice: jedna konkrétna vec, ktorú pri ďalšom pokuse zlepšiť, aby pitch lepšie sedel s osnovou.
Ak osnova nemá body, vráť prázdne pole points a hodnoť len držanie sa témy.
Píš po slovensky v tykaní, vľúdne a koučovacie, nikdy karhajúce.`;

const AUDIENCE_BRIEF: Record<Audience, string> = {
  investor: "investor",
  jury: "porota na demo day alebo súťaži",
  customer: "zákazník alebo partner",
  team: "vlastný tím",
};

/** Prepis do promptu (aj dlhý prejav, ~30 min reči). */
export const TRANSCRIPT_PROMPT_MAX = 60_000;

export function buildOutlinePrompt(input: {
  outline: PitchOutline;
  transcript: string;
  audience: Audience;
  language?: string | null;
  feedbackLocale?: "sk" | "en";
}): string {
  return [
    `Publikum: ${AUDIENCE_BRIEF[input.audience]}.`,
    input.feedbackLocale === "en"
      ? "IMPORTANT: Write all text fields (note, takeaway, advice, digressions) in English (informal, friendly second person), regardless of the pitch language or the instructions above."
      : input.language && input.language !== "Slovak"
        ? `Pitch je v jazyku: ${input.language}. Všetky texty (note, takeaway, advice, digressions) píš po slovensky.`
        : null,
    input.outline.topic ? `Téma pitchu (záväzné zadanie):\n"""${input.outline.topic}"""` : "Téma pitchu nie je zadaná, odvoď ju z osnovy.",
    input.outline.points.length
      ? `Osnova (index: bod):\n${input.outline.points.map((p, i) => `${i}: ${p}`).join("\n")}`
      : "Osnova nemá body.",
    `Prepis pitchu:\n"""${input.transcript.slice(0, TRANSCRIPT_PROMPT_MAX)}"""`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
