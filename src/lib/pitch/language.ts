/*
  Jazyk nahraného pitchu: podľa neho sa vyberie model prepisu reči, jazyk živých titulkov,
  vypĺňacie slová a počítanie slabík. Spätná väzba ostáva po slovensky.
*/

export const PITCH_LANGUAGES = ["sk", "cs", "en", "de", "pl", "hu"] as const;
export type PitchLanguage = (typeof PITCH_LANGUAGES)[number];

export type SttProvider = "elevenlabs" | "mistral" | "openai";

export const STT_LABELS: Record<SttProvider, string> = {
  elevenlabs: "ElevenLabs Scribe",
  mistral: "Mistral Voxtral",
  openai: "OpenAI Whisper",
};

/**
 * Poradie modelov prepisu pre jazyk (použije sa prvý nakonfigurovaný, pri výpadku ďalší).
 * Voxtral nevie naraz jazyk a časy slov a slovenčinu ani češtinu nepodporuje, preto pre ne
 * ide prvý ElevenLabs Scribe, ktorý jazyk aj časy slov zvládne v jednej požiadavke.
 */
const SCRIBE_FIRST: SttProvider[] = ["elevenlabs", "openai", "mistral"];
const VOXTRAL_FIRST: SttProvider[] = ["mistral", "elevenlabs", "openai"];

export const LANGUAGE_INFO: Record<PitchLanguage, { label: string; adjective: string; english: string; bcp47: string; stt: SttProvider[] }> = {
  sk: { label: "Slovenčina", adjective: "slovenčine", english: "Slovak", bcp47: "sk-SK", stt: SCRIBE_FIRST },
  cs: { label: "Čeština", adjective: "češtine", english: "Czech", bcp47: "cs-CZ", stt: SCRIBE_FIRST },
  en: { label: "English", adjective: "angličtine", english: "English", bcp47: "en-US", stt: VOXTRAL_FIRST },
  de: { label: "Deutsch", adjective: "nemčine", english: "German", bcp47: "de-DE", stt: VOXTRAL_FIRST },
  pl: { label: "Polski", adjective: "poľštine", english: "Polish", bcp47: "pl-PL", stt: SCRIBE_FIRST },
  hu: { label: "Magyar", adjective: "maďarčine", english: "Hungarian", bcp47: "hu-HU", stt: SCRIBE_FIRST },
};

export function parseLanguage(value: unknown): PitchLanguage {
  return PITCH_LANGUAGES.includes(value as PitchLanguage) ? (value as PitchLanguage) : "sk";
}

/** Prvý model prepisu pre jazyk spomedzi nakonfigurovaných. */
export function sttOrder(language: PitchLanguage, configured: Record<SttProvider, boolean>): SttProvider[] {
  return LANGUAGE_INFO[language].stt.filter((p) => configured[p]);
}
