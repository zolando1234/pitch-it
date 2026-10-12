"use client";

import Link from "next/link";
import { scriptsFor, type SessionMode } from "@/lib/coach/modes";
import { useLocale } from "@/components/i18n/locale-provider";
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
  /** prvé rozhodnutie hneď pod nadpisom (napr. kamera alebo nahraté video) */
  top?: React.ReactNode;
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

const SETUP = {
  sk: {
    finePrint: "Video sa spracúva iba v tvojom prehliadači a nikam sa neodosiela.",
    pickDrill: "Vyber si cvičenie",
    howTo: (t: string) => `Ako na cvičenie „${t}“`,
    drillNote: "Počas cvičenia ti tréner radí len k tejto zručnosti.",
    before: "Než začneš",
    tips: ["Postav sa 2 až 3 m od kamery.", "Kamera vidí trup, ideálne po kolená.", "Odpočet beží, až keď ťa kamera vidí. Hodnotíme až po ňom."],
    settings: "Nastavenia",
    howSpeak: "Ako budeš hovoriť?",
    noMic: ["Bez mikrofónu v ruke", "obe ruky", "Obe ruky voľné. Hodnotíme gestá oboch rúk."],
    withMic: ["Mikrofón v ruke", "jedna ruka", "Ruku s mikrofónom vynecháme a sledujeme, či ho držíš pri ústach."],
    whichHand: "V ktorej ruke držíš mikrofón?",
    left: ["V ľavej", "pravák", "Gestikuluješ pravou rukou."],
    auto: ["Rozpoznať automaticky", "auto", "Vyberieme ruku, ktorá zostáva pri ústach."],
    right: ["V pravej", "ľavák", "Gestikuluješ ľavou rukou."],
    quality: "Kvalita sledovania",
    noText: ["Bez textu", "voľne", "Hovoríš spamäti."],
    sampleText: "Ukážkový text s pokynmi na gestá.",
    ownText: ["Môj vlastný text", "vložiť", "Vlož svoj pitch. Pridaj pokyny ako [krok] alebo [otvorené dlane]."],
    ownPlaceholder: "Sem vlož svoj pitch. Odseky oddeľ prázdnym riadkom, pokyny daj do hranatých zátvoriek, napr. [pauza] alebo [počítaj na prstoch].",
    speed: "Rýchlosť čítania",
    speeds: ["Pomaly", "Pokojne", "Tempo TED", "Rýchlo"],
    wpm: "slov/min",
    keys: ["Počas nahrávania:", "medzerník", "pozastaví,", "mení rýchlosť."],
    countdown: "Odpočet",
    countdownAria: "Odpočet pred nahrávaním",
    startDrill: "Spustiť cvičenie",
    start: "Spustiť",
  },
  en: {
    finePrint: "The video is processed only in your browser and never uploaded.",
    pickDrill: "Pick an exercise",
    howTo: (t: string) => `How to do “${t}”`,
    drillNote: "During the exercise the coach only gives tips on this skill.",
    before: "Before you start",
    tips: ["Stand 2 to 3 m from the camera.", "The camera sees your torso, ideally down to the knees.", "The countdown runs only once the camera sees you. Scoring starts after it."],
    settings: "Settings",
    howSpeak: "How will you speak?",
    noMic: ["No handheld mic", "both hands", "Both hands free. We score gestures of both hands."],
    withMic: ["Handheld mic", "one hand", "We ignore the hand holding the mic and check that you keep it at your mouth."],
    whichHand: "Which hand holds the mic?",
    left: ["Left", "right-handed", "You gesture with your right hand."],
    auto: ["Detect automatically", "auto", "We pick the hand that stays at your mouth."],
    right: ["Right", "left-handed", "You gesture with your left hand."],
    quality: "Tracking quality",
    noText: ["No script", "free", "You speak from memory."],
    sampleText: "Sample script with gesture cues.",
    ownText: ["My own script", "paste", "Paste your pitch. Add cues like [step] or [open palms]."],
    ownPlaceholder: "Paste your pitch here. Separate paragraphs with an empty line, put cues in square brackets, e.g. [pause] or [count on fingers].",
    speed: "Reading speed",
    speeds: ["Slow", "Calm", "TED pace", "Fast"],
    wpm: "words/min",
    keys: ["While recording:", "space", "pauses,", "changes the speed."],
    countdown: "Countdown",
    countdownAria: "Countdown before recording",
    startDrill: "Start exercise",
    start: "Start",
  },
};

