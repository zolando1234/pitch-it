import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Sans, Outfit } from "next/font/google";
import { DevResetButton } from "@/components/dev-reset-button";
import { LocaleProvider } from "@/components/i18n/locale-provider";
import { MotionProvider } from "@/components/motion-provider";
import { THEME_INIT_SCRIPT } from "@/components/theme-toggle";
import { siteConfig } from "@/config/site";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  variable: "--font-bricolage",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "700"],
  display: "swap",
});

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "700"],
  display: "swap",
});

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin", "latin-ext"],
  weight: ["700"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: {
    default: siteConfig.title,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: siteConfig.locale,
    url: "/",
    siteName: siteConfig.name,
    title: siteConfig.title,
    description: siteConfig.description,
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfig.title,
    description: siteConfig.description,
  },
  robots: { index: true, follow: true },
  formatDetection: { email: false, telephone: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#141414" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f1" },
  ],
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="sk" className={`${bricolage.variable} ${dmSans.variable} ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh">
        <a
          href="#obsah"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[200] focus:rounded-lg focus:bg-paper focus:px-4 focus:py-2 focus:text-ink"
        >
          Preskočiť na obsah
        </a>
        <LocaleProvider>
          <MotionProvider>{children}</MotionProvider>
        </LocaleProvider>
        {/* Dočasné: reset prehliadača pri testovaní, iba `next dev`. */}
        {process.env.NODE_ENV === "development" ? <DevResetButton /> : null}
      </body>
    </html>
  );
}
