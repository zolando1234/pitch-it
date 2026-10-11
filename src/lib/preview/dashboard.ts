import { pitchSummary } from "@/lib/billing/summary";
import type { DashboardStartup, DashboardViewData } from "@/components/dashboard/dashboard-view";
import { buildNotifications } from "@/lib/dashboard/notifications";
import {
  buildActivity,
  buildProgressSeries,
  buildRecentReports,
  buildStatCards,
  buildTip,
  type DashboardExercise,
  type DashboardSession,
} from "@/lib/dashboard/overview";
import type { TrainingMode } from "@/lib/domain/labels";
import { PITCH_ELEMENTS, type Assessment } from "@/lib/reports/assessment";
import type { SessionMeasurements } from "@/lib/reports/measured";
import { PREVIEW_ASSESSMENT, PREVIEW_MEASURED, PREVIEW_RECOMMENDATION } from "@/lib/preview/fixtures";

/*
  UKÁŽKOVÉ DÁTA prehľadu (/ukazka/prehlad): vymyslený founder a startup z návrhu dashboardu.
  Dátumy sú relatívne k času vykreslenia, aby graf „Posledných 7 dní“ nikdy neostal prázdny.
  Všetky čísla sa počítajú rovnakými funkciami ako v aplikácii.
*/

const HOUR = 60 * 60 * 1000;

type Spec = {
  id: string;
  daysAgo: number;
  mode: TrainingMode;
  answered?: [number, number];
  covered?: number;
  minutes: number;
  wpm: number;
  fillers: number;
  answerSeconds: number;
  summary: string;
};

const SPECS: Spec[] = [
  { id: "d01", daysAgo: 0.9, mode: "coach", answered: [7, 9], minutes: 3, wpm: 145, fillers: 6, answerSeconds: 34, summary: "Dobrý pokrok! Zlepšil si štruktúru pitchu a znížil výplňové slová." },
  { id: "d02", daysAgo: 1.4, mode: "delivery", covered: 5, minutes: 3, wpm: 182, fillers: 5.2, answerSeconds: 170, summary: "Tempo reči bolo príliš rýchle. Skús spomaliť v úvode." },
  { id: "d03", daysAgo: 1.6, mode: "simulation", answered: [13, 18], minutes: 8, wpm: 151, fillers: 6.4, answerSeconds: 38, summary: "Investori sa pýtali viac na trh a konkurenciu. Priprav si silnejšie dáta." },
  { id: "d04", daysAgo: 2.2, mode: "simulation", answered: [14, 19], minutes: 9, wpm: 149, fillers: 6.6, answerSeconds: 39, summary: "Čísla o trhu zazneli presne, pri konkurencii chýbal konkrétny rozdiel." },
  { id: "d05", daysAgo: 2.9, mode: "coach", answered: [6, 9], minutes: 4, wpm: 134, fillers: 7, answerSeconds: 41, summary: "Odpovede boli vecné, no pri CAC chýbalo číslo a obdobie." },
  { id: "d06", daysAgo: 3.6, mode: "simulation", answered: [7, 10], minutes: 7, wpm: 158, fillers: 7.4, answerSeconds: 44, summary: "Pri tíme si odpovedal priamo, pri financiách si odbočil k produktu." },
  { id: "d07", daysAgo: 4.3, mode: "coach", answered: [5, 9], minutes: 4, wpm: 166, fillers: 8.1, answerSeconds: 48, summary: "Veľa odpovedí začínalo kontextom namiesto pointy." },
  { id: "d08", daysAgo: 4.9, mode: "simulation", answered: [5, 8], minutes: 6, wpm: 171, fillers: 8.4, answerSeconds: 52, summary: "Investor sa vracal k jednotkovej ekonomike, odpovede boli všeobecné." },
  { id: "d09", daysAgo: 5.5, mode: "coach", answered: [7, 12], minutes: 5, wpm: 174, fillers: 8.8, answerSeconds: 55, summary: "Prvý tréning s nápovedou: dobrý základ, dlhé odpovede." },
  { id: "d10", daysAgo: 6.1, mode: "simulation", answered: [8, 13], minutes: 7, wpm: 178, fillers: 9.1, answerSeconds: 57, summary: "Rýchle tempo a málo čísel pri trhu." },
  { id: "d11", daysAgo: 6.7, mode: "coach", answered: [5, 9], minutes: 4, wpm: 181, fillers: 9.6, answerSeconds: 60, summary: "Úvodný tréning: rozbor ukázal hlavné slabiny." },
];

