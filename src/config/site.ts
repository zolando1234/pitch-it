import { getSignupMode } from "@/config/env";

function resolveSiteUrl(): string {
  const explicit = process.env.SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return "http://localhost:3000";
}

function optional(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export const siteConfig = {
  name: "PitchIt",
  title: "PitchIt – AI kouč pitchu pre zakladateľov",
  description:
    "Natrénuj si investorské stretnutie skôr, než príde naostro. Simulácia investora s doplňujúcimi otázkami a konkrétny feedback k tvojim odpovediam.",
  url: resolveSiteUrl(),
  locale: "sk_SK",
  contactEmail: optional(process.env.CONTACT_EMAIL),
  legal: {
    entityName: optional(process.env.LEGAL_ENTITY_NAME),
    entityId: optional(process.env.LEGAL_ENTITY_ID),
    entityAddress: optional(process.env.LEGAL_ENTITY_ADDRESS),
  },
} as const;

export const navLinks = [
  { href: "/#funkcie", label: "Funkcie" },
  { href: "/#ako-to-funguje", label: "Ako to funguje" },
  { href: "/#ukazka", label: "Ukážka" },
  { href: "/cennik", label: "Cenník" },
  { href: "/#faq", label: "FAQ" },
] as const;

export const EARLY_ACCESS_HREF = "/#early-access";

export type Cta = { href: string; label: string; note: string };

/** Hlavná výzva na verejných stránkach: registrácia, alebo čakacia listina (SIGNUP_MODE=waitlist). */
export function getPrimaryCta(): Cta {
  return getSignupMode() === "waitlist"
    ? {
        href: EARLY_ACCESS_HREF,
        label: "Získať early access",
        note: "Účty otvárame postupne. Zápis je bezplatný a nezáväzný.",
      }
    : {
        href: "/registracia",
        label: "Vyskúšať zadarmo",
        note: "10 minút tréningu zadarmo. Bez platobnej karty.",
      };
}
