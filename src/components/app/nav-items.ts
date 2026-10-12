import type { IconName } from "@/components/app/icons";

export type NavItem = { href: string; label: string; icon: IconName; match: (path: string) => boolean; /** Zamknuté: v menu je, ale zatiaľ sa nedá otvoriť. */ locked?: boolean };

const NAV_EN: Record<string, string> = {
  "Prehľad": "Overview",
  "Môj startup": "My startup",
  "Tréning pitchu": "Pitch training",
  "AI investor": "AI investor",
  "Progres": "Progress",
  "Nastavenia": "Settings",
  "Úvodný kvíz": "Intro quiz",
};

/** Názov položky menu v jazyku rozhrania. */
export const navLabel = (item: NavItem, locale: "sk" | "en") => (locale === "en" ? (NAV_EN[item.label] ?? item.label) : item.label);

export const APP_NAV: NavItem[] = [
  { href: "/app", label: "Prehľad", icon: "home", match: (path) => path === "/app" },
  { href: "/app/projekty", label: "Môj startup", icon: "presentation", match: (path) => path.startsWith("/app/projekty"), locked: true },
  { href: "/app/nahravka", label: "Tréning pitchu", icon: "mic", match: (path) => path.startsWith("/app/nahravka") },
  {
    href: "/app/trening/novy?rezim=simulation",
    label: "AI investor",
    icon: "chat",
    match: (path) => path.startsWith("/app/trening/novy") || path.startsWith("/app/miestnost"),
    locked: true,
  },
  {
    href: "/app/progres",
    label: "Progres",
    icon: "trendUp",
    match: (path) => path.startsWith("/app/progres") || path.startsWith("/app/cvicenia") || path.startsWith("/app/historia/porovnanie"),
  },
  { href: "/app/nastavenia", label: "Nastavenia", icon: "settings", match: (path) => path.startsWith("/app/nastavenia") },
];

/** Navigácia vývojovej ukážky (/ukazka): rovnaké položky, odkazy na ukážkové obrazovky. */
export const PREVIEW_NAV: NavItem[] = [
  { href: "/ukazka/prehlad", label: "Prehľad", icon: "home", match: (path) => path === "/ukazka/prehlad" },
  { href: "/ukazka/podklady", label: "Môj startup", icon: "presentation", match: (path) => path.startsWith("/ukazka/podklady"), locked: true },
  { href: "/ukazka/nahravka/kamera", label: "Tréning pitchu", icon: "mic", match: (path) => path.startsWith("/ukazka/nahravka") },
  { href: "/ukazka/novy-trening", label: "AI investor", icon: "chat", match: (path) => path.startsWith("/ukazka/novy-trening"), locked: true },
  { href: "/ukazka/progres", label: "Progres", icon: "trendUp", match: (path) => path.startsWith("/ukazka/progres") || path.startsWith("/ukazka/porovnanie") },
  { href: "/ukazka/vitaj", label: "Úvodný kvíz", icon: "flag", match: (path) => path.startsWith("/ukazka/vitaj") },
];
