"use client";

import Link from "next/link";
import { SCRIPTS, type SessionMode } from "@/lib/coach/modes";
import type { TrackingQuality } from "./CameraStage";
import type { MicHand } from "@/lib/coach/pose/metrics";
import { COUNTDOWN_OPTIONS, type CountdownSec } from "./use-coach-session";

export type PrompterSetting = {
  /** null = bez telepromptra, "custom" = vlastný text */
  scriptId: string | null;
  customText: string;
  wpm: number;
};

const fmtDuration = (ms: number) => (ms >= 60_000 ? `${ms / 60_000} min` : `${ms / 1000} s`);

type Props = {
  heading: string;
  lead: string;
  backHref: string;
  backLabel: string;
  /** zoznam režimov na výber; null = režim je daný zvonka (napr. dĺžka pitchu) */
  modes: SessionMode[] | null;
  mode: SessionMode;
  onMode: (m: SessionMode) => void;
  micMode: boolean;
  onMic: (on: boolean) => void;
  micHand: MicHand;
  onMicHand: (h: MicHand) => void;
  prompter: PrompterSetting;
  onPrompter: (p: PrompterSetting) => void;
  quality: TrackingQuality;
  onQuality: (q: TrackingQuality) => void;
  /** odpočet pred štartom nahrávania */
  countdown?: CountdownSec;
  onCountdown?: (sec: CountdownSec) => void;
  error: string | null;
  startLabel?: string;
  canStart?: boolean;
  /** drobný text pod tlačidlom štartu (napr. súhlas s analýzou) */
  finePrint?: string;
  /** doplnok nad tlačidlom štartu (napr. stav mikrofónu) */
  children?: React.ReactNode;
  /** výber zdroja zvuku, ukáže sa hneď po voľbe „Mikrofón v ruke“ */
  micSource?: React.ReactNode;
  onStart: () => void;
};

