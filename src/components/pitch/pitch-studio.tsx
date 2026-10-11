"use client";

import "@/styles/screens/coach.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CameraStage from "@/components/coach/CameraStage";
import { bubbleAnchor, type Anchor, type CoachPrefs } from "@/components/coach/coach-live";
import FeedbackBubble from "@/components/coach/FeedbackBubble";
import Teleprompter from "@/components/coach/Teleprompter";
import { fmtClock, INITIAL_FB, useCoachSession, type CoachResult } from "@/components/coach/use-coach-session";
import { PI_BACKGROUND } from "@/components/pitch/pi-topbar";
import { useLiveTranscript } from "@/components/pitch/use-live-transcript";
import { Wordmark } from "@/components/wordmark";
import type { TalkMode } from "@/lib/coach/modes";
import type { FeedbackState, Status } from "@/lib/coach/pose/feedback";
import type { Metrics } from "@/lib/coach/pose/metrics";
import { STATUS_COLOR, STATUS_TEXT } from "@/lib/coach/pose/renderer";
import { RULE_BY_ID } from "@/lib/coach/pose/rules";
import { LANGUAGE_INFO, type PitchLanguage } from "@/lib/pitch/language";
import { keywordsOf, matchesStem as matches, normalize, stemOf, tokenize, type PitchOutline } from "@/lib/pitch/outline";

/*
  Štúdio na nahrávanie pitchu s kamerou: vľavo body pitchu alebo vlastná osnova (odškrtávajú sa
  podľa živého prepisu) a poznámky, vpravo video s titulkami a pod ním reč tela naživo.
*/

type Point = { id: string; title: string; keywords: string[] };

const DEFAULT_POINTS: Point[] = [
  { id: "problem", title: "Problém", keywords: ["problém", "bolesť", "drahé", "dnes"] },
  { id: "solution", title: "Naše riešenie", keywords: ["riešenie", "produkt", "AI"] },
  { id: "market", title: "Veľkosť trhu", keywords: ["trh", "TAM", "Európa"] },
  { id: "traction", title: "Traction", keywords: ["používatelia", "tržby", "rast"] },
  { id: "model", title: "Biznis model", keywords: ["cenník", "predplatné", "platia"] },
  { id: "ask", title: "Žiadosť o investíciu", keywords: ["investícia", "kolo", "investori"] },
];

const POINTS_KEY = "pitchit-pitch-points";
const NOTES_KEY = "pitchit-pitch-notes";
const CAPTION_WORDS = 14;

function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // bez localStorage si body a poznámky len nezapamätáme
  }
}

/** Ktoré body už zazneli a ktorý zaznel naposledy. */
function coverage(points: Point[], tokens: string[]) {
  const stems = points.map((p) => p.keywords.map(stemOf).filter(Boolean));
  const covered = new Set<string>();
  let current: string | null = null;
  for (const token of tokens) {
    points.forEach((p, i) => {
      if (stems[i].some((s) => matches(token, s))) {
        covered.add(p.id);
        current = p.id;
      }
    });
  }
  return { covered, current, stems: stems.flat() };
}

type Chip = { id: string; label: string; status: Exclude<Status, "idle">; now: boolean };

const GOOD_CHIPS: { id: string; label: string; blockedBy: (id: string) => boolean }[] = [
  { id: "open", label: "Otvorené dlane", blockedBy: (id) => ["palms-away", "crossed", "closed", "fists", "clasped", "fig-leaf", "wringing"].includes(id) },
  { id: "eyes", label: "Dobrý očný kontakt", blockedBy: (id) => RULE_BY_ID[id]?.group === "head" },
  { id: "stance", label: "Pokojný postoj", blockedBy: (id) => ["posture", "stage"].includes(RULE_BY_ID[id]?.group) },
];

/** Dlaždice reči tela: čo ide dobre a čo práve treba opraviť. */
function bodyChips(fb: FeedbackState, m: Metrics | null): Chip[] {
  if (fb.status === "idle" || !m) return [];
  const issues: Chip[] = fb.activeIds
    .map((id) => RULE_BY_ID[id])
    .filter((r) => r && r.group !== "setup")
    .slice(0, 2)
    .map((r) => ({ id: r.id, label: r.title, status: r.severity === "bad" ? "bad" : "warn", now: r.id === fb.ruleId }));
  const good: Chip[] = GOOD_CHIPS.filter((g) => !fb.activeIds.some(g.blockedBy)).map((g) => ({ id: g.id, label: g.label, status: "good", now: false }));
  return [...good.slice(0, Math.max(1, 3 - issues.length)), ...issues];
}

