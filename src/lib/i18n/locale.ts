/*
  Jazyk rozhrania (slovenčina alebo angličtina). Volí sa cookie; bez nej podľa jazyka prehliadača:
  slovenčina a čeština → slovensky, všetko ostatné → anglicky.
*/

export const LOCALES = ["sk", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_COOKIE = "pitchit-lang";
export const DEFAULT_LOCALE: Locale = "sk";

export function parseLocale(value: unknown): Locale | null {
  return value === "sk" || value === "en" ? value : null;
}

/** Jazyk z hlavičky Accept-Language alebo navigator.languages (prvý uprednostnený jazyk). */
export function localeFromLanguages(languages: readonly string[]): Locale {
  const first = languages.find(Boolean)?.toLowerCase() ?? "";
  if (!first) return DEFAULT_LOCALE;
  return first.startsWith("sk") || first.startsWith("cs") ? "sk" : "en";
}

export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  const tags = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag, q: q ? Number(q) : 1 };
    })
    .filter((x) => x.tag && x.tag !== "*")
    .sort((a, b) => b.q - a.q)
    .map((x) => x.tag);
  return localeFromLanguages(tags);
}

/** Vyberie text podľa jazyka: pick(locale, { sk: "…", en: "…" }). */
export function pick<T>(locale: Locale, texts: Record<Locale, T>): T {
  return texts[locale];
}
