"use client";

import "@/styles/screens/coach.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import CameraStage from "@/components/coach/CameraStage";
import { bubbleAnchor, type Anchor, type CoachPrefs } from "@/components/coach/coach-live";
import FeedbackBubble from "@/components/coach/FeedbackBubble";
import { fmtClock, INITIAL_FB, useCoachSession, type CoachResult } from "@/components/coach/use-coach-session";
import { PI_BACKGROUND } from "@/components/pitch/pi-topbar";
import { useLiveTranscript } from "@/components/pitch/use-live-transcript";
import { Wordmark } from "@/components/wordmark";
import type { TalkMode } from "@/lib/coach/modes";
import { useClientQuestions, type MeetingSetup } from "@/components/pitch/client-questions";
import type { FeedbackState, Status } from "@/lib/coach/pose/feedback";
import type { Metrics } from "@/lib/coach/pose/metrics";
import { STATUS_COLOR, STATUS_TEXT } from "@/lib/coach/pose/renderer";
import { RULE_BY_ID } from "@/lib/coach/pose/rules";
import { ruleCopy } from "@/lib/coach/pose/copy";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n/locale";
import { LANGUAGE_INFO, type PitchLanguage } from "@/lib/pitch/language";
import { keywordsOf, matchesStem as matches, normalize, stemOf, tokenize, type PitchOutline } from "@/lib/pitch/outline";

/*
  Štúdio na nahrávanie pitchu s kamerou: vľavo body pitchu alebo vlastná osnova (odškrtávajú sa
  podľa živého prepisu) a poznámky, vpravo video s titulkami a pod ním reč tela naživo.
*/

type Point = { id: string; title: string; keywords: string[] };

const DEFAULT_POINTS_EN: Point[] = [
  { id: "problem", title: "Problem", keywords: ["problem", "pain", "expensive", "today"] },
  { id: "solution", title: "Our solution", keywords: ["solution", "product", "AI"] },
  { id: "market", title: "Market size", keywords: ["market", "TAM", "Europe"] },
  { id: "traction", title: "Traction", keywords: ["users", "revenue", "growth"] },
  { id: "model", title: "Business model", keywords: ["pricing", "subscription", "pay"] },
  { id: "ask", title: "The ask", keywords: ["investment", "round", "investors"] },
];

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

const GOOD_CHIPS: { id: string; label: string; labelEn: string; blockedBy: (id: string) => boolean }[] = [
  { id: "open", label: "Otvorené dlane", labelEn: "Open palms", blockedBy: (id) => ["palms-away", "crossed", "closed", "fists", "clasped", "fig-leaf", "wringing"].includes(id) },
  { id: "eyes", label: "Dobrý očný kontakt", labelEn: "Good eye contact", blockedBy: (id) => RULE_BY_ID[id]?.group === "head" },
  { id: "stance", label: "Pokojný postoj", labelEn: "Calm stance", blockedBy: (id) => ["posture", "stage"].includes(RULE_BY_ID[id]?.group) },
];

