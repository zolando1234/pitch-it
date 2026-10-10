"use client";

import { useState } from "react";
import type { usePhoneMic } from "@/components/pitch/use-phone-mic";

/*
  Výber zdroja zvuku pred nahrávaním: mikrofón počítača alebo mobil pripojený cez odkaz.
*/

type PhoneMic = ReturnType<typeof usePhoneMic>;

export function PhoneMicPanel({ phone, level }: { phone: PhoneMic; level: number }) {
  const [copied, setCopied] = useState(false);
  const usePhone = phone.state !== "idle";
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  const copy = async () => {
    if (!phone.link) return;
    try {
      await navigator.clipboard.writeText(phone.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const share = async () => {
    if (!phone.link) return;
    try {
      await navigator.share({ title: "Mikrofón pre pitch", text: "Otvor na mobile a zapni mikrofón:", url: phone.link });
    } catch {
      // zrušené zdieľanie nie je chyba
    }
  };

  const option = (active: boolean, title: string, text: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-col rounded-2xl border-2 p-4 text-left transition ${active ? "border-signal bg-signal/10" : "border-line hover:border-faint"}`}
    >
      <span className="text-lg font-bold">{title}</span>
      <span className="mt-1 text-sm leading-snug text-mute">{text}</span>
    </button>
  );

  return (
    <section className="w-full" aria-labelledby="mikrofon-nadpis">
      <p id="mikrofon-nadpis" className="mb-3 text-xs font-bold uppercase tracking-widest text-faint">
        Čo držíš ako mikrofón?
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {option(!usePhone, "Mikrofón počítača", "Externý mikrofón pripojený k počítaču alebo vstavaný mikrofón.", phone.stop)}
        {option(usePhone, "Mobil ako mikrofón", "Mobil držíš v ruke ako mikrofón, zvuk ide do počítača cez odkaz.", () => {
          if (!usePhone) void phone.start();
        })}
      </div>

      {usePhone ? (
        <div className="mt-5 flex flex-col gap-3" aria-live="polite">
          {phone.state === "creating" ? <p className="text-sm text-mute">Pripravujem odkaz…</p> : null}

          {phone.link && phone.state !== "connected" ? (
            <>
              <p className="text-sm text-mute">Otvor tento odkaz na mobile a stlač „Zapnúť mikrofón“. Môžeš si ho poslať správou alebo e-mailom.</p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={phone.link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Odkaz pre mobil"
                  className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-2 font-mono text-xs text-paper"
                />
                <button type="button" className="btn btn-p" onClick={() => void copy()} style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                  {copied ? "Skopírované" : "Kopírovať"}
                </button>
                {canShare ? (
                  <button type="button" className="btn" onClick={() => void share()} style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                    Poslať
                  </button>
                ) : null}
              </div>
              {phone.state === "waiting" ? <p className="animate-pulse text-sm text-mute">Čakám, kým sa mobil pripojí…</p> : null}
            </>
          ) : null}

          {phone.state === "connected" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-accent">Mobil je pripojený. Povedz pár slov, mal by sa pohnúť ukazovateľ.</p>
              <div className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-signal transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            </div>
          ) : null}

          {phone.state === "lost" || phone.state === "failed" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-coral">
                {phone.state === "lost" ? "Mobil sa odpojil." : phone.error}
              </p>
              <button type="button" className="btn" onClick={() => void phone.start()} style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                Nový odkaz
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