const QUALITIES_EN: Record<TrackingQuality, { title: string; meta: string; text: string }> = {
  fast: { title: "Fast", meta: "older laptops", text: "The lightest model. Smooth even on a slow computer, less accurate." },
  balanced: { title: "Balanced", meta: "recommended", text: "Good accuracy. If the computer can't keep up, it switches to fast." },
  precise: { title: "Precise", meta: "powerful computer", text: "The most accurate body tracking, best when you stand further away. Needs a strong GPU." },
};

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
  finePrint,
  children,
  micSource,
  top,
  onStart,
}: Props) {
  const locale = useLocale();
  const tx = SETUP[locale];
  const scripts = scriptsFor(locale);
  const drill = mode.kind === "drill" ? mode : null;
  const prompterText =
    prompter.scriptId === "custom" ? prompter.customText : scripts.find((s) => s.id === prompter.scriptId)?.text;
  const canStart = canStartOuter && (prompter.scriptId !== "custom" || prompter.customText.trim().length > 0);
  let n = 0;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-8">
      <div className="flex flex-col gap-3">
        <Link href={backHref} className="text-sm font-bold uppercase tracking-[0.3em] text-accent">
          ← {backLabel}
        </Link>
        <h1 className="h text-4xl leading-tight md:text-6xl">{heading}</h1>
        <p className="max-w-2xl text-lg text-mute">{lead}</p>
      </div>

      {top}

      {modes ? (
        <section>
          <SectionTitle n={++n}>{tx.pickDrill}</SectionTitle>
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
              <p className="font-bold">{tx.howTo(drill.title)}</p>
              <ol className="mt-3 flex list-decimal flex-col gap-1.5 pl-5 text-mute">
                {drill.howTo.map((h) => (
                  <li key={h}>{h}</li>
                ))}
              </ol>
              <p className="mt-3 text-sm text-faint">{tx.drillNote}</p>
            </div>
          )}
        </section>
      ) : null}

      <section className="rounded-3xl border border-line p-5 md:p-6">
        <p className="mb-3 text-xs font-bold uppercase tracking-widest text-faint">{tx.before}</p>
        <ul className="grid gap-2 text-mute sm:grid-cols-3">
          {tx.tips.map((tip) => (
            <li key={tip}>• {tip}</li>
          ))}
        </ul>
      </section>
      {/* Voľby sú hneď viditeľné; s predvolenými hodnotami sa dá rovno začať. */}
      <details className="group" open>
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-mute hover:text-paper [&::-webkit-details-marker]:hidden">
          {tx.settings}
          <span className="transition group-open:rotate-180">▾</span>
        </summary>
        <div className="mt-4 flex flex-col gap-10 rounded-3xl border border-line p-5 md:p-8">
          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-faint">{tx.howSpeak}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Card
                active={!micMode}
                onClick={() => onMic(false)}
                title={tx.noMic[0]}
                meta={tx.noMic[1]}
                text={tx.noMic[2]}
              />
              <Card
                active={micMode}
                onClick={() => onMic(true)}
                title={tx.withMic[0]}
                meta={tx.withMic[1]}
                text={tx.withMic[2]}
              />
            </div>

            {micMode && (
              <>
                {micSource ? <div className="mt-6">{micSource}</div> : null}
                <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-faint">{tx.whichHand}</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Card
                    active={micHand === "left"}
                    onClick={() => onMicHand("left")}
                    title={tx.left[0]}
                    meta={tx.left[1]}
                    text={tx.left[2]}
                  />
                  <Card
                    active={micHand === "auto"}
                    onClick={() => onMicHand("auto")}
                    title={tx.auto[0]}
                    meta={tx.auto[1]}
                    text={tx.auto[2]}
                  />
                  <Card
                    active={micHand === "right"}
                    onClick={() => onMicHand("right")}
                    title={tx.right[0]}
                    meta={tx.right[1]}
                    text={tx.right[2]}
                  />
                </div>
              </>
            )}

            <p className="mb-3 mt-6 text-xs font-bold uppercase tracking-widest text-faint">{tx.quality}</p>
            <div className="grid gap-3 sm:grid-cols-3">
              {QUALITIES.map((q) => (
                <Card key={q.id} active={quality === q.id} onClick={() => onQuality(q.id)} {...(locale === "en" ? QUALITIES_EN[q.id] : q)} />
              ))}
            </div>
          </section>

          <section>
            <p className="mb-3 text-xs font-bold uppercase tracking-widest text-faint">Teleprompter</p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Card
                active={prompter.scriptId === null}
                onClick={() => onPrompter({ ...prompter, scriptId: null })}
                title={tx.noText[0]}
                meta={tx.noText[1]}
                text={tx.noText[2]}
              />
              {scripts.map((s) => (
                <Card
                  key={s.id}
                  active={prompter.scriptId === s.id}
                  onClick={() => onPrompter({ ...prompter, scriptId: s.id })}
                  title={s.title.replace(/ \(.*\)$/, "")}
                  meta={s.title.match(/\((.*)\)/)?.[1] ?? ""}
                  text={tx.sampleText}
                />
              ))}
              <Card
                active={prompter.scriptId === "custom"}
                onClick={() => onPrompter({ ...prompter, scriptId: "custom" })}
                title={tx.ownText[0]}
                meta={tx.ownText[1]}
                text={tx.ownText[2]}
              />
            </div>

            {prompter.scriptId === "custom" && (
              <textarea
                value={prompter.customText}
                onChange={(e) => onPrompter({ ...prompter, customText: e.target.value })}
                placeholder={tx.ownPlaceholder}
                className="mt-4 h-48 w-full rounded-2xl border border-line bg-ink p-4 text-paper outline-none focus:border-signal"
              />
            )}

            {prompter.scriptId !== null && (
              <div className="mt-4 flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-3 text-mute">
                  {tx.speed}
                  <select
                    value={prompter.wpm}
                    onChange={(e) => onPrompter({ ...prompter, wpm: Number(e.target.value) })}
                    className="rounded-lg border border-line bg-ink px-3 py-2"
                  >
                    {[110, 130, 150, 170].map((v, i) => (
                      <option key={v} value={v}>
                        {tx.speeds[i]} · {v} {tx.wpm}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm text-faint">
                  {tx.keys[0]} <b className="text-mute">{tx.keys[1]}</b> {tx.keys[2]} <b className="text-mute">↑ ↓</b> {tx.keys[3]}
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
          <div className="flex flex-wrap items-center gap-2" role="radiogroup" aria-label={tx.countdownAria}>
            <span className="mr-1 text-sm font-bold text-mute">{tx.countdown}</span>
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
          {startLabel ?? (drill ? tx.startDrill : tx.start)} →
        </button>
        <p className="text-sm text-faint">{finePrint ?? tx.finePrint}</p>
      </div>
    </div>
  );
}
