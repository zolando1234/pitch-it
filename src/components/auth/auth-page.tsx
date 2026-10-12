import type { ReactNode } from "react";
import { isAuthConfigured } from "@/config/env";
import { Notice } from "@/components/ui/notice";
import { T } from "@/components/i18n/t";

/** Obsah auth panelu: nadpis v strede, stav konfigurácie, formulár a pätička. */
export function AuthPage({
  title,
  description,
  children,
  footer,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const configured = isAuthConfigured();
  return (
    <div>
      <h1 className="type-heading text-center text-[36px] leading-[1.1]">{title}</h1>
      {description ? <p className="mt-2.5 text-center text-base text-mute">{description}</p> : null}
      {!configured ? (
        <Notice tone="attention" className="mt-6" title={<T sk="Účty momentálne nefungujú" en="Accounts are unavailable right now" />}>
          {process.env.NODE_ENV !== "production"
            ? "Vývojárska poznámka: nastav AUTH_SECRET v .env.local a reštartuj server. Postup je v README."
            : <T sk="Skús to prosím neskôr." en="Please try again later." />}
        </Notice>
      ) : null}
      <div className="mt-6">{children}</div>
      {footer ? <p className="mt-[26px] text-center text-sm text-mute">{footer}</p> : null}
    </div>
  );
}

export function authAvailable(): boolean {
  return isAuthConfigured();
}