function Card({
  active,
  onClick,
  title,
  meta,
  text,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  meta: string;
  text?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col rounded-2xl border-2 p-4 text-left transition ${
        active ? "border-signal bg-signal/10" : "border-line hover:border-faint"
      }`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold">{title}</span>
        <span className="shrink-0 font-mono text-xs text-mute">{meta}</span>
      </span>
      {text && <span className="mt-1 text-sm leading-snug text-mute">{text}</span>}
    </button>
  );
}

function SectionTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-sm font-bold uppercase tracking-widest text-mute">
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-signal text-on-signal">{n}</span>
      {children}
    </h2>
  );
}

const QUALITIES: { id: TrackingQuality; title: string; meta: string; text: string }[] = [
  { id: "fast", title: "Rýchla", meta: "staršie notebooky", text: "Najľahší model. Plynulý aj na pomalom počítači, menej presný." },
  { id: "balanced", title: "Vyvážená", meta: "odporúčame", text: "Dobrá presnosť. Ak počítač nestíha, prepne sa na rýchlu." },
  { id: "precise", title: "Presná", meta: "výkonný počítač", text: "Najpresnejšie sledovanie tela, najlepšie keď stojíš ďalej. Potrebuje silnú grafiku." },
];

export default function SessionSetup({
  heading,
  lead,
  backHref,
  backLabel,
  modes,
  mode,
  onMode,
  micMode,
  onMic,
  micHand,
  onMicHand,
  prompter,
  onPrompter,
  quality,
  onQuality,
  countdown,
  onCountdown,
  error,
  startLabel,
  canStart: canStartOuter = true,
  finePrint = "Video sa spracúva iba v tvojom prehliadači a nikam sa neodosiela.",
  children,
  micSource,
  onStart,
}: Props) {
  const drill = mode.kind === "drill" ? mode : null;
  const prompterText =
    prompter.scriptId === "custom" ? prompter.customText : SCRIPTS.find((s) => s.id === prompter.scriptId)?.text;
  const canStart = canStartOuter && (prompter.scriptId !== "custom" || prompter.customText.trim().length > 0);
  let n = 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-8">
      <div className="flex flex-col gap-3">
        <Link href={backHref} className="text-sm font-bold uppercase tracking-[0.3em] text-signal">
          ← {backLabel}
        </Link>
        <h1 className="h text-4xl leading-tight md:text-6xl">{heading}</h1>
        <p className="max-w-2xl text-lg text-mute">{lead}</p>
      </div>

      {modes ? (
        <section>
          <SectionTitle n={++n}>Vyber si cvičenie</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {modes.map((d) => (
              <Card
                key={d.id}
                active={mode.id === d.id}
                onClick={() => onMode(d)}
                title={d.title}
                meta={d.kind === "drill" ? fmtDuration(d.durationMs) : d.subtitle}
                text={d.kind === "drill" ? d.goal : undefined}
              />
            ))}
          </div>

          {drill && (
            <div className="mt-5 rounded-2xl border border-line bg-ink p-5">
              <p className="font-bold">Ako na cvičenie „{drill.title}“</p>
              <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-mute">
                {drill.howTo.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-faint">Počas cvičenia ti tréner radí len k tejto zručnosti.</p>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-3xl border border-line p-5 md:p-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-faint">Než začneš</p>
        <ul className="grid gap-2 text-mute sm:grid-cols-3">
          <li>• Postav sa 2 až 3 m od kamery.</li>
          <li>• Kamera vidí trup, ideálne po kolená.</li>
          <li>• Odpočet beží, až keď ťa kamera vidí. Hodnotíme až po ňom.</li>
        </ul>
      </section>
      {/* Voľby sú hneď viditeľné; s predvolenými hodnotami sa dá rovno začať. */}
      <details className="group" open>
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-mute hover:text-paper [&::-webkit-details-marker]:hidden">
          Nastavenia
          <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4 flex flex-col gap-10 rounded-3xl border border-line p-5 md:p-8">
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-faint">Ako budeš hovoriť?</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card
                active={!micMode}
                onClick={() => onMic(false)}
                title="Bez mikrofónu v ruke"
                meta="obe ruky"
                text="Obe ruky voľné. Hodnotíme gestá oboch rúk."
              />
              <Card
                active={micMode}
                onClick={() => onMic(true)}
                title="Mikrofón v ruke"
                meta="jedna ruka"
                text="Ruku s mikrofónom vynecháme a sledujeme, či ho držíš pri ústach."
              />
            </div>

            {micMode && (
              <>
                {micSource ? <div className="mt-6">{micSource}</div> : null}
                <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-faint">V ktorej ruke držíš mikrofón?</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card
                    active={micHand === "left"}
                    onClick={() => onMicHand("left")}
                    title="V ľavej"
                    meta="pravák"
                    text="Gestikuluješ pravou rukou."
                  />
                  <Card
                    active={micHand === "auto"}
                    onClick={() => onMicHand("auto")}
                    title="Rozpoznať automaticky"
                    meta="auto"
                    text="Vyberieme ruku, ktorá zostáva pri ústach."
                  />
                  <Card
                    active={micHand === "right"}
                    onClick={() => onMicHand("right")}
                    title="V pravej"
                    meta="ľavák"
                    text="Gestikuluješ ľavou rukou."
                  />
                </div>
              </>
            )}

            <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-faint">Kvalita sledovania</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {QUALITIES.map((q) => (
                <Card key={q.id} active={quality === q.id} onClick={() => onQuality(q.id)} title={q.title} meta={q.meta} text={q.text} />
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-faint">Teleprompter</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card
                active={prompter.scriptId === null}
                onClick={() => onPrompter({ ...prompter, scriptId: null })}
                title="Bez textu"
                meta="voľne"
                text="Hovoríš spamäti."
              />
              {SCRIPTS.map((s) => (
                <Card
                  key={s.id}
                  active={prompter.scriptId === s.id}
                  onClick={() => onPrompter({ ...prompter, scriptId: s.id })}
                  title={s.title.replace(/ \(.*\)$/, "")}
                  meta={s.title.match(/\((.*)\)/)?.[1] ?? ""}
                  text="Ukážkový text s pokynmi na gestá."
                />
              ))}
              <Card
                active={prompter.scriptId === "custom"}
                onClick={() => onPrompter({ ...prompter, scriptId: "custom" })}
                title="Môj vlastný text"
                meta="vložiť"
                text="Vlož svoj pitch. Pridaj pokyny ako [krok] alebo [otvorené dlane]."
              />
            </div>

            {prompter.scriptId === "custom" && (
              <textarea
                value={prompter.customText}
                onChange={(e) => onPrompter({ ...prompter, customText: e.target.value })}
                placeholder="Sem vlož svoj pitch. Odseky oddeľ prázdnym riadkom, pokyny daj do hranatých zátvoriek, napr. [pauza] alebo [počítaj na prstoch]."
                className="mt-4 h-48 w-full rounded-2xl border border-line bg-ink p-4 text-paper outline-none focus:border-signal"
              />
            )}

            {prompter.scriptId !== null && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-3 text-mute">
                  Rýchlosť čítania
                  <select
                    value={prompter.wpm}
                    onChange={(e) => onPrompter({ ...prompter, wpm: Number(e.target.value) })}
                    className="rounded-lg border border-line bg-ink px-3 py-2"
                  >
                    <option value={110}>Pomaly · 110 slov/min</option>
                    <option value={130}>Pokojne · 130 slov/min</option>
                    <option value={150}>Tempo TED · 150 slov/min</option>
                    <option value={170}>Rýchlo · 170 slov/min</option>
                  </select>
                </label>
                <p className="text-sm text-faint">
                  Počas nahrávania: <b className="text-mute">medzerník</b> pozastaví, <b className="text-mute">↑ ↓</b> mení rýchlosť.
                </p>
              </div>
            )}
            {prompterText && prompter.scriptId !== "custom" && (
              <p className="mt-4 line-clamp-3 max-w-3xl text-sm text-faint">{prompterText}</p>
            )}
          </section>
        </div>
      </details>

      <div className="flex flex-col items-start gap-3">
        {children}
        {countdown && onCountdown ? (
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label="Odpočet pred nahrávaním">
            <span className="mr-1 text-sm font-bold text-mute">Odpočet</span>
            {COUNTDOWN_OPTIONS.map((sec) => (
              <button
                key={sec}
                type="button"
                role="radio"
                aria-checked={countdown === sec}
                onClick={() => onCountdown(sec)}
                className={`whitespace-nowrap rounded-full border-2 px-4 py-1.5 text-sm font-bold transition ${
                  countdown === sec ? "border-signal bg-signal/10 text-paper" : "border-line text-mute hover:border-faint"
                }`}
              >
                {sec} s
              </button>
            ))}
          </div>
        ) : null}
        {error && <p className="rounded-xl bg-danger/15 p-4 text-coral">{error}</p>}
        <button
          type="button"
          onClick={onStart}
          disabled={!canStart}
          className="rounded-full bg-signal px-10 py-5 text-xl font-bold text-on-signal transition hover:bg-signal-hover disabled:opacity-40"
        >
          {startLabel ?? (drill ? "Spustiť cvičenie" : "Spustiť")} →
        </button>
        <p className="text-sm text-faint">{finePrint}</p>
      </div>
    </div>
  );
}
