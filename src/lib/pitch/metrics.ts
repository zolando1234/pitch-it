import { countFillers, fillerWordsFor, tokenizeWords } from "@/lib/analytics/speech/text-metrics";
import { LANGUAGE_INFO, type PitchLanguage } from "@/lib/pitch/language";

/*
  Merania nahraného pitchu z prepisu so slovnými časmi (Whisper).
  Čisté funkcie, bežia na serveri aj v prehliadači.

  - Tempo: slabiky za sekundu počas reči (bez páuz nad 1 s). Cieľ 3,5 až 5.
  - Pauzy: medzery medzi slovami nad 1 s. Po konci vety = „dôraz“, uprostred vety = „zaváhanie“.
  - Vypĺňacie slová: dolný odhad (prepis často vynechá „ehm“).
*/

export type TimedWord = { word: string; start: number; end: number };

export const TEMPO_TARGET = { min: 3.5, max: 5 } as const;
/** Rozsah stupnice tempa vo feedbacku: cieľové okno zaberá stredných 40 %. */
export const TEMPO_SCALE = { min: 1.625, max: 6.875 } as const;
export const PAUSE_MIN_MS = 1_000;

export type PauseKind = "emphasis" | "hesitation";
export type Pause = { afterWord: number; ms: number; kind: PauseKind };

/** Úsek prepisu pre zobrazenie s označením. */
export type TranscriptToken =
  | { type: "word"; text: string; filler: boolean }
  | { type: "pause"; ms: number; kind: PauseKind };

export type PitchMetrics = {
  version: 1;
  durationMs: number;
  speechMs: number;
  words: number;
  syllables: number;
  /** Slabiky za sekundu, null pri príliš krátkej reči. */
  tempo: number | null;
  pauses: Pause[];
  longestPauseMs: number | null;
  fillers: { total: number; byPhrase: Record<string, number> };
  /** Vypĺňacie slová prepočítané na 60 sekúnd nahrávky. */
  fillersPer60s: number;
  tokens: TranscriptToken[];
};

const VOWELS = "aáäeéěiíoóôuúůyý";
const SYLLABIC = "rlŕĺ";
const DIPHTHONGS = ["ia", "ie", "iu", "ô"];

/** Samohlásky jazykov bez vlastných pravidiel: slabika = skupina samohlások za sebou. */
const GENERIC_VOWELS = "aeiouyàáâãäåæèéêëìíîïòóôõöøùúûüýÿāăąēėęěīįıōőœūůűųəаеёиоуыэюяіїєαεηιουωάέήίόύώϊϋΐΰ";
const VOWEL_GROUPS: Partial<Record<PitchLanguage, string>> = {
  en: "aeiouy",
  de: "aeiouyäöü",
  pl: "aeiouyąęó",
  hu: "aáeéiíoóöőuúüű",
};

/** Počet slabík slova. Slovenčina a čeština: samohlásky, dvojhlásky, slabikotvorné r/l; ostatné jazyky: skupiny samohlások. */
export function countSyllables(word: string, language: PitchLanguage = "sk"): number {
  const w = word.toLowerCase().replace(/[^\p{L}]/gu, "");
  if (!w) return 0;
  const groups = VOWEL_GROUPS[language] ?? (language === "sk" || language === "cs" ? undefined : GENERIC_VOWELS);
  if (groups) {
    let n = 0;
    for (let i = 0; i < w.length; i++) if (groups.includes(w[i]) && (i === 0 || !groups.includes(w[i - 1]))) n++;
    // anglické nemé -e na konci (make, code)
    if (language === "en" && n > 1 && w.endsWith("e") && !w.endsWith("le") && !groups.includes(w[w.length - 2])) n--;
    return Math.max(1, n);
  }
  let count = 0;
  for (let i = 0; i < w.length; i++) {
    const c = w[i];
    if (VOWELS.includes(c)) {
      // Dvojhláska ia/ie/iu je jedna slabika.
      if (c === "i" && i + 1 < w.length && "aeu".includes(w[i + 1]) && DIPHTHONGS.includes(c + w[i + 1])) i++;
      count++;
      continue;
    }
    // Slabikotvorné r/l medzi spoluhláskami (vlk, krv, trh) alebo ŕ/ĺ.
    if (SYLLABIC.includes(c)) {
      const prev = w[i - 1];
      const next = w[i + 1];
      const consonant = (x: string | undefined) => x !== undefined && !VOWELS.includes(x);
      if (c === "ŕ" || c === "ĺ" || (consonant(prev) && (next === undefined || consonant(next)))) count++;
    }
  }
  return Math.max(1, count);
}

const FILLER_WORDS = new Set(["ehm", "ehem", "hm", "hmm", "eee", "ee", "eh", "em", "emm", "mmm", "akože", "proste", "vlastne", "jakoby", "tak", "teda", "no"]);

/** Výrazy, ktoré sa vo feedbacku zvýraznia ako vypĺňacie (iba istejšie z nich). */
export function isFillerWord(word: string, language: PitchLanguage = "sk"): boolean {
  const w = word.toLowerCase().replace(/[^\p{L}]/gu, "");
  if (language !== "sk") return fillerWordsFor(language).has(w) && !["hát", "like"].includes(w);
  return FILLER_WORDS.has(w) && !["tak", "teda", "no"].includes(w);
}