function Face({ status }: { status: Chip["status"] }) {
  const mouth = status === "good" ? "M8 15c1.2 1.6 2.5 2.3 4 2.3s2.8-.7 4-2.3" : status === "warn" ? "M8.5 16h7" : "M8 17c1.2-1.6 2.5-2.3 4-2.3s2.8.7 4 2.3";
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="11" fill={STATUS_COLOR[status]} />
      <circle cx="8.7" cy="9.5" r="1.3" fill="#141414" />
      <circle cx="15.3" cy="9.5" r="1.3" fill="#141414" />
      <path d={mouth} fill="none" stroke="#141414" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

const CHIP_SUB = { good: "Sebavedomo", warn: "Pozor", bad: "Upozornenie" } as const;

function Pill({ children }: { children: ReactNode }) {
  return <span className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur">{children}</span>;
}

export function PitchStudio({
  mode,
  title,
  subtitle,
  prefs,
  outline = null,
  startFull = false,
  language = "sk",
  ruleFilter,
  onLive,
  onPause,
  onResume,
  onFinish,
  onError,
  onBack,
  onRestart,
}: {
  mode: TalkMode;
  title: string;
  subtitle: string;
  prefs: CoachPrefs;
  /** téma a osnova z nastavenia; keď má body, nahradí predvolené body pitchu */
  outline?: PitchOutline | null;
  /** začať na celej obrazovke (prehliadač ju zapína už pri kliknutí na štart) */
  startFull?: boolean;
  /** jazyk živých titulkov */
  language?: PitchLanguage;
  ruleFilter: (id: string) => boolean;
  onLive?: () => void;
  onPause?: () => void;
  onResume?: () => void;
  onFinish: (result: CoachResult) => void;
  onError: (message: string) => void;
  /** návrat na nastavenie bez uloženia */
  onBack: () => void;
  /** zahodí nahrávku a začne odznova */
  onRestart: () => void;
}) {
  const { prompter, onPrompter, prompterText, micMode, micHand, quality } = prefs;
  const stageRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const prompterRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const session = useCoachSession({
    mode,
    countdown: prefs.countdown,
    onLive,
    onPause,
    onResume,
    onFinish,
    onError,
    // veľká rada nad hlavou, pod stavovými štítkami a telepromptrom
    onUi: (m) => {
      const head = m ? (session.stageApi.current?.headAnchor(m) ?? null) : null;
      const p = prompterRef.current;
      setAnchor(bubbleAnchor(head, stageRef.current, bubbleRef.current, p ? p.offsetTop + p.offsetHeight : 48));
    },
  });
  const { phase, fb, metrics, count, waitingForPerson, elapsedMs, durationMs, stageApi } = session;
  const recording = phase === "live";
  const transcript = useLiveTranscript(recording, LANGUAGE_INFO[language].bcp47);

  // celá obrazovka: iba záber s trénerom a tlačidlo Zastaviť
  const [full, setFull] = useState(startFull);
  const enterFull = () => {
    setFull(true);
    // kde prehliadač nevie Fullscreen API (iPhone), stačí záber cez celé okno
    stageRef.current?.requestFullscreen?.().catch(() => {});
  };
  const exitFull = () => {
    setFull(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    };
  }, []);
  const stop = () => {
    exitFull();
    void session.finish();
  };

  const [ownPoints, setPoints] = useState<Point[]>(DEFAULT_POINTS);
  const outlinePoints = useMemo<Point[] | null>(
    () => (outline?.points.length ? outline.points.map((title, i) => ({ id: `osnova-${i}`, title, keywords: keywordsOf(title) })) : null),
    [outline],
  );
  const points = outlinePoints ?? ownPoints;
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage je dostupný až na klientovi */
    setPoints(readLocal(POINTS_KEY, DEFAULT_POINTS));
    setNotes(readLocal(NOTES_KEY, ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const savePoints = (next: Point[]) => {
    setPoints(next);
    writeLocal(POINTS_KEY, next);
  };

  const addPoint = () => {
    const text = draft.trim();
    if (!text) return;
    const keywords = text.split(/\s+/).filter((w) => normalize(w).length >= 3);
    savePoints([...ownPoints, { id: `own-${Date.now()}`, title: text, keywords: keywords.length ? keywords : [text] }]);
    setDraft("");
  };

  const spoken = `${transcript.final} ${transcript.interim}`.trim();
  const tokens = useMemo(() => tokenize(spoken), [spoken]);
  const { covered, current, stems } = useMemo(() => coverage(points, tokens), [points, tokens]);
  const caption = spoken.split(/\s+/).filter(Boolean).slice(-CAPTION_WORDS);
  const chips = bodyChips(fb, metrics);

  const status =
    phase === "live" ? "Nahrávam" : phase === "paused" ? "Pozastavené" : phase === "countdown" ? "Začíname" : "Pripravujem";

  return (
    <div className="pi-rec min-h-dvh text-paper" style={{ background: PI_BACKGROUND }}>
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-3.5 md:px-7">
        <div className="flex min-w-0 items-center gap-5">
          <Wordmark href="/app" />
          <div className="min-w-0">
            <p className="h truncate text-[15px]">{title}</p>
            <p className="truncate text-xs text-mute">{subtitle}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={onBack} style={{ minHeight: "44px", padding: "10px 18px", fontSize: "14px" }}>
            Späť na nastavenie
          </button>
          <button
            type="button"
            className="btn btn-p"
            onClick={() => void session.finish()}
            disabled={phase !== "live" && phase !== "paused"}
            style={{ minHeight: "44px", padding: "10px 18px", fontSize: "14px", opacity: phase === "live" || phase === "paused" ? 1 : 0.4 }}
          >
            Dokončiť a zobraziť report
          </button>
        </div>
      </header>

      <main id="obsah" className="flex flex-col gap-5 p-4 md:p-6 lg:grid lg:grid-cols-[18rem_1fr] xl:grid-cols-[20rem_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card" style={{ padding: "20px" }} aria-label={outlinePoints ? "Tvoja osnova" : "Body pitchu"}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h text-base">{outlinePoints ? "Tvoja osnova" : "Body pitchu"}</h2>
              <span className="text-xs text-mute">
                pokrytých {covered.size} z {points.length}
              </span>
            </div>
            {outline?.topic ? (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-line bg-black/20 px-3.5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-mute">Téma</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed">{outline.topic}</p>
              </div>
            ) : null}
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line">
              <div
                className="h-full rounded-full bg-gradient-to-r from-violet to-signal transition-[width] duration-500"
                style={{ width: `${points.length ? (covered.size / points.length) * 100 : 0}%` }}
              />
            </div>
            <ul className="mt-4 flex flex-col gap-2.5">
              {points.map((p) => {
                const done = covered.has(p.id);
                const now = p.id === current && recording;
                return (
                  <li
                    key={p.id}
                    className={`group flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-colors ${done ? "border-signal/50 bg-signal/10" : "border-line"}`}
                  >
                    {done ? (
                      <svg width="20" height="20" viewBox="0 0 22 22" aria-label="Pokryté" className="shrink-0">
                        <circle cx="11" cy="11" r="11" fill="var(--color-signal)" />
                        <path d="M6 11.5L9.5 15L16 8" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden="true" className="shrink-0">
                        <circle cx="11" cy="11" r="10" fill="none" stroke="var(--color-line-strong)" strokeWidth="2" />
                      </svg>
                    )}
                    <span className="min-w-0 flex-1">
                      <b className="block text-sm">{p.title}</b>
                      <span className="block text-[11px] text-mute">kľúčové slová: {p.keywords.join(", ")}</span>
                    </span>
                    {now ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-accent">Práve teraz</span> : null}
                    {p.id.startsWith("own-") && !now ? (
                      <button
                        type="button"
                        onClick={() => savePoints(ownPoints.filter((x) => x.id !== p.id))}
                        className="shrink-0 rounded-full px-2 text-mute opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Odstrániť bod ${p.title}`}
                      >
                        ✕
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {outlinePoints ? (
              <p className="mt-4 text-xs text-faint">Odškrtávanie je orientačné. Presnú zhodu s osnovou a zrozumiteľnosť vyhodnotíme po nahrávaní.</p>
            ) : (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                addPoint();
              }}
            >
              <label htmlFor="novy-bod" className="text-xs text-mute">
                Pridaj bod a stlač Enter
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="novy-bod"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Napríklad: Tím a prečo my"
                  className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-2 text-sm text-paper placeholder:text-faint focus:border-signal focus:outline-none"
                />
                <button type="submit" className="btn btn-p" style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                  Pridať
                </button>
              </div>
            </form>
            )}
          </section>

          <section className="card" style={{ padding: "20px" }}>
            <label htmlFor="poznamky" className="h text-base">
              Moje poznámky
            </label>
            <textarea
              id="poznamky"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                writeLocal(NOTES_KEY, e.target.value);
              }}
              rows={4}
              placeholder="Spomaľ pri číslach. Po slajde o trhu urob pauzu."
              className="mt-3 w-full resize-y rounded-xl border border-line bg-transparent px-3.5 py-3 text-sm text-paper placeholder:text-faint focus:border-signal focus:outline-none"
            />
          </section>
        </div>

        <div className="order-first flex min-w-0 flex-col gap-5 lg:order-none">
          <section className="card" style={{ padding: "12px" }}>
            <div
              ref={stageRef}
              className={
                full
                  ? "stage-dark fixed inset-0 z-50 h-dvh w-full overflow-hidden bg-[#17142e]"
                  : "stage-dark relative aspect-video overflow-hidden rounded-2xl lg:aspect-auto lg:h-[calc(100dvh-210px)] lg:min-h-[440px] bg-[#17142e]"
              }
            >
              <div className="absolute inset-0">
                <CameraStage
                  ref={stageApi}
                  micMode={micMode}
                  micHand={micHand}
                  quality={quality}
                  ruleFilter={ruleFilter}
                  onFrame={session.onFrame}
                  onReady={session.onReady}
                  onError={session.onStageError}
                />
              </div>

              <div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-3">
                <Pill>
                  <span className={`h-2 w-2 rounded-full ${phase === "live" ? "animate-pulse bg-danger" : phase === "paused" ? "bg-danger" : "bg-faint"}`} />
                  <span className="uppercase tracking-wider">{status}</span>
                  <span className="font-mono">
                    {fmtClock(elapsedMs)}
                    {durationMs !== null ? <span className="text-white/60"> / {fmtClock(durationMs)}</span> : null}
                  </span>
                </Pill>
                {full ? (
                  <button
                    type="button"
                    onClick={exitFull}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur hover:bg-black/80"
                    aria-label="Zmenšiť záber"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                    </svg>
                  </button>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="hidden sm:block">
                      <Pill>{phase === "loading" ? "Zapínam kameru…" : "Kamera a mikrofón zapnuté"}</Pill>
                    </span>
                    <button
                      type="button"
                      onClick={enterFull}
                      className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur hover:bg-black/80"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                      </svg>
                      Celá obrazovka
                    </button>
                  </span>
                )}
              </div>

              {prompterText ? (
                <div ref={prompterRef} className="absolute left-1/2 top-12 z-20 h-[34%] w-[min(92%,900px)] -translate-x-1/2">
                  <Teleprompter text={prompterText} wpm={prompter.wpm} onWpmChange={(wpm) => onPrompter({ ...prompter, wpm })} running={recording} />
                </div>
              ) : null}

              {phase === "live" || phase === "paused" ? (
                <div
                  ref={bubbleRef}
                  className="absolute z-20 w-[92%] max-w-[900px] -translate-x-1/2 -translate-y-full transition-[left,top] duration-100 ease-out"
                  style={anchor ? { left: anchor.x, top: anchor.y } : { left: "50%", top: "60%" }}
                >
                  <FeedbackBubble fb={fb} />
                </div>
              ) : null}

              {phase === "loading" ? (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70">
                  <p className="animate-pulse text-lg text-white/70">Načítavam kameru a model…</p>
                </div>
              ) : null}
              {phase === "countdown" ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 px-6 text-center text-white">
                  <p className={waitingForPerson ? "text-2xl font-bold" : "text-sm text-white/70"}>
                    {waitingForPerson ? "Postav sa do záberu" : "Pozeraj sa rovno do kamery"}
                  </p>
                  {waitingForPerson ? <p className="mt-2 text-sm text-white/70">Odpočet pokračuje, keď ťa kamera uvidí.</p> : null}
                  <p
                    key={count}
                    className={`animate-pop h leading-none transition-opacity ${full ? "text-[12rem]" : "text-[7rem]"} ${waitingForPerson ? "opacity-30" : ""}`}
                    style={{
                      background: "linear-gradient(135deg,#D2FF6B,var(--color-violet))",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      color: "transparent",
                    }}
                  >
                    {count || "Štart"}
                  </p>
                </div>
              ) : null}

              {phase === "live" || phase === "paused" ? (
                <div
                  className={`absolute inset-x-3 z-20 rounded-xl bg-black/75 px-4 py-3 text-sm text-white backdrop-blur ${full ? "bottom-24 mx-auto max-w-3xl" : "bottom-3"}`}
                  aria-live="off"
                >
                  {!transcript.supported ? (
                    <span className="text-white/60">Živé titulky tento prehliadač nepodporuje. Body si odškrtni po nahrávke, prepis dostaneš v reporte.</span>
                  ) : caption.length ? (
                    <span>
                      …
                      {caption.map((word, i) => {
                        const t = tokenize(word)[0];
                        const hit = t && stems.some((s) => matches(t, s));
                        return (
                          <span key={i}>
                            {hit ? <span className="rounded-md bg-signal/25 px-1.5 py-0.5 font-bold text-signal">{word}</span> : word}{" "}
                          </span>
                        );
                      })}
                    </span>
                  ) : (
                    <span className="text-white/60">{phase === "paused" ? "Pozastavené. Pokračuj, keď budeš pripravený." : "Začni hovoriť, titulky sa objavia tu."}</span>
                  )}
                </div>
              ) : null}

              {full ? (
                <div className="absolute inset-x-0 bottom-6 z-30 flex justify-center">
                  <button
                    type="button"
                    onClick={stop}
                    disabled={phase !== "live" && phase !== "paused"}
                    className="flex min-h-[56px] items-center gap-3 rounded-full bg-danger px-8 text-base font-bold text-white shadow-lg transition hover:brightness-110 disabled:opacity-40"
                  >
                    <span className="h-4 w-4 rounded-[3px] bg-white" aria-hidden="true" />
                    Zastaviť
                  </button>
                </div>
              ) : null}
            </div>

            <div className="flex justify-center gap-3 py-3">
              <button
                type="button"
                className="btn btn-p"
                onClick={phase === "paused" ? session.resume : session.pause}
                disabled={phase !== "live" && phase !== "paused"}
                style={{ minHeight: "42px", padding: "8px 26px", fontSize: "14px", minWidth: "140px" }}
              >
                {phase === "paused" ? "Pokračovať" : "Pozastaviť"}
              </button>
              <button type="button" className="btn" onClick={onRestart} style={{ minHeight: "42px", padding: "8px 20px", fontSize: "14px" }}>
                Znova
              </button>
            </div>
          </section>

          <section className="card" style={{ padding: "20px" }} aria-label="Reč tela naživo">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h text-base">Reč tela naživo</h2>
              <span className="text-[11px] text-mute">Zelená: sebavedomé · Žltá: pozor · Červená: upozornenie</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-3" aria-live="polite">
              {chips.length ? (
                chips.map((c) => (
                  <div
                    key={c.id}
                    className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 ${c.now ? "border-signal/60 bg-signal/10" : "border-line"}`}
                  >
                    <Face status={c.status} />
                    <span>
                      <b className="block text-[13px]">{c.label}</b>
                      <span className="block text-[10px] font-bold uppercase tracking-wider" style={{ color: c.now ? undefined : STATUS_TEXT[c.status] }}>
                        {c.now ? <span className="text-accent">Teraz</span> : CHIP_SUB[c.status]}
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mute">{phase === "loading" ? "Zapínam sledovanie tela…" : fb.title === INITIAL_FB.title ? "Postav sa do záberu." : fb.tip}</p>
              )}
            </div>
            {chips.length && (fb.status === "warn" || fb.status === "bad") ? <p className="mt-3 text-sm text-mute">{fb.tip}</p> : null}
          </section>
        </div>
      </main>
    </div>
  );
}
