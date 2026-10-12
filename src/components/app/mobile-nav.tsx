"use client";

import { useLocale } from "@/components/i18n/locale-provider";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Icon } from "@/components/app/icons";

/*
  Stav výsuvného menu na mobile. Tlačidlo je v hornej lište, panel v bočnej navigácii,
  preto zdieľajú stav cez kontext.
*/

type MobileNavState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  panelId: string;
  toggleRef: RefObject<HTMLButtonElement | null>;
};

const MobileNavContext = createContext<MobileNavState | null>(null);

export function MobileNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // Po navigácii menu zavrieme (porovnanie počas renderu, nie v efekte).
  const [lastPath, setLastPath] = useState(pathname);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const value = useMemo(() => ({ open, setOpen, panelId, toggleRef }), [open, panelId]);
  return <MobileNavContext.Provider value={value}>{children}</MobileNavContext.Provider>;
}

export function useMobileNav(): MobileNavState {
  const context = useContext(MobileNavContext);
  if (!context) throw new Error("useMobileNav musí byť vo vnútri MobileNavProvider.");
  return context;
}

export function MobileNavToggle() {
  const en = useLocale() === "en";
  const { open, setOpen, panelId, toggleRef } = useMobileNav();
  return (
    <button
      ref={toggleRef}
      type="button"
      onClick={() => setOpen(!open)}
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={en ? (open ? "Close menu" : "Open menu") : open ? "Zavrieť menu" : "Otvoriť menu"}
      className="inline-flex size-10 items-center justify-center rounded-full border border-line-strong text-paper transition-colors hover:bg-panel-2"
    >
      <Icon name={open ? "close" : "menu"} className="size-5" />
    </button>
  );
}
