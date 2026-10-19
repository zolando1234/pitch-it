/*
  Poistka proti zlému prepisu úseku: občas model prepisu vráti zmes náhodných slov z rôznych jazykov
  (napr. pri hluku). Taký prepis má nemožne veľa slov za sekundu, preto ho zopakujeme.
  Čisté funkcie, testované.
*/

/** Bežná reč má okolo 2–4 slov za sekundu; nad túto hranicu je prepis nepravdepodobný. */
export const MAX_WORDS_PER_SECOND = 7;
/** kratšie úseky sa neposudzujú (jedno slovo v krátkom zvuku) */
const MIN_SECONDS = 3;

/** Dĺžka WAV úseku (16 kHz, mono, 16 bit) v sekundách z veľkosti súboru. */
export function wavSeconds(bytes: number): number {
  return Math.max(0, bytes - 44) / 32_000;
}

/** Je prepis podozrivý? `words` = počet slov, `seconds` = dĺžka zvuku. */
export function implausibleTranscript(words: number, seconds: number): boolean {
  if (seconds < MIN_SECONDS) return false;
  return words / seconds > MAX_WORDS_PER_SECOND;
}
