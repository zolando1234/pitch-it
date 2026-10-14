"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { Icon } from "@/components/app/icons";
import { useMobileNav } from "@/components/app/mobile-nav";
import { APP_NAV, navLabel, type NavItem } from "@/components/app/nav-items";
import { useLocale } from "@/components/i18n/locale-provider";
import { Wordmark } from "@/components/wordmark";

function Navigation({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const locale = useLocale();
  return (
    <nav aria-label={locale === "en" ? "Application" : "Aplikácia"}>
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const active = item.match(pathname);
        if (item.locked) {
          return (
            <li key={item.href}>
              <span
                aria-disabled="true"
                title={locale === "en" ? "Coming soon" : "Čoskoro"}
                className="flex h-12 cursor-not-allowed items-center gap-4 rounded-xl px-4 text-[15.5px] text-nav opacity-50"
              >
                <Icon name={item.icon} className="size-[22px] text-nav-icon" />
                {navLabel(item, locale)}
                <Icon name="lock" className="ml-auto size-[16px]" aria-label={locale === "en" ? "Locked" : "Zamknuté"} />
              </span>
            </li>
          );
        }
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`group relative flex h-12 items-center gap-4 rounded-xl px-4 text-[15.5px] transition-colors duration-150 ${
                active ? "bg-nav-active font-semibold text-paper" : "text-nav hover:bg-panel-2/70 hover:text-paper"
              }`}
            >
              {active ? <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] rounded-full bg-signal" /> : null}
              <Icon name={item.icon} className={`size-[22px] ${active ? "text-accent" : "text-nav-icon group-hover:text-paper"}`} />
              {navLabel(item, locale)}
            </Link>
          </li>
        );
      })}
    </ul>
    </nav>
  );
}

/**
 * Bočný panel na desktope a výsuvné menu na mobile (tlačidlo je v hornej lište).
 * `footer` je serverový obsah (karta plánu), preto sa podáva zvonku.
 */
export function AppSidebar({ footer }: { footer: ReactNode }) {
  const { open, setOpen, panelId } = useMobileNav();
  const items = APP_NAV;
  const homeHref = "/app";

  return (
    <>
      <aside className="sticky top-0 hidden h-dvh w-[252px] shrink-0 flex-col border-r border-sidebar-line bg-ink-2 px-[18px] pt-8 pb-6 lg:flex">
        <Wordmark href={homeHref} className="ml-[18px]" />
        <div className="mt-9 flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Navigation items={items} />
        </div>
        <div className="mt-6 px-[10px]">{footer}</div>
      </aside>

      <AnimatePresence>
        {open ? (
          <m.div
            id={panelId}
            key="app-mobile-nav"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-x-0 top-16 bottom-0 z-40 flex flex-col overflow-y-auto bg-ink px-4 pt-4 pb-6 lg:hidden"
          >
            <Navigation items={items} onNavigate={() => setOpen(false)} />
            <div className="mt-auto pt-6">{footer}</div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
