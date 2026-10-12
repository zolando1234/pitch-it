"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Breadcrumbs } from "@/components/app/breadcrumbs";
import { useLocale } from "@/components/i18n/locale-provider";

/** Na prehľade pozdrav (aj na mobile), inde omrvinky (iba desktop). `children` sú ovládacie prvky vpravo. */
export function HeaderRow({ firstName, dashboardPath, children }: { firstName: string | null; dashboardPath: string; children: ReactNode }) {
  const isDashboard = usePathname() === dashboardPath;
  const en = useLocale() === "en";
  return (
    <header
      className={`${isDashboard ? "flex" : "hidden lg:flex"} items-center justify-between gap-6 px-4 pt-6 sm:px-6 lg:min-h-[106px] lg:px-9 lg:pt-0`}
    >
      {isDashboard ? (
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em] text-paper sm:text-[31px]">
            {en ? (firstName ? `Hi, ${firstName}` : "Hi") : firstName ? `Ahoj, ${firstName}` : "Ahoj"}{" "}
            <span aria-hidden="true" className="inline-block">
              👋
            </span>
          </h1>
          <p className="mt-1 text-[15px] text-mute sm:text-[17px]">{en ? "Get ready for your next important pitch." : "Priprav sa na ďalší dôležitý pitch."}</p>
        </div>
      ) : (
        <Breadcrumbs />
      )}
      <div className="hidden shrink-0 items-center lg:flex">{children}</div>
    </header>
  );
}
