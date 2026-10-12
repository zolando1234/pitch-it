"use client";

import type { ReactNode } from "react";
import { useLocale } from "./locale-provider";

/** Text v jazyku rozhrania pre serverové komponenty verejných stránok (jazyk sa zistí v prehliadači). */
export function T({ sk, en }: { sk: ReactNode; en: ReactNode }) {
  return <>{useLocale() === "en" ? en : sk}</>;
}
