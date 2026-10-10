import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PhoneMic } from "@/components/pitch/phone-mic";

// Stránka závisí od kódu v URL: navigácia smie počkať na server.
export const instant = false;

export const metadata: Metadata = { title: "Mobil ako mikrofón", robots: { index: false, follow: false } };

/** Otvorí sa na mobile z odkazu, ktorý vygeneroval počítač. Prihlásenie netreba, oprávnením je odkaz. */
export default async function PhoneMicPage({ params }: PageProps<"/mikrofon/[code]">) {
  const { code } = await params;
  if (!/^[a-f0-9]{32}$/.test(code)) notFound();
  return <PhoneMic code={code} />;
}