/** Vety v pôvodnom texte končia bodkou, otáznikom alebo výkričníkom. Priradí koniec vety k slovám. */
function sentenceEnds(text: string, wordCount: number): boolean[] {
  const ends: boolean[] = new Array(wordCount).fill(false);
  const pieces = text.match(/[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*[^\p{L}\p{N}]*/gu) ?? [];
  for (let i = 0; i < Math.min(pieces.length, wordCount); i++) ends[i] = /[.!?…]/.test(pieces[i]);
  return ends;
}

export function buildMetrics(input: { text: string; words: TimedWord[]; durationMs: number; language?: PitchLanguage }): PitchMetrics {
  const language = input.language ?? "sk";
  const words = input.words.filter((w) => w.word.trim());
  const ends = sentenceEnds(input.text, words.length);
  const pauses: Pause[] = [];
  let pausedMs = 0;
  for (let i = 0; i + 1 < words.length; i++) {
    const gap = Math.round((words[i + 1].start - words[i].end) * 1000);
    if (gap >= PAUSE_MIN_MS) {
      pauses.push({ afterWord: i, ms: gap, kind: ends[i] ? "emphasis" : "hesitation" });
      pausedMs += gap;
    }
  }

  const spokenWords = words.length > 0 ? words : tokenizeWords(input.text).map((word) => ({ word, start: 0, end: 0 }));
  const syllables = spokenWords.reduce((sum, w) => sum + countSyllables(w.word, language), 0);
  const span = words.length > 1 ? Math.round((words[words.length - 1].end - words[0].start) * 1000) : input.durationMs;
  const speechMs = Math.max(0, span - pausedMs);
  // jazyky bez abecedných samohlások (japončina…) tempo v slabikách nemajú
  const tempo = speechMs >= 4_000 && LANGUAGE_INFO[language].syllables ? Math.round((syllables / (speechMs / 1000)) * 10) / 10 : null;

  const fillers = countFillers(input.text, language);
  const tokens: TranscriptToken[] = [];
  const display = (input.text.match(/\S+/g) ?? []).length === words.length ? (input.text.match(/\S+/g) as string[]) : words.map((w) => w.word);
  display.forEach((text, i) => {
    tokens.push({ type: "word", text, filler: isFillerWord(text, language) });
    const pause = pauses.find((p) => p.afterWord === i);
    if (pause) tokens.push({ type: "pause", ms: pause.ms, kind: pause.kind });
  });

  return {
    version: 1,
    durationMs: input.durationMs,
    speechMs,
    words: spokenWords.length,
    syllables,
    tempo,
    pauses,
    longestPauseMs: pauses.length ? Math.max(...pauses.map((p) => p.ms)) : null,
    fillers: { total: fillers.total, byPhrase: fillers.byPhrase },
    fillersPer60s: input.durationMs > 0 ? Math.round((fillers.total / (input.durationMs / 60_000)) * 10) / 10 : fillers.total,
    tokens,
  };
}

/** Poloha tempa na stupnici feedbacku v percentách (0–100). */
export function tempoPosition(tempo: number): number {
  const x = (tempo - TEMPO_SCALE.min) / (TEMPO_SCALE.max - TEMPO_SCALE.min);
  return Math.round(Math.max(0, Math.min(1, x)) * 100);
}

export type TempoVerdict = "slow" | "target" | "fast";
export function tempoVerdict(tempo: number): TempoVerdict {
  if (tempo < TEMPO_TARGET.min) return "slow";
  if (tempo > TEMPO_TARGET.max) return "fast";
  return "target";
}

export const TEMPO_ADVICE: Record<TempoVerdict, string> = {
  slow: "Hovoríš pomalšie, ako je cieľ. Skráť pauzy medzi vetami a nechaj tempo plynúť, pomalé miesta si nechaj na čísla.",
  target: "Tempo máš v cieľovom okne. Pri čísle o trhu spomaľ, aby ho investor stihol zachytiť.",
  fast: "Hovoríš rýchlejšie, ako je cieľ. Po každej kľúčovej vete sa nadýchni a pri číslach spomaľ.",
};

export const TEMPO_ADVICE_EN: Record<TempoVerdict, string> = {
  slow: "You speak slower than the target. Shorten the pauses between sentences and let the pace flow, keep the slow parts for numbers.",
  target: "Your pace is in the target window. Slow down on the market number so the investor can catch it.",
  fast: "You speak faster than the target. Take a breath after every key sentence and slow down on numbers.",
};

/** Slovenský tvar pre „pauza“ podľa počtu. */
export function pausesLabel(n: number): string {
  if (n === 1) return "pauza nad 1 sekundu";
  if (n >= 2 && n <= 4) return "pauzy nad 1 sekundu";
  return "páuz nad 1 sekundu";
}

/** Desatinné číslo so slovenskou čiarkou. */
export function decimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}
