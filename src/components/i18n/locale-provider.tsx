"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, localeFromLanguages, parseLocale, type Locale } from "@/lib/i18n/locale";

/*
  Jazyk rozhrania v prehliadači. Stránky po prihlásení dostanú jazyk zo servera (initial),
  verejné statické stránky ho zistia až v prehliadači (cookie, inak jazyk prehliadača).
*/

const listeners = new Set<() => void>();

function readClientLocale(): Locale {
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return parseLocale(match?.[1]) ?? localeFromLanguages(navigator.languages ?? [navigator.language]);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Uloží voľbu jazyka (na rok) a prekreslí stránku. */
export function writeLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  document.documentElement.lang = locale;
  listeners.forEach((l) => l());
}

const LocaleContext = createContext<Locale | null>(null);

export function LocaleProvider({ initial, children }: { initial?: Locale; children: ReactNode }) {
  const detected = useSyncExternalStore(subscribe, readClientLocale, () => initial ?? DEFAULT_LOCALE);
  // jazyk zo servera platí, kým ho používateľ nezmení prepínačom (vtedy sa stránka obnoví)
  const locale = initial ?? detected;
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(LocaleContext) ?? DEFAULT_LOCALE;
}

/** Prepínač SK / EN. */
export function LanguageSwitch({ className = "" }: { className?: string }) {
  const locale = useLocale();
  const router = useRouter();
  const choose = (next: Locale) => {
    if (next === locale) return;
    writeLocale(next);
    router.refresh();
  };
  return (
    <div className={`inline-flex items-center gap-1 rounded-full border border-line p-1 text-[12px] font-bold ${className}`} role="group" aria-label="Language / Jazyk">
      {(["sk", "en"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => choose(l)}
          aria-pressed={locale === l}
          className={`rounded-full px-3 py-1 uppercase transition ${locale === l ? "bg-signal text-on-signal" : "text-mute hover:text-paper"}`}
        >
          {l}
        </button>
      ))}
    </div>
  );
}
