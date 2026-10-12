import type { Metadata } from "next";
import type { ReactNode } from "react";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { ToastProvider } from "@/components/ui/toast";
import { getLocale } from "@/lib/i18n/server";
import { siteConfig } from "@/config/site";

// Celá aplikácia je per-používateľ (relácia, URL, dáta): navigácie smú čakať na server.
export const instant = false;

export const metadata: Metadata = {
  title: { default: "Aplikácia", template: `%s | ${siteConfig.name}` },
  robots: { index: false, follow: false },
};

export default async function AppLayout({ children }: { children: ReactNode }) {
  return (
    <LocaleProvider initial={await getLocale()}>
      <ToastProvider>{children}</ToastProvider>
    </LocaleProvider>
  );
}
