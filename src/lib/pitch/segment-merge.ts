/*
  Priebežný prepis: nahrávka sa počas prejavu posiela po úsekoch (~30 s, strih v tichu)
  a každý úsek sa prepíše hneď. Na konci sa úseky spoja do jedného prepisu so slovnými
  časmi od začiatku nahrávky. Čisté funkcie, testované.
*/

export type SegmentWord = { word: string; start: number; end: number };

export type TranscribedSegment = {
  index: number;
  /** začiatok úseku v nahrávke (ms) */
  offsetMs: number;
  text: string;
  words: SegmentWord[];
  provider: string | null;
};

/** Najviac úsekov jedného prejavu (30 min po ~30 s s rezervou). */
export const MAX_SEGMENTS = 90;

/** Spojí úseky v poradí; časy slov posunie o začiatok úseku. */
export function mergeSegments(segments: TranscribedSegment[]): { text: string; words: SegmentWord[]; provider: string | null } {
  const ordered = [...segments].sort((a, b) => a.index - b.index);
  const words: SegmentWord[] = [];
  const texts: string[] = [];
  for (const segment of ordered) {
    const offset = segment.offsetMs / 1000;
    for (const w of segment.words) words.push({ word: w.word, start: w.start + offset, end: w.end + offset });
    if (segment.text.trim()) texts.push(segment.text.trim());
  }
  return { text: texts.join(" "), words, provider: ordered.find((s) => s.provider)?.provider ?? null };
}

/** Chýbajúce indexy úsekov 0…count-1. */
export function missingSegments(present: number[], count: number): number[] {
  const have = new Set(present);
  return Array.from({ length: count }, (_, i) => i).filter((i) => !have.has(i));
}