const id = (suffix: string) => `00000000-0000-4000-8000-000000000${suffix.padStart(3, "0")}`;

function assessmentFor(spec: Spec): Assessment {
  const questions = spec.answered
    ? Array.from({ length: spec.answered[1] }, (_, index) => ({
        investor_turn_seq: index * 2,
        topic: "Otázka investora",
        answer_turn_seqs: [index * 2 + 1],
        verdict: index < spec.answered![0] ? ("answered" as const) : ("partially_answered" as const),
        note: "",
      }))
    : [];
  const coverage =
    spec.covered !== undefined
      ? PITCH_ELEMENTS.map((element, index) => ({ element, status: index < spec.covered! ? ("clear" as const) : ("brief" as const), note: "" }))
      : null;
  return { ...PREVIEW_ASSESSMENT, summary: spec.summary, questions, pitch_coverage: coverage };
}

function measuredFor(spec: Spec): SessionMeasurements {
  return {
    ...PREVIEW_MEASURED,
    durationSeconds: spec.minutes * 60,
    pace: { ...PREVIEW_MEASURED.pace, medianWpm: spec.wpm },
    fillers: { ...PREVIEW_MEASURED.fillers, per100Words: spec.fillers },
    answerLength: { ...PREVIEW_MEASURED.answerLength, medianSeconds: spec.answerSeconds },
    totals: { ...PREVIEW_MEASURED.totals, founderSpeechSeconds: spec.mode === "delivery" ? spec.answerSeconds : PREVIEW_MEASURED.totals.founderSpeechSeconds },
  };
}

export function previewDashboardSessions(now: Date): DashboardSession[] {
  return SPECS.map((spec) => {
    const created = new Date(now.getTime() - spec.daysAgo * 24 * HOUR);
    const ended = new Date(created.getTime() + spec.minutes * 60 * 1000);
    return {
      id: id(spec.id),
      mode: spec.mode,
      transport: "realtime",
      status: "completed",
      createdAt: created.toISOString(),
      endedAt: ended.toISOString(),
      billedSeconds: spec.minutes * 60,
      report: { status: "ready", completedAt: new Date(ended.getTime() + 60 * 1000).toISOString(), measured: measuredFor(spec), assessment: assessmentFor(spec) },
    };
  });
}

export const PREVIEW_STARTUP: DashboardStartup = {
  id: "00000000-0000-4000-8000-0000000000a1",
  name: "GreenLoop",
  oneLiner: "Udržateľné riešenia pre čistejšiu planétu.",
  stage: "pre_seed",
  traction: "12 pilotných zákazníkov",
  raiseAmount: 250_000,
  raiseCurrency: "EUR",
};

export const PREVIEW_ACCOUNT = { name: "Alex Novák", email: "alex@greenloop.example", initials: "AN", role: "Founder" };

export function previewDashboard(now: Date): Omit<DashboardViewData, "href" | "notice" | "checklist"> {
  const sessions = previewDashboardSessions(now);
  const exercises: DashboardExercise[] = [
    { id: "ex-1", title: "Konkurenčná výhoda", status: "completed", completedAt: new Date(now.getTime() - 1.2 * 24 * HOUR).toISOString() },
  ];
  const { subject, family, cards } = buildStatCards(sessions);
  const reports = buildRecentReports(sessions);
  return {
    trainingHref: "/app/trening/novy",
    stats: cards,
    startup: PREVIEW_STARTUP,
    activity: buildActivity(sessions, exercises),
    reports,
    progress: buildProgressSeries(sessions, family),
    tip: buildTip(subject, PREVIEW_RECOMMENDATION),
    latestReportHref: "/app/trening/preview",
    now: now.toISOString(),
  };
}

export function previewNotifications(now: Date) {
  const sessions = previewDashboardSessions(now).slice(0, 3);
  return buildNotifications(
    sessions.map((session) => ({ id: session.id, mode: session.mode, created_at: session.createdAt, feedback_reports: { status: "ready", completed_at: session.report?.completedAt ?? null } })),
    [{ id: "ex-1", title: "Konkurenčná výhoda", created_at: new Date(now.getTime() - 0.85 * 24 * HOUR).toISOString() }],
  );
}

export function previewPlanSummary() {
  return pitchSummary({ freeLeft: 1, credits: 0, canPitch: true });
}
