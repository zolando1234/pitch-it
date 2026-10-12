import Link from "next/link";
import type { SessionSummary } from "@/lib/coach/pose/session";
import { STATUS_COLOR, STATUS_TEXT } from "@/lib/coach/pose/renderer";
import type { Highlight } from "@/lib/coach/pose/metrics";
import { HIGHLIGHTS } from "@/lib/coach/pose/rules";
import { highlightCopy, ruleCopy } from "@/lib/coach/pose/copy";
import { useLocale } from "@/components/i18n/locale-provider";
import { ScoreRing, SideShare } from "./LivePanel";
import MistakeLog from "./MistakeLog";
import type { DrillProgress, SessionMode } from "@/lib/coach/modes";
import { computeFinalScore, type FinalScore } from "@/lib/coach/pose/scoring";
import type { Recording } from "./CameraStage";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** priebeh môže mať tisíce vzoriek, na zobrazenie stačí pár stoviek */
function downsample<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const step = arr.length / max;
  return Array.from({ length: max }, (_, i) => arr[Math.floor(i * step)]);
}

export const scoreColor = (v: number | null) =>
  v === null ? "#525252" : v >= 85 ? STATUS_COLOR.good : v >= 65 ? STATUS_COLOR.warn : STATUS_COLOR.bad;

/** Ako scoreColor, ale pre text (čísla a známka): tokeny témy namiesto žiarivých farieb. */
const scoreTextColor = (v: number | null) =>
  v === null ? STATUS_TEXT.idle : v >= 85 ? STATUS_TEXT.good : v >= 65 ? STATUS_TEXT.warn : STATUS_TEXT.bad;

const SUMMARY = {
  sk: {
    breakdown: "Rozpis skóre",
    ofScore: "% skóre",
    notScored: "V tomto cvičení sa nehodnotí",
    why: "Prečo nie 100?",
    cap: "Strop",
    flawless: "Nič. Bezchybný výkon.",
    length: "Dĺžka",
    zone: (p: number) => `ruky v power zóne ${p} % času`,
    gestures: (g: number) => `${g} gest za minútu (najlepší TED rečníci ~25)`,
    timeline: "Priebeh",
    clean: "bez chyby",
    couldBeBetter: "mohlo byť lepšie",
    problem: "problém",
    space: "Priestor a pohľad",
    stood: "Kde si stál",
    looked: "Kam si sa pozeral",
    ideal: "Ideál: využi všetky tri časti priestoru a pohľad striedaj medzi ľavou stranou, stredom a pravou stranou publika.",
    moments: "Skvelé momenty",
    workOn: "Na čom pracovať",
    noRepeats: "Žiadne opakujúce sa chyby. Výborne!",
    total: (n: number, t: string) => `${n}× · spolu ${t}`,
  },
  en: {
    breakdown: "Score breakdown",
    ofScore: "% of score",
    notScored: "Not scored in this exercise",
    why: "Why not 100?",
    cap: "Cap",
    flawless: "Nothing. A flawless performance.",
    length: "Length",
    zone: (p: number) => `hands in the power zone ${p} % of the time`,
    gestures: (g: number) => `${g} gestures per minute (top TED speakers ~25)`,
    timeline: "Timeline",
    clean: "mistake-free",
    couldBeBetter: "could be better",
    problem: "problem",
    space: "Space and gaze",
    stood: "Where you stood",
    looked: "Where you looked",
    ideal: "Ideal: use all three parts of the space and alternate your gaze between the left, centre and right of the audience.",
    moments: "Great moments",
    workOn: "What to work on",
    noRepeats: "No repeated mistakes. Excellent!",
    total: (n: number, t: string) => `${n}× · ${t} in total`,
  },
};

