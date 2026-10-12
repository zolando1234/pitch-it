import "server-only";

import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, localeFromAcceptLanguage, parseLocale, type Locale } from "@/lib/i18n/locale";

/** Jazyk rozhrania pre túto požiadavku (cookie, inak jazyk prehliadača). */
export async function getLocale(): Promise<Locale> {
  const fromCookie = parseLocale((await cookies()).get(LOCALE_COOKIE)?.value);
  if (fromCookie) return fromCookie;
  return localeFromAcceptLanguage((await headers()).get("accept-language"));
}
