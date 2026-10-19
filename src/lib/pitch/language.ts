/*
  Jazyk prejavu: podľa neho sa vyberie model prepisu reči, jazyk živých titulkov, vypĺňacie
  slová, počítanie slabík a jazyk otázok v Q&A. Ponúkame jazyky, ktoré ElevenLabs Scribe v2
  prepisuje najpresnejšie (chybovosť do 5 %).
*/

export const PITCH_LANGUAGES = [
  "sk", "cs", "en", "de", "pl", "hu",
  "be", "bs", "bg", "ca", "hr", "da", "nl", "et", "fi", "fr", "gl", "el", "is", "id", "it", "ja",
  "kn", "lv", "mk", "ms", "ml", "no", "pt", "ro", "ru", "es", "sv", "tr", "uk", "vi",
] as const;
export type PitchLanguage = (typeof PITCH_LANGUAGES)[number];

export type SttProvider = "elevenlabs" | "openai";

export const STT_LABELS: Record<SttProvider, string> = {
  elevenlabs: "ElevenLabs Scribe",
  openai: "OpenAI Whisper",
};

/** Najprv ElevenLabs Scribe (jazyk aj časy slov v jednej požiadavke), pri výpadku OpenAI Whisper. */
const STT_ORDER: SttProvider[] = ["elevenlabs", "openai"];

export type LanguageInfo = {
  /** názov v danom jazyku (v zozname jazykov) */
  label: string;
  /** názov po slovensky */
  slovak: string;
  english: string;
  bcp47: string;
  /** kód pre ElevenLabs Scribe (ISO 639-3) */
  scribe: string;
  /** slabiky sa dajú odhadnúť zo samohlások (tempo v slabikách za sekundu) */
  syllables: boolean;
};

const L = (label: string, slovak: string, english: string, bcp47: string, scribe: string, syllables = true): LanguageInfo => ({
  label,
  slovak,
  english,
  bcp47,
  scribe,
  syllables,
});

export const LANGUAGE_INFO: Record<PitchLanguage, LanguageInfo> = {
  sk: L("Slovenčina", "slovenčina", "Slovak", "sk-SK", "slk"),
  cs: L("Čeština", "čeština", "Czech", "cs-CZ", "ces"),
  en: L("English", "angličtina", "English", "en-US", "eng"),
  de: L("Deutsch", "nemčina", "German", "de-DE", "deu"),
  pl: L("Polski", "poľština", "Polish", "pl-PL", "pol"),
  hu: L("Magyar", "maďarčina", "Hungarian", "hu-HU", "hun"),
  be: L("Беларуская", "bieloruština", "Belarusian", "be-BY", "bel"),
  bs: L("Bosanski", "bosniačtina", "Bosnian", "bs-BA", "bos"),
  bg: L("Български", "bulharčina", "Bulgarian", "bg-BG", "bul"),
  ca: L("Català", "katalánčina", "Catalan", "ca-ES", "cat"),
  hr: L("Hrvatski", "chorvátčina", "Croatian", "hr-HR", "hrv"),
  da: L("Dansk", "dánčina", "Danish", "da-DK", "dan"),
  nl: L("Nederlands", "holandčina", "Dutch", "nl-NL", "nld"),
  et: L("Eesti", "estónčina", "Estonian", "et-EE", "est"),
  fi: L("Suomi", "fínčina", "Finnish", "fi-FI", "fin"),
  fr: L("Français", "francúzština", "French", "fr-FR", "fra"),
  gl: L("Galego", "galícijčina", "Galician", "gl-ES", "glg"),
  el: L("Ελληνικά", "gréčtina", "Greek", "el-GR", "ell"),
  is: L("Íslenska", "islandčina", "Icelandic", "is-IS", "isl"),
  id: L("Bahasa Indonesia", "indonézština", "Indonesian", "id-ID", "ind"),
  it: L("Italiano", "taliančina", "Italian", "it-IT", "ita"),
  ja: L("日本語", "japončina", "Japanese", "ja-JP", "jpn", false),
  kn: L("ಕನ್ನಡ", "kannadčina", "Kannada", "kn-IN", "kan", false),
  lv: L("Latviešu", "lotyština", "Latvian", "lv-LV", "lav"),
  mk: L("Македонски", "macedónčina", "Macedonian", "mk-MK", "mkd"),
  ms: L("Bahasa Melayu", "malajčina", "Malay", "ms-MY", "msa"),
  ml: L("മലയാളം", "malajálamčina", "Malayalam", "ml-IN", "mal", false),
  no: L("Norsk", "nórčina", "Norwegian", "nb-NO", "nor"),
  pt: L("Português", "portugalčina", "Portuguese", "pt-PT", "por"),
  ro: L("Română", "rumunčina", "Romanian", "ro-RO", "ron"),
  ru: L("Русский", "ruština", "Russian", "ru-RU", "rus"),
  es: L("Español", "španielčina", "Spanish", "es-ES", "spa"),
  sv: L("Svenska", "švédčina", "Swedish", "sv-SE", "swe"),
  tr: L("Türkçe", "turečtina", "Turkish", "tr-TR", "tur"),
  uk: L("Українська", "ukrajinčina", "Ukrainian", "uk-UA", "ukr"),
  vi: L("Tiếng Việt", "vietnamčina", "Vietnamese", "vi-VN", "vie"),
};

export function parseLanguage(value: unknown): PitchLanguage {
  return PITCH_LANGUAGES.includes(value as PitchLanguage) ? (value as PitchLanguage) : "sk";
}

/** Názov jazyka v jazyku rozhrania. */
export const languageName = (language: PitchLanguage, locale: "sk" | "en") =>
  locale === "en" ? LANGUAGE_INFO[language].english : LANGUAGE_INFO[language].slovak;

/** Modely prepisu v poradí, v akom sa skúšajú (len nakonfigurované). */
export function sttOrder(_language: PitchLanguage, configured: Record<SttProvider, boolean>): SttProvider[] {
  return STT_ORDER.filter((p) => configured[p]);
}