/** Rozpis skóre: kategórie, stropy a konkrétne stratené body. */
function ScoreBreakdown({ score }: { score: FinalScore }) {
  const tx = SUMMARY[useLocale()];
  const deductions = score.categories
    .flatMap((c) => c.deductions.map((d) => ({ ...d, category: c.title })))
    .sort((a, b) => b.points - a.points)
    .slice(0, 8);

  return (
    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl bg-panel p-5">
        <h2 className="mb-5 text-sm uppercase tracking-widest text-faint">{tx.breakdown}</h2>
        <ul className="flex flex-col gap-4">
          {score.categories.map((c) => (
            <li key={c.id}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-semibold">
                  {c.title} <span className="text-xs text-faint">· {Math.round(c.weight * 100)} {tx.ofScore}</span>
                </span>
                <span className="font-mono text-lg font-bold" style={{ color: scoreTextColor(c.score) }}>
                  {c.score ?? "—"}
                </span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-line">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${c.score ?? 0}%`, background: scoreColor(c.score) }}
                />
              </div>
              {c.score === null && <p className="mt-1 text-xs text-faint">{tx.notScored}</p>}
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-2xl bg-panel p-5">
        <h2 className="mb-5 text-sm uppercase tracking-widest text-faint">{tx.why}</h2>
        {score.caps.length > 0 && (
          <ul className="mb-4 flex flex-col gap-2">
            {score.caps.map((c) => (
              <li key={c.reason} className="rounded-xl border border-danger/50 bg-danger/10 px-4 py-3 text-sm">
                <b className="text-coral">{tx.cap} {c.limit}</b> · {c.reason}
              </li>
            ))}
          </ul>
        )}
        {deductions.length === 0 && score.caps.length === 0 ? (
          <p className="text-mute">{tx.flawless}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {deductions.map((d) => (
              <li key={d.category + d.reason} className="flex items-start justify-between gap-4 py-2.5">
                <div>
                  <p className="text-sm text-paper">{d.reason}</p>
                  <p className="text-xs text-faint">{d.category}</p>
                </div>
                <span className="shrink-0 font-mono font-bold text-coral">−{d.points}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Výsledok reči tela: známka, rozpis, priebeh, chyby a na čom pracovať. */
export function CoachReport({
  summary,
  final,
  videoUrl,
}: {
  summary: SessionSummary;
  final: FinalScore;
  videoUrl: string | null;
}) {
  const { statusShare: share } = summary;
  const top = summary.issues.slice(0, 3);
  const locale = useLocale();
  const tx = SUMMARY[locale];
  return (
    <>
      <div className="flex flex-col items-start gap-8 md:flex-row md:items-center">
        <ScoreRing score={final.total ?? 0} color={scoreColor(final.total)} size={180} />
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline gap-4">
            <span className="h text-6xl" style={{ color: scoreTextColor(final.total) }}>
              {final.grade}
            </span>
            <span className="text-2xl font-bold uppercase tracking-widest text-mute">{final.label}</span>
          </div>
          <p className="max-w-2xl text-xl font-semibold">{final.verdict}</p>
          <p className="text-mute">
            {tx.length} {fmt(summary.durationMs)} · {tx.zone(Math.round(summary.zoneShare * 100))}
            {summary.gesturesPerMin !== null && <> · {tx.gestures(summary.gesturesPerMin)}</>}
          </p>
        </div>
      </div>

      {final.total !== null && <ScoreBreakdown score={final} />}

      <section>
        <h2 className="mb-3 text-sm uppercase tracking-widest text-faint">{tx.timeline}</h2>
        <div className="flex h-10 w-full overflow-hidden rounded-lg bg-panel">
          {downsample(summary.timeline, 300).map((s, i) => (
            <div key={i} className="h-full flex-1" style={{ background: STATUS_COLOR[s.status] }} />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-sm text-mute">
          <span>
            <b className="text-accent">{Math.round(summary.cleanShare * 100)} %</b> {tx.clean}
          </span>
          <span>
            <b className="text-marker">{Math.round(share.warn * 100)} %</b> {tx.couldBeBetter}
          </span>
          <span>
            <b className="text-danger">{Math.round(share.bad * 100)} %</b> {tx.problem}
          </span>
        </div>
      </section>

      <MistakeLog mistakes={summary.mistakes} durationMs={summary.durationMs} videoUrl={videoUrl} />

      <section className="grid gap-6 md:grid-cols-2">
        <div className="rounded-2xl bg-panel p-5">
          <h2 className="mb-4 text-sm uppercase tracking-widest text-faint">{tx.space}</h2>
          <div className="flex flex-col gap-4">
            <SideShare label={tx.stood} share={summary.stageShare} />
            <SideShare label={tx.looked} share={summary.gazeShare} />
          </div>
          <p className="mt-4 text-sm text-mute">
            {tx.ideal}
          </p>
        </div>
        <div className="rounded-2xl bg-panel p-5">
          <h2 className="mb-4 text-sm uppercase tracking-widest text-faint">{tx.moments}</h2>
          <ul className="flex flex-col gap-3">
            {(Object.keys(HIGHLIGHTS) as Highlight[]).map((h) => (
              <li key={h} className="flex items-center justify-between">
                <span className="text-mute">{highlightCopy(h, locale).label}</span>
                <span className="text-2xl font-black text-accent">{summary.highlights[h] ?? 0}×</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-sm uppercase tracking-widest text-faint">{tx.workOn}</h2>
        {top.length === 0 ? (
          <p className="text-lg text-mute">{tx.noRepeats}</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {top.map((issue, i) => {
              const rule = ruleCopy(issue.id, locale);
              return (
                <li key={issue.id} className="flex gap-5 rounded-2xl bg-panel p-5">
                  <span className="h text-4xl text-violet-soft">{i + 1}</span>
                  <div>
                    <p className="text-xl font-bold">{rule.title}</p>
                    <p className="text-sm text-faint">
                      {tx.total(issue.count, fmt(issue.ms))}
                    </p>
                    <p className="mt-2 text-mute">{rule.tip}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </>
  );
}

export default function SessionSummaryView({
  summary,
  mode,
  drill,
  ruleFilter,
  recording,
  onRetry,
  onSetup,
  backHref,
}: {
  recording: Recording | null;
  summary: SessionSummary;
  mode: SessionMode;
  drill: DrillProgress | null;
  ruleFilter: (id: string) => boolean;
  onRetry: () => void;
  onSetup: () => void;
  backHref: string;
}) {
  const final = computeFinalScore(summary, ruleFilter);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-10">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">
          Vyhodnotenie · {mode.kind === "drill" ? `Cvičenie: ${mode.title}` : mode.title}
        </p>
        <h1 className="h mt-2 text-4xl md:text-6xl">Ako ti to išlo</h1>
      </div>

      {mode.kind === "drill" && drill && (
        <section
          className={`flex flex-col gap-4 rounded-3xl border-2 p-6 md:flex-row md:items-center md:gap-8 ${
            drill.passed ? "border-signal bg-signal/10" : "border-danger bg-danger/10"
          }`}
        >
          <span className={`text-6xl font-black ${drill.passed ? "text-accent" : "text-danger"}`}>{drill.passed ? "✓" : "✕"}</span>
          <div className="flex-1">
            <p className="text-3xl font-black">{drill.passed ? "Cvičenie splnené!" : "Ešte to nie je ono"}</p>
            <p className="mt-1 text-lg text-mute">{mode.goal}</p>
          </div>
          <div className="text-right">
            <p className="text-5xl font-black">{drill.text}</p>
            <p className="text-mute">cieľ {drill.targetText}</p>
          </div>
        </section>
      )}

      <CoachReport summary={summary} final={final} videoUrl={recording?.url ?? null} />

      <div className="flex flex-wrap gap-4">
        <button
          type="button"
          onClick={onRetry}
          className="rounded-full bg-signal px-8 py-4 text-lg font-bold text-on-signal transition hover:bg-signal-hover"
        >
          Skúsiť znova
        </button>
        <button type="button" onClick={onSetup} className="rounded-full border border-line-strong px-8 py-4 text-lg font-bold hover:bg-panel">
          Iné cvičenie
        </button>
        <Link href={backHref} className="rounded-full border border-line-strong px-8 py-4 text-lg font-bold hover:bg-panel">
          Späť na tréning
        </Link>
      </div>
    </div>
  );
}
