import { z } from "zod";
import { OUTLINE_MAX_POINTS, type OutlineResult, type PitchOutline } from "@/lib/pitch/outline";

/*
  Rozbor prejavu jedným volaním AI (lacnejšie ako viac volaní): držanie sa témy a osnovy,
  zrozumiteľnosť, celkové skóre reči, čo si poslucháč odnesie, zbytočné časti, problematické
  vety v prepise a obsahové skóre podľa osnovy, ktorú si človek zadal (bez osnovy podľa
  hlavných bodov odvodených z témy). Čisté funkcie a schémy, testované.
*/

/** Najviac viet, ktoré model označí (dlhý prejav nesmie natiahnuť odpoveď). */
export const MAX_FLAGGED_SENTENCES = 40;

export const SENTENCE_ISSUES = ["unclear", "convoluted", "stutter", "grammar", "offtopic", "vague"] as const;
export type SentenceIssue = (typeof SENTENCE_ISSUES)[number];
export const WASTE_KINDS = ["offtopic", "unnecessary", "overexplain"] as const;
export type WasteKind = (typeof WASTE_KINDS)[number];

const scored = z.object({ score: z.number().int().min(0).max(10), note: z.string().max(260) });

export const speechAnalysisSchema = z.object({
  topic: scored,
  outline: scored.extend({ order: z.enum(["kept", "minor", "jumped"]) }),
  clarity: scored,
  overall: z.object({ score: z.number().int().min(0).max(10), summary: z.string().min(1).max(420) }),
  takeaway: z.string().min(1).max(320),
  onTopicPct: z.number().int().min(0).max(100),
  points: z
    .array(
      z.object({
        index: z.number().int().min(0),
        title: z.string().max(200),
        status: z.enum(["covered", "partial", "missing"]),
        score: z.number().int().min(0).max(10),
        note: z.string().max(260),
      }),
    )
    .max(OUTLINE_MAX_POINTS),
  waste: z
    .array(z.object({ quote: z.string().max(200), kind: z.enum(WASTE_KINDS), note: z.string().max(220) }))
    .max(6),
  sentences: z
    .array(
      z.object({
        index: z.number().int().min(0),
        severity: z.enum(["minor", "major"]),
        issue: z.enum(SENTENCE_ISSUES),
        note: z.string().max(180),
      }),
    )
    .max(MAX_FLAGGED_SENTENCES),
  advice: z.string().min(1).max(300),
});
export type SpeechAnalysis = z.infer<typeof speechAnalysisSchema>;

/** Uložené v stĺpci `content` (verzia 2; verzia 1 bola investorská rubrika). */
export type StoredSpeechAnalysis = {
  version: 2;
  analysis: SpeechAnalysis;
  /** staršie rozbory: body odvodené z témy (dnes sa hodnotia len body zadané v osnove) */
  derivedPoints: boolean;
};

export function parseSpeechAnalysis(value: unknown): StoredSpeechAnalysis | null {
  const v = value as StoredSpeechAnalysis | null;
  return v && v.version === 2 && v.analysis && Array.isArray(v.analysis.points) ? v : null;
}

/** Vety prepisu: slová (oddelené medzerou) až po slovo končiace . ! ? alebo …  */
export function splitSentences(text: string): string[] {
  const words = text.match(/\S+/g) ?? [];
  const out: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (/[.!?…]["“”»)]*$/.test(word)) {
      out.push(current.join(" "));
      current = [];
    }
  }
  if (current.length) out.push(current.join(" "));
  return out;
}

/** Obsahové skóre: priemer skóre bodov osnovy (0–10, jedno desatinné miesto). */
export function contentScoreOf(analysis: SpeechAnalysis): number | null {
  if (!analysis.points.length) return null;
  return Math.round((analysis.points.reduce((sum, p) => sum + p.score, 0) / analysis.points.length) * 10) / 10;
}

/** Výsledok porovnania s osnovou (stĺpec `outline`) z rozboru, aby progres a staršie časti fungovali ďalej. */
export function outlineFromAnalysis(outline: PitchOutline, analysis: SpeechAnalysis): OutlineResult {
  return {
    version: 1,
    ...outline,
    check: {
      source: "ai",
      points: outline.points.map((text, index) => {
        const row = analysis.points.find((p) => p.index === index);
        return row ? { text, status: row.status, clarity: row.status === "missing" ? 0 : row.score, note: row.note } : { text, status: "missing" as const, clarity: 0, note: null };
      }),
      onTopicPct: analysis.onTopicPct,
      order: analysis.outline.order,
      digressions: analysis.waste.filter((w) => w.kind === "offtopic").map((w) => w.note || w.quote).slice(0, 3),
      clarity: analysis.clarity.score,
      takeaway: analysis.takeaway,
      advice: analysis.advice,
    },
  };
}