/** Dlaždice reči tela: čo ide dobre a čo práve treba opraviť. */
function bodyChips(fb: FeedbackState, m: Metrics | null, locale: Locale): Chip[] {
  if (fb.status === "idle" || !m) return [];
  const issues: Chip[] = fb.activeIds
    .map((id) => RULE_BY_ID[id])
    .filter((r) => r && r.group !== "setup")
    .slice(0, 2)
    .map((r) => ({ id: r.id, label: ruleCopy(r.id, locale).title, status: r.severity === "bad" ? "bad" : "warn", now: r.id === fb.ruleId }));
  const good: Chip[] = GOOD_CHIPS.filter((g) => !fb.activeIds.some(g.blockedBy)).map((g) => ({ id: g.id, label: locale === "en" ? g.labelEn : g.label, status: "good", now: false }));
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

const CHIP_SUB = {
  sk: { good: "Sebavedomo", warn: "Pozor", bad: "Upozornenie" },
  en: { good: "Confident", warn: "Watch out", bad: "Warning" },
} as const;

/** Texty štúdia v jazyku rozhrania. */
const STUDIO = {
  sk: {
    videoPlayFailed: "Video sa nepodarilo prehrať so zvukom. Skús iný prehliadač (Chrome) alebo video vo formáte MP4.",
    analyzing: "Analyzujem",
    recording: "Nahrávam",
    paused: "Pozastavené",
    starting: "Začíname",
    ready: "Pripravené",
    preparing: "Pripravujem",
    back: "Späť na nastavenie",
    finish: "Dokončiť a zobraziť report",
    outline: "Tvoja osnova",
    points: "Body pitchu",
    covered: (n: number, total: number) => `pokrytých ${n} z ${total}`,
    topic: "Téma",
    coveredLabel: "Pokryté",
    keywords: "kľúčové slová",
    rightNow: "Práve teraz",
    removePoint: (t: string) => `Odstrániť bod ${t}`,
    outlineHint: "Odškrtávanie je orientačné. Presnú zhodu s osnovou a zrozumiteľnosť vyhodnotíme po nahrávaní.",
    addPoint: "Pridaj bod a stlač Enter",
    addPlaceholder: "Napríklad: Tím a prečo my",
    add: "Pridať",
    notes: "Moje poznámky",
    notesPlaceholder: "Spomaľ pri číslach. Po slajde o trhu urob pauzu.",
    shrink: "Zmenšiť záber",
    loadingVideo: "Načítavam video…",
    startingCamera: "Zapínam kameru…",
    cameraOn: "Kamera a mikrofón zapnuté",
    fullscreen: "Celá obrazovka",
    loadingVideoModel: "Načítavam video a model…",
    loadingCameraModel: "Načítavam kameru a model…",
    videoIntro: "Tréner pozrie celé video tak, ako ho uvidí publikum. Analýza trvá rovnako dlho ako video.",
    quietTitle: "Analyzujem video…",
    quietNote: "Reč tela sa vyhodnocuje počas prehrávania, prepis reči beží súčasne. Report sa otvorí sám.",
    startingAnalysis: "Spúšťam…",
    startAnalysis: "Spustiť analýzu",
    stepIn: "Postav sa do záberu",
    lookAtCamera: "Pozeraj sa rovno do kamery",
    countdownWaits: "Odpočet pokračuje, keď ťa kamera uvidí.",
    go: "Štart",
    noCaptionsVideo: "Pri nahratom videe sa živé titulky nezobrazujú. Celý prepis dostaneš v reporte.",
    noCaptions: "Živé titulky tento prehliadač nepodporuje. Body si odškrtni po nahrávke, prepis dostaneš v reporte.",
    pausedHint: "Pozastavené. Pokračuj, keď budeš pripravený.",
    speakHint: "Začni hovoriť, titulky sa objavia tu.",
    stop: "Zastaviť",
    resume: "Pokračovať",
    pause: "Pozastaviť",
    again: "Znova",
    bodyLive: "Reč tela naživo",
    legend: "Zelená: sebavedomé · Žltá: pozor · Červená: upozornenie",
    now: "Teraz",
    startingTracking: "Zapínam sledovanie tela…",
    stepInShort: "Postav sa do záberu.",
  },
  en: {
    videoPlayFailed: "The video could not be played with sound. Try another browser (Chrome) or an MP4 video.",
    analyzing: "Analyzing",
    recording: "Recording",
    paused: "Paused",
    starting: "Starting",
    ready: "Ready",
    preparing: "Preparing",
    back: "Back to setup",
    finish: "Finish and show report",
    outline: "Your outline",
    points: "Pitch points",
    covered: (n: number, total: number) => `${n} of ${total} covered`,
    topic: "Topic",
    coveredLabel: "Covered",
    keywords: "keywords",
    rightNow: "Right now",
    removePoint: (t: string) => `Remove point ${t}`,
    outlineHint: "Ticking is approximate. We evaluate the exact outline match and clarity after the recording.",
    addPoint: "Add a point and press Enter",
    addPlaceholder: "For example: Team and why us",
    add: "Add",
    notes: "My notes",
    notesPlaceholder: "Slow down on numbers. Pause after the market slide.",
    shrink: "Exit full screen",
    loadingVideo: "Loading video…",
    startingCamera: "Starting camera…",
    cameraOn: "Camera and microphone on",
    fullscreen: "Full screen",
    loadingVideoModel: "Loading video and model…",
    loadingCameraModel: "Loading camera and model…",
    videoIntro: "The coach watches the whole video the way your audience will. The analysis takes as long as the video.",
    quietTitle: "Analyzing the video…",
    quietNote: "Body language is scored while the video plays and the speech is transcribed at the same time. The report opens by itself.",
    startingAnalysis: "Starting…",
    startAnalysis: "Start analysis",
    stepIn: "Step into the frame",
    lookAtCamera: "Look straight into the camera",
    countdownWaits: "The countdown continues once the camera sees you.",
    go: "Go",
    noCaptionsVideo: "Live captions are not shown for an uploaded video. You get the full transcript in the report.",
    noCaptions: "This browser doesn't support live captions. Tick the points after recording, the transcript is in the report.",
    pausedHint: "Paused. Continue when you're ready.",
    speakHint: "Start speaking, captions will appear here.",
    stop: "Stop",
    resume: "Resume",
    pause: "Pause",
    again: "Restart",
    bodyLive: "Body language live",
    legend: "Green: confident · Yellow: watch out · Red: warning",
    now: "Now",
    startingTracking: "Starting body tracking…",
    stepInShort: "Step into the frame.",
  },
};

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
  file = null,
  quiet = false,
  meeting = null,
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
  /** nahraté video namiesto kamery */
  file?: File | null;
  /** len analýza videa: bez zvuku, rád a titulkov, iba priebeh */
  quiet?: boolean;
  /** stretnutie s klientom: otázky počas výkladu */
  meeting?: MeetingSetup | null;
  ruleFilter: (id: string) => boolean;
  /** začiatok nahrávania; pri nahratom videe dostane zvuk videa */
  onLive?: (sourceAudio: MediaStream | null) => void;
  onPause?: () => void;
  onResume?: () => void;
  onFinish: (result: CoachResult) => void;
  onError: (message: string) => void;
  /** návrat na nastavenie bez uloženia */
  onBack: () => void;
  /** zahodí nahrávku a začne odznova */
  onRestart: () => void;
}) {
  const { micMode, micHand, quality } = prefs;
  const locale = useLocale();
  const tx = STUDIO[locale];
  const defaultPoints = locale === "en" ? DEFAULT_POINTS_EN : DEFAULT_POINTS;
  const stageRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const sourceAudio = useRef<MediaStream | null>(null);
  const [starting, setStarting] = useState(false);
  const session = useCoachSession({
    mode,
    countdown: prefs.countdown,
    manualStart: !!file,
    onLive: () => onLive?.(sourceAudio.current),
    onPause,
    onResume,
    onFinish,
    onError,
    // veľká rada nad hlavou, pod stavovými štítkami a telepromptrom
    onUi: (m) => {
      const head = m ? (session.stageApi.current?.headAnchor(m) ?? null) : null;
      setAnchor(bubbleAnchor(head, stageRef.current, bubbleRef.current, 48));
    },
  });
  const { phase, fb, metrics, count, waitingForPerson, elapsedMs, durationMs, stageApi } = session;
  const client = useClientQuestions({ meeting, live: phase === "live", elapsedMs, durationMs, pause: session.pause, resume: session.resume });
  /** Koniec: rozpracovaná odpoveď klientovi sa uloží. */
  const finishAll = async () => {
    if (client.active) await client.finishAnswer();
    void session.finish();
  };
  const recording = phase === "live";
  // živé titulky počúvajú mikrofón v miestnosti, pri nahratom videe by nesedeli
  const transcript = useLiveTranscript(recording && !file, LANGUAGE_INFO[language].bcp47);

  /** Nahraté video: prehrávanie a hodnotenie sa spustia naraz, priamo z kliknutia. */
  const startVideo = async () => {
    if (starting) return;
    setStarting(true);
    const audio = (await stageApi.current?.playSource(quiet)) ?? null;
    if (!audio) {
      setStarting(false);
      onError(tx.videoPlayFailed);
      return;
    }
    sourceAudio.current = audio;
    session.begin();
  };

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
    void finishAll();
  };

  const [ownPoints, setPoints] = useState<Point[]>(defaultPoints);
  const outlinePoints = useMemo<Point[] | null>(
    () => (outline?.points.length ? outline.points.map((title, i) => ({ id: `osnova-${i}`, title, keywords: keywordsOf(title) })) : null),
    [outline],
  );
  const points = outlinePoints ?? ownPoints;
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState("");
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage je dostupný až na klientovi */
    setPoints(readLocal(POINTS_KEY, defaultPoints));
    setNotes(readLocal(NOTES_KEY, ""));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [defaultPoints]);

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
  const chips = bodyChips(fb, metrics, locale);

  const status =
    phase === "live"
      ? file
        ? tx.analyzing
        : tx.recording
      : phase === "paused"
        ? tx.paused
        : phase === "countdown"
          ? tx.starting
          : phase === "armed"
            ? tx.ready
            : tx.preparing;

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
            {tx.back}
          </button>
          <button
            type="button"
            className="btn btn-p"
            onClick={() => void finishAll()}
            disabled={phase !== "live" && phase !== "paused"}
            style={{ minHeight: "44px", padding: "10px 18px", fontSize: "14px", opacity: phase === "live" || phase === "paused" ? 1 : 0.4 }}
          >
            {tx.finish}
          </button>
        </div>
      </header>

      <main id="obsah" className="flex flex-col gap-5 p-4 md:p-6 lg:grid lg:grid-cols-[18rem_1fr] xl:grid-cols-[20rem_1fr]">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="card" style={{ padding: "20px" }} aria-label={outlinePoints ? tx.outline : tx.points}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="h text-base">{outlinePoints ? tx.outline : tx.points}</h2>
              <span className="text-xs text-mute">
                {tx.covered(covered.size, points.length)}
              </span>
            </div>
            {outline?.topic ? (
              <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-line bg-black/20 px-3.5 py-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-mute">{tx.topic}</p>
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
                      <svg width="20" height="20" viewBox="0 0 22 22" aria-label={tx.coveredLabel} className="shrink-0">
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
                      <span className="block text-[11px] text-mute">{tx.keywords}: {p.keywords.join(", ")}</span>
                    </span>
                    {now ? <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-accent">{tx.rightNow}</span> : null}
                    {p.id.startsWith("own-") && !now ? (
                      <button
                        type="button"
                        onClick={() => savePoints(ownPoints.filter((x) => x.id !== p.id))}
                        className="shrink-0 rounded-full px-2 text-mute opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                        aria-label={tx.removePoint(p.title)}
                      >
                        ✕
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {outlinePoints ? (
              <p className="mt-4 text-xs text-faint">{tx.outlineHint}</p>
            ) : (
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                addPoint();
              }}
            >
              <label htmlFor="novy-bod" className="text-xs text-mute">
                {tx.addPoint}
              </label>
              <div className="mt-2 flex gap-2">
                <input
                  id="novy-bod"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={tx.addPlaceholder}
                  className="min-w-0 flex-1 rounded-full border border-line bg-transparent px-4 py-2 text-sm text-paper placeholder:text-faint focus:border-signal focus:outline-none"
                />
                <button type="submit" className="btn btn-p" style={{ minHeight: "40px", padding: "8px 18px", fontSize: "14px" }}>
                  {tx.add}
                </button>
              </div>
            </form>
            )}
          </section>

          <section className="card" style={{ padding: "20px" }}>
            <label htmlFor="poznamky" className="h text-base">
              {tx.notes}
            </label>
            <textarea
              id="poznamky"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                writeLocal(NOTES_KEY, e.target.value);
              }}
              rows={4}
              placeholder={tx.notesPlaceholder}
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
                  file={file}
                  onSourceEnded={() => void session.finish()}
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
                    aria-label={tx.shrink}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                      <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                    </svg>
                  </button>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="hidden sm:block">
                      <Pill>{phase === "loading" ? (file ? tx.loadingVideo : tx.startingCamera) : file ? `Video: ${file.name}` : tx.cameraOn}</Pill>
                    </span>
                    <button
                      type="button"
                      onClick={enterFull}
                      className="flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur hover:bg-black/80"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                      </svg>
                      {tx.fullscreen}
                    </button>
                  </span>
                )}
              </div>


              {client.overlay}

              {quiet && (phase === "live" || phase === "paused") ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-[#17142e]/95 px-6 text-center text-white">
                  <p className="h text-2xl">{tx.quietTitle}</p>
                  <div className="h-2 w-full max-w-md overflow-hidden rounded-full bg-white/15">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet to-signal transition-[width] duration-500"
                      style={{ width: `${durationMs ? Math.min(100, (elapsedMs / durationMs) * 100) : 0}%` }}
                    />
                  </div>
                  <p className="text-sm text-white/70">{tx.quietNote}</p>
                </div>
              ) : null}

              {!quiet && (phase === "live" || phase === "paused") ? (
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
                  <p className="animate-pulse text-lg text-white/70">{file ? tx.loadingVideoModel : tx.loadingCameraModel}</p>
                </div>
              ) : null}
              {phase === "armed" ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-black/55 px-6 text-center text-white">
                  <p className="max-w-md text-sm text-white/80">{tx.videoIntro}</p>
                  <button
                    type="button"
                    onClick={() => void startVideo()}
                    disabled={starting}
                    className="flex min-h-[64px] items-center gap-3 rounded-full bg-signal px-10 text-xl font-bold text-on-signal shadow-lg transition hover:brightness-105 disabled:opacity-60"
                  >
                    <span aria-hidden="true">▶</span> {starting ? tx.startingAnalysis : tx.startAnalysis}
                  </button>
                </div>
              ) : null}
                            {phase === "countdown" ? (
                <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/40 px-6 text-center text-white">
                  <p className={waitingForPerson ? "text-2xl font-bold" : "text-sm text-white/70"}>
                    {waitingForPerson ? tx.stepIn : tx.lookAtCamera}
                  </p>
                  {waitingForPerson ? <p className="mt-2 text-sm text-white/70">{tx.countdownWaits}</p> : null}
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
                    {count || tx.go}
                  </p>
                </div>
              ) : null}

              {!quiet && (phase === "live" || phase === "paused") ? (
                <div
                  className={`absolute inset-x-3 z-20 rounded-xl bg-black/75 px-4 py-3 text-sm text-white backdrop-blur ${full ? "bottom-24 mx-auto max-w-3xl" : "bottom-3"}`}
                  aria-live="off"
                >
                  {file ? (
                    <span className="text-white/70">{tx.noCaptionsVideo}</span>
                  ) : !transcript.supported ? (
                    <span className="text-white/60">{tx.noCaptions}</span>
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
                    <span className="text-white/60">{phase === "paused" ? tx.pausedHint : tx.speakHint}</span>
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
                    {tx.stop}
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
                {phase === "paused" ? tx.resume : tx.pause}
              </button>
              <button type="button" className="btn" onClick={onRestart} style={{ minHeight: "42px", padding: "8px 20px", fontSize: "14px" }}>
                {tx.again}
              </button>
            </div>
          </section>

          <section className="card" style={{ padding: "20px" }} aria-label={tx.bodyLive}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h text-base">{tx.bodyLive}</h2>
              <span className="text-[11px] text-mute">{tx.legend}</span>
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
                        {c.now ? <span className="text-accent">{tx.now}</span> : CHIP_SUB[locale][c.status]}
                      </span>
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-mute">{phase === "loading" ? tx.startingTracking : fb.ruleId === INITIAL_FB.ruleId ? tx.stepInShort : fb.tip}</p>
              )}
            </div>
            {chips.length && (fb.status === "warn" || fb.status === "bad") ? <p className="mt-3 text-sm text-mute">{fb.tip}</p> : null}
          </section>
        </div>
      </main>
    </div>
  );
}
