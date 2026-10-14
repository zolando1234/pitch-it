"use client";

import Link from "next/link";
import { LanguageSwitch, useLocale } from "@/components/i18n/locale-provider";
import { useEffect, useId, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/app/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { signOut } from "@/lib/auth/actions";

/** Zatvorí rozbalené menu po kliknutí mimo neho alebo klávesou Escape. */
function useDismiss(open: boolean, close: () => void, root: RefObject<HTMLElement | null>, trigger: RefObject<HTMLButtonElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close, root, trigger]);
}

function MenuPanel({ id, label, children, className = "" }: { id: string; label: string; children: ReactNode; className?: string }) {
  return (
    <div
      id={id}
      role="region"
      aria-label={label}
      className={`absolute top-full right-0 z-50 mt-2.5 rounded-[14px] border border-line-strong bg-panel p-1.5 shadow-[0_24px_60px_rgba(0,0,0,0.55)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ───────────── Účet ───────────── */

export type AccountSummary = { name: string; email: string | null; initials: string; role: string };

export function AccountMenu({ account, compact = false }: { account: AccountSummary; compact?: boolean }) {
  const en = useLocale() === "en";
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useDismiss(open, () => setOpen(false), root, trigger);

  const linkClass = "flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] text-slide transition-colors hover:bg-panel-2 hover:text-paper";

  return (
    <div ref={root} className="relative">
      <button
        ref={trigger}
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={compact ? `${en ? "Account" : "Účet"}: ${account.name}` : undefined}
        className="flex items-center gap-4 rounded-full text-left transition-opacity hover:opacity-90"
      >
        <span
          aria-hidden="true"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-avatar text-[15px] font-bold tracking-[0.02em] text-avatar-ink ring-1 ring-avatar-ring lg:size-11"
        >
          {account.initials}
        </span>
        {compact ? null : (
          <>
            <span className="min-w-0">
              <span className="block max-w-[11rem] truncate text-[15px] leading-tight font-semibold text-paper">{account.name}</span>
              <span className="mt-1 block text-[13px] leading-tight text-mute">{account.role}</span>
            </span>
            <Icon name="chevronDown" className={`ml-5 size-5 text-mute transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>
      {open ? (
        <MenuPanel id={panelId} label={en ? "Account" : "Účet"} className="w-64">
          <div className="border-b border-line px-3 pt-2 pb-2.5">
            <p className="truncate text-[14px] font-semibold text-paper">{account.name}</p>
            {account.email ? (
              <p className="truncate text-[12.5px] text-mute" title={account.email}>
                {account.email}
              </p>
            ) : null}
          </div>
          <div className="px-2 pt-2.5 pb-1">
            <ThemeToggle />
          </div>
          <div className="flex items-center justify-between px-3 pt-1 pb-2">
            <span className="text-[13px] text-mute">{en ? "Language" : "Jazyk"}</span>
            <LanguageSwitch />
          </div>
            <div className="pt-1">
              <Link href="/app/nastavenia" onClick={() => setOpen(false)} className={linkClass}>
                <Icon name="user" className="size-[18px] text-mute" />
                {en ? "Account settings" : "Nastavenia účtu"}
              </Link>
              <Link href="/app/nastavenia#plan" onClick={() => setOpen(false)} className={linkClass}>
                <Icon name="card" className="size-[18px] text-mute" />
                {en ? "Pitches and payments" : "Pitche a platby"}
              </Link>
              <form action={signOut}>
                <button type="submit" className={`${linkClass} w-full text-left`}>
                  <Icon name="logout" className="size-[18px] text-mute" />
                  {en ? "Sign out" : "Odhlásiť sa"}
                </button>
              </form>
            </div>
        </MenuPanel>
      ) : null}
    </div>
  );
}
