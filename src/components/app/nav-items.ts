import type { IconName } from "@/components/app/icons";

export type NavItem = { href: string; label: string; icon: IconName; match: (path: string) => boolean; /** Zamknuté: v menu je, ale zatiaľ sa nedá otvoriť. */ locked?: boolean };

const NAV_EN: Record<string, string> = {
  "Prehľad": "Overview",
  "Tréning": "Training",
  "Dokumenty": "Documents",
  "Progres": "Progress",
  "Nastavenia": "Settings",
};

/** Názov položky menu v jazyku rozhrania. */
export const navLabel = (item: NavItem, locale: "sk" | "en") => (locale === "en" ? (NAV_EN[item.label] ?? item.label) : item.label);

export const APP_NAV: NavItem[] = [
  { href: "/app", label: "Prehľad", icon: "home", match: (path) => path === "/app" },
  { href: "/app/nahravka", label: "Tréning", icon: "mic", match: (path) => path.startsWith("/app/nahravka") },
  { href: "/app/dokumenty", label: "Dokumenty", icon: "presentation", match: (path) => path.startsWith("/app/dokumenty") },
  { href: "/app/progres", label: "Progres", icon: "trendUp", match: (path) => path.startsWith("/app/progres") },
  { href: "/app/nastavenia", label: "Nastavenia", icon: "settings", match: (path) => path.startsWith("/app/nastavenia") },
];
