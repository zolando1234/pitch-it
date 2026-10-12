import type { ReactNode } from "react";
import { Wordmark } from "@/components/wordmark";
import { LanguageSwitch } from "@/components/i18n/locale-provider";

/** Prihlásenie a registrácia: panel v strede obrazovky s dvomi rozmazanými škvrnami farby. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="obsah"
      className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 py-12"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-[120px] right-[8%] size-[420px] rounded-full bg-violet opacity-35 blur-[90px] light:opacity-20"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-[120px] left-[10%] size-[360px] rounded-full bg-signal opacity-[0.14] blur-[90px]"
      />
      <Wordmark className="relative mb-7" />
      <div className="relative w-full max-w-[460px] rounded-[28px] border border-line bg-[linear-gradient(160deg,color-mix(in_srgb,var(--card-from)_95%,transparent),color-mix(in_srgb,var(--card-to)_95%,transparent))] px-6 py-10 shadow-[0_30px_80px_rgba(0,0,0,0.45)] sm:px-9 light:shadow-[0_30px_80px_rgba(30,30,70,0.14)]">
        {children}
      </div>
      <LanguageSwitch className="relative mt-6" />
    </main>
  );
}
