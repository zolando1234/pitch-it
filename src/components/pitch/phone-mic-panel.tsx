"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { usePhoneMic } from "@/components/pitch/use-phone-mic";

/*
  Výber zdroja zvuku pred nahrávaním: mikrofón počítača alebo mobil pripojený cez odkaz.
*/

type PhoneMic = ReturnType<typeof usePhoneMic>;

export function PhoneMicPanel({ phone, level, mic = "ready" }: { phone: PhoneMic; level: number; /** stav mikrofónu počítača */ mic?: "ready" | "missing" | "other" }) {
  const [copied, setCopied] = useState(false);
  const en = useLocale() === "en";
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
      await navigator.share({
        title: en ? "Microphone for the pitch" : "Mikrofón pre pitch",
        text: en ? "Open on your phone and turn on the microphone:" : "Otvor na mobile a zapni mikrofón:",
        url: phone.link,
      });
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
        {en ? "What do you hold as the microphone?" : "Čo držíš ako mikrofón?"}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {option(
          !usePhone,
          en ? "Computer microphone" : "Mikrofón počítača",
          en ? "An external microphone connected to the computer or the built-in one." : "Externý mikrofón pripojený k počítaču alebo vstavaný mikrofón.",
          phone.stop,
        )}
        {option(usePhone, en ? "Phone as microphone" : "Mobil ako mikrofón", en ? "Hold your phone as the microphone, the sound goes to the computer via a link." : "Mobil držíš v ruke ako mikrofón, zvuk ide do počítača cez odkaz.", () => {
          if (!usePhone) void phone.start();
        })}
      </div>

      {!usePhone ? (
        <div className="mt-5 flex flex-col gap-2" aria-live="polite">
          {mic === "ready" ? (
            <>
              <p className="text-sm text-mute">{en ? "Say a few words, the meter should move." : "Povedz pár slov, ukazovateľ by sa mal pohnúť."}</p>
              <div className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-signal transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            </>
          ) : mic === "missing" ? (
            <p role="alert" className="text-sm font-bold text-coral">
              {en ? "No microphone is connected." : "Nie je pripojený žiadny mikrofón."}
            </p>
          ) : null}
        </div>
      ) : null}

      {usePhone ? (
        <div className="mt-5 flex flex-col gap-3" aria-live="polite">
          {phone.state === "creating" ? <p className="text-sm text-mute">{en ? "Preparing the link…" : "Pripravujem odkaz…"}</p> : null}

          {phone.link && phone.state !== "connected" ? (
            <>
              <p className="text-sm text-mute">
                {en
                  ? "Open this link on your phone and tap “Turn on microphone”. You can send it to yourself by message or e-mail."
                  : "Otvor tento odkaz na mobile a stlač „Zapnúť mikrofón“. Môžeš si ho poslať správou alebo e-mailom."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  readOnly
                  value={phone.link}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label={en ? "Link for the phone" : "Odkaz pre mobil"}
                  className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-2 font-mono text-xs text-paper"
                />
                <button type="button" className="btn btn-p" onClick={() => void copy()} style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                  {copied ? (en ? "Copied" : "Skopírované") : en ? "Copy" : "Kopírovať"}
                </button>
                {canShare ? (
                  <button type="button" className="btn" onClick={() => void share()} style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                    {en ? "Send" : "Poslať"}
                  </button>
                ) : null}
              </div>
              {phone.state === "waiting" ? <p className="animate-pulse text-sm text-mute">{en ? "Waiting for the phone to connect…" : "Čakám, kým sa mobil pripojí…"}</p> : null}
            </>
          ) : null}

          {phone.state === "connected" ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-bold text-accent">
                {en ? "Phone connected. Say a few words, the meter should move." : "Mobil je pripojený. Povedz pár slov, mal by sa pohnúť ukazovateľ."}
              </p>
              <div className="h-2.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full rounded-full bg-signal transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
              </div>
            </div>
          ) : null}

          {phone.state === "lost" || phone.state === "failed" ? (
            <div className="flex flex-wrap items-center gap-3">
              <p role="alert" className="text-sm text-coral">
                {phone.state === "lost" ? (en ? "The phone disconnected." : "Mobil sa odpojil.") : phone.error}
              </p>
              <button type="button" className="btn" onClick={() => void phone.start()} style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                {en ? "New link" : "Nový odkaz"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