export const SPEECH_SYSTEM = `Si kouč verejného vystupovania. Rozoberáš nahraný prejav (pitch, prednášku, prezentáciu) podľa prepisu.
Hodnotíš iba to, čo v prepise naozaj zaznelo; prepis je automatický, drobné chyby rozpoznávania reči neber ako chybu rečníka.
Téma je záväzné zadanie: čo s ňou nesúvisí, sa nezapočíta. Nevymýšľaj iné zameranie, než aké rečník zadal.

Vráť:
- topic: ako sa držal témy (0–10) a note = jedna veta prečo.
- outline: ako sa držal osnovy (0–10), order (kept = poradie dodržané; minor = drobné prehodenie; jumped = skákal medzi bodmi) a note.
- clarity: zrozumiteľnosť pre človeka, ktorý o téme nič nevie (0–10) a note.
- overall: celkové skóre reči (0–10: obsah, štruktúra, zrozumiteľnosť a plynulosť dokopy) a summary = 1–2 vety.
- takeaway: 1–2 vety, čo si poslucháč reálne odnesie (jeho očami) a či to sedí so zadanou témou.
- onTopicPct: podiel prejavu, ktorý sa držal témy (0–100).
- points: pre každý bod osnovy (podľa indexu; title = text bodu) status (covered = vysvetlené tak, že to poslucháč pochopí; partial = len spomenuté;
  missing = nezaznelo), score 0–10 = ako dobre a presvedčivo bol bod obsahovo podaný (0, ak chýba) a note = čo zaznelo alebo čo chýbalo.
  Hodnoť iba body osnovy, ktoré zadal rečník; ak osnova nie je zadaná, vráť prázdne pole points a žiadne body si nevymýšľaj.
- waste: najviac 6 miest, kde rečník plytval časom: offtopic = mimo témy, unnecessary = zbytočné slová či opakovanie bez prínosu,
  overexplain = vysvetľoval príliš dlho alebo zbytočne podrobne. quote = krátky citát z prepisu, note = čo s tým urobiť.
- sentences: vety z očíslovaného prepisu, ktoré majú problém (najviac ${MAX_FLAGGED_SENTENCES}; vety bez problému nevracaj):
  issue = unclear (nezrozumiteľná), convoluted (zamotaná, ťažko pochopiteľná, rečník sa v nej zamotal), stutter (zakoktanie, začatá a nedokončená veta,
  opakovanie slov), grammar (gramaticky zle), offtopic (mimo témy), vague (všeobecná bez obsahu); severity minor = drobnosť, major = vážne
  zhoršuje pochopenie; note = krátka rada, ako vetu povedať lepšie.
- advice: jedna najdôležitejšia vec na ďalší pokus.
V textoch nikdy neodkazuj na čísla viet (žiadne „veta [3]“), radšej krátko cituj slová z prepisu.
Tón vľúdny, koučovací, v tykaní, nikdy karhajúci.`;

/** Odkazy na čísla viet („veta [3]“, „(veta [5])“) človeku nič nepovedia: zo zobrazených textov ich odstránime. */
export function stripSentenceRefs(text: string): string {
  return text
    .replace(/\s*\((?:vet[ayu]|sentence)\s*\[\d+\]\)/gi, "")
    .replace(/(?:vet[ayu]|sentence)\s*\[\d+\]\s*/gi, "")
    .replace(/\s*\[\d+\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^\s*\p{Ll}/u, (c) => c.toUpperCase())
    .trim();
}

export function buildSpeechPrompt(input: {
  sentences: string[];
  audience: string;
  targetSeconds: number;
  durationMs: number;
  language: string;
  feedbackLocale: "sk" | "en";
  outline: PitchOutline | null;
  context: string | null;
}): string {
  const points = input.outline?.points ?? [];
  return [
    input.feedbackLocale === "en"
      ? "IMPORTANT: Write every text field (note, summary, takeaway, title of derived points, advice) in English (informal, friendly second person)."
      : "Všetky texty píš po slovensky.",
    `Jazyk prejavu: ${input.language}. Publikum: ${input.audience}. Cieľová dĺžka ${input.targetSeconds} s, skutočná ${Math.round(input.durationMs / 1000)} s.`,
    input.outline?.topic ? `Téma (záväzné zadanie):\n"""${input.outline.topic}"""` : "Téma nie je zadaná, odvoď ju z prejavu a podkladov.",
    points.length ? `Osnova (index: bod):\n${points.map((p, i) => `${i}: ${p}`).join("\n")}` : "Osnova nie je zadaná: points vráť prázdne.",
    input.context ? `Podklady o firme a prezentácii (fakty, na porovnanie):\n"""${input.context}"""` : null,
    `Prepis po vetách ([index] veta):\n${input.sentences.map((s, i) => `[${i}] ${s}`).join("\n")}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}
