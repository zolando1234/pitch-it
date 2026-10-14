/*
  Merania z textu prepisu. Čisté funkcie bez závislostí, bežia na serveri aj v prehliadači.

  Obmedzenie (dôležité pre interpretáciu): modely prepisu často vynechávajú zaváhania
  („ehm“, „eee“). Počet výplňových slov je preto dolný odhad, nie presné meranie.
*/

const WORD_PATTERN = /[\p{L}\p{N}]+(?:[-'’][\p{L}\p{N}]+)*/gu;

export function tokenizeWords(text: string): string[] {
  return (text.toLowerCase().match(WORD_PATTERN) ?? []).filter(Boolean);
}

export function countWords(text: string): number {
  return tokenizeWords(text).length;
}

export type FillerKind = "hesitation" | "discourse";

/** Jazyk prejavu (kód ISO 639-1). Jazyky bez vlastného zoznamu majú len všeobecné zaváhania. */
export type FillerLanguage = string;

type FillerEntry = { phrase: string[]; kind: FillerKind };

/**
 * Slovenské výplňové slová.
 * hesitation = zaváhanie (takmer vždy výplň),
 * discourse = slová, ktoré bývajú výplňou, ale môžu mať aj význam (počítajú sa ako „možné“).
 */
const FILLERS: FillerEntry[] = [
  { phrase: ["ehm"], kind: "hesitation" },
  { phrase: ["ehem"], kind: "hesitation" },
  { phrase: ["hm"], kind: "hesitation" },
  { phrase: ["hmm"], kind: "hesitation" },
  { phrase: ["eee"], kind: "hesitation" },
  { phrase: ["ee"], kind: "hesitation" },
  { phrase: ["eh"], kind: "hesitation" },
  { phrase: ["em"], kind: "hesitation" },
  { phrase: ["emm"], kind: "hesitation" },
  { phrase: ["mmm"], kind: "hesitation" },
  { phrase: ["akože"], kind: "discourse" },
  { phrase: ["proste"], kind: "discourse" },
  { phrase: ["vlastne"], kind: "discourse" },
  { phrase: ["v", "podstate"], kind: "discourse" },
  { phrase: ["ako", "keby"], kind: "discourse" },
  { phrase: ["jako"], kind: "discourse" },
  { phrase: ["nejako"], kind: "discourse" },
  { phrase: ["akosi"], kind: "discourse" },
  { phrase: ["že", "áno"], kind: "discourse" },
  { phrase: ["že", "jo"], kind: "discourse" },
  { phrase: ["viete"], kind: "discourse" },
  { phrase: ["vieš"], kind: "discourse" },
];

const HESITATIONS: FillerEntry[] = ["ehm", "ehem", "hm", "hmm", "eee", "ee", "eh", "em", "emm", "mmm"].map((w) => ({ phrase: [w], kind: "hesitation" as const }));

const discourse = (...phrases: string[]): FillerEntry[] => phrases.map((p) => ({ phrase: p.split(" "), kind: "discourse" as const }));

/** Výplňové slová podľa jazyka. Slovenčina je pôvodný zoznam vyššie. */
const FILLERS_BY_LANGUAGE: Record<string, FillerEntry[]> = {
  sk: FILLERS,
  cs: [...HESITATIONS, ...discourse("jakoby", "prostě", "vlastně", "v podstatě", "jako", "nějak", "že jo", "víte", "víš")],
  en: [
    ...HESITATIONS,
    ...["um", "umm", "uh", "uhh", "erm", "er"].map((w) => ({ phrase: [w], kind: "hesitation" as const })),
    ...discourse("like", "you know", "basically", "actually", "i mean", "kind of", "sort of", "literally"),
  ],
  de: [
    ...HESITATIONS,
    ...["äh", "ähm", "öh", "öhm"].map((w) => ({ phrase: [w], kind: "hesitation" as const })),
    ...discourse("halt", "quasi", "sozusagen", "irgendwie", "eigentlich", "weißt du"),
  ],
  pl: [
    ...HESITATIONS,
    ...["yyy", "yy", "eee"].map((w) => ({ phrase: [w], kind: "hesitation" as const })),
    ...discourse("jakby", "w sumie", "generalnie", "właściwie", "wiesz", "tak jakby"),
  ],
  hu: [
    ...HESITATIONS,
    ...["ööö", "öö", "ő"].map((w) => ({ phrase: [w], kind: "hesitation" as const })),
    ...discourse("izé", "szóval", "ugye", "tulajdonképpen", "hát", "mondjuk"),
  ],
  es: [...HESITATIONS, ...discourse("o sea", "pues", "este", "en plan", "digamos")],
  fr: [...HESITATIONS, ...["euh", "heu", "bah", "ben"].map((w) => ({ phrase: [w], kind: "hesitation" as const })), ...discourse("du coup", "en fait", "genre", "voilà", "tu vois")],
  it: [...HESITATIONS, ...discourse("cioè", "tipo", "praticamente", "allora", "insomma", "diciamo")],
  pt: [...HESITATIONS, ...discourse("tipo", "né", "então", "basicamente", "pronto")],
  nl: [...HESITATIONS, ...["uh", "uhm", "eh"].map((w) => ({ phrase: [w], kind: "hesitation" as const })), ...discourse("eigenlijk", "zeg maar", "weet je", "gewoon")],
  ru: [...["э", "ээ", "эээ", "м", "мм"].map((w) => ({ phrase: [w], kind: "hesitation" as const })), ...discourse("типа", "как бы", "короче", "в общем", "значит")],
  uk: [...["е", "ее", "еее", "м", "мм"].map((w) => ({ phrase: [w], kind: "hesitation" as const })), ...discourse("типу", "як би", "коротше", "загалом", "значить")],
};

const fillersFor = (language: FillerLanguage): FillerEntry[] => FILLERS_BY_LANGUAGE[language] ?? HESITATIONS;

/** Jednoslovné výplne jazyka (na zvýraznenie v prepise). */
export function fillerWordsFor(language: FillerLanguage = "sk"): Set<string> {
  return new Set(fillersFor(language).filter((f) => f.phrase.length === 1).map((f) => f.phrase[0]));
}

export type FillerCount = {
  total: number;
  hesitation: number;
  discourse: number;
  /** Počty podľa výrazu, napr. { "ehm": 2, "v podstate": 1 }. */
  byPhrase: Record<string, number>;
};

export function countFillers(text: string, language: FillerLanguage = "sk"): FillerCount {
  const words = tokenizeWords(text);
  const byPhrase: Record<string, number> = {};
  let hesitation = 0;
  let discourse = 0;

  // Najprv dlhšie frázy, aby „v podstate“ nezapočítalo „v“ samostatne.
  const entries = [...fillersFor(language)].sort((a, b) => b.phrase.length - a.phrase.length);
  let index = 0;
  while (index < words.length) {
    const match = entries.find((entry) =>
      entry.phrase.every((part, offset) => words[index + offset] === part),
    );
    if (match) {
      const key = match.phrase.join(" ");
      byPhrase[key] = (byPhrase[key] ?? 0) + 1;
      if (match.kind === "hesitation") hesitation += 1;
      else discourse += 1;
      index += match.phrase.length;
    } else {
      index += 1;
    }
  }

  return { total: hesitation + discourse, hesitation, discourse, byPhrase };
}

/** Slová za minútu. Null, ak je čas reči príliš krátky na spoľahlivý výpočet. */
export function wordsPerMinute(wordCount: number, speechMs: number, minSpeechMs = 4_000): number | null {
  if (speechMs < minSpeechMs || wordCount === 0) return null;
  return Math.round((wordCount / (speechMs / 60_000)) * 10) / 10;
}

/** Výplňové slová na 100 slov. */
export function fillerRate(fillers: number, words: number): number | null {
  if (words < 20) return null;
  return Math.round((fillers / words) * 1000) / 10;
}

/**
 * Opakovanie: podiel slovných trigramov, ktoré sa v odpovedi vyskytujú viackrát.
 * Ide o hrubý signál „točenia sa v kruhu“, nie o hodnotenie obsahu.
 */
export function repeatedTrigramRatio(text: string): number | null {
  const words = tokenizeWords(text).filter((word) => word.length > 2);
  if (words.length < 30) return null;
  const counts = new Map<string, number>();
  for (let i = 0; i + 2 < words.length; i += 1) {
    const key = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const total = words.length - 2;
  let repeated = 0;
  for (const count of counts.values()) if (count > 1) repeated += count;
  return Math.round((repeated / total) * 1000) / 1000;
}

/** Priemerná pravdepodobnosť tokenov prepisu z logprobs (0 až 1). */
export function transcriptConfidence(logprobs: ReadonlyArray<{ logprob: number }> | null | undefined): number | null {
  if (!logprobs || logprobs.length === 0) return null;
  const sum = logprobs.reduce((acc, item) => acc + Math.exp(item.logprob), 0);
  return Math.round((sum / logprobs.length) * 1000) / 1000;
}
