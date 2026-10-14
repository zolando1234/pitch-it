"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { useLocale } from "@/components/i18n/locale-provider";

const LABELS_EN: Record<string, string> = {
  admin: "Admin",
  dokumenty: "Documents",
  nastavenia: "Settings",
  progres: "Progress",
};
const DETAIL_LABELS_EN: Record<string, string> = {};

const LABELS: Record<string, string> = {
  admin: "Administrácia",
  dokumenty: "Dokumenty",
  nastavenia: "Nastavenia",
  progres: "Progres",
};

/** Názov detailu podľa rodičovskej sekcie (ID v URL nemá ľudský názov). */
const DETAIL_LABELS: Record<string, string> = {};

/** Sekcie bez vlastnej stránky: odkazujú na najbližšiu existujúcu. */
const SECTION_HREF: Record<string, string> = {};

export type Crumb = { href: string; label: string };

export function crumbsFor(pathname: string, locale: "sk" | "en" = "sk"): Crumb[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] !== "app") return [];
  const en = locale === "en";
  const labels = en ? LABELS_EN : LABELS;
  const details = en ? DETAIL_LABELS_EN : DETAIL_LABELS;
  const crumbs: Crumb[] = [{ href: "/app", label: en ? "Overview" : "Prehľad" }];
  let href = "/app";
  segments.slice(1).forEach((segment, index, rest) => {
    href += `/${segment}`;
    const label = labels[segment] ?? details[rest[index - 1] ?? ""] ?? "Detail";
    crumbs.push({ href: SECTION_HREF[href] ?? href, label });
  });
  return crumbs;
}

export function Breadcrumbs() {
  const locale = useLocale();
  const crumbs = crumbsFor(usePathname(), locale);
  if (crumbs.length === 0) return null;
  return (
    <nav aria-label={locale === "en" ? "Breadcrumbs" : "Omrvinky"} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => {
          const last = index === crumbs.length - 1;
          return (
            <li key={crumb.href + index} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span aria-hidden="true" className="text-line-strong">
                  /
                </span>
              ) : null}
              {last ? (
                <span aria-current="page" className="truncate font-medium text-paper">
                  {crumb.label}
                </span>
              ) : (
                <Link href={crumb.href} className="truncate text-mute transition-colors hover:text-paper">
                  {crumb.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
