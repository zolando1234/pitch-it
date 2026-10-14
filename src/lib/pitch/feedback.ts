import { audienceLabel } from "@/lib/onboarding/plan";
import { parseStoredCoach, type StoredCoach } from "@/lib/coach/stored";
import { PREVIEW_COACH } from "@/lib/preview/coach";
import { BODY_EVENT_LABELS, BODY_EVENT_LABELS_EN, bodyNarrative, clock, type BodySummary } from "@/lib/pitch/body";
import { CATEGORY_LABELS, orderedCategories, type ContentScore } from "@/lib/pitch/content";
import { decimal, pausesLabel, TEMPO_ADVICE, TEMPO_ADVICE_EN, tempoPosition, tempoVerdict, type PitchMetrics, type TranscriptToken } from "@/lib/pitch/metrics";
import { LANGUAGE_INFO, parseLanguage } from "@/lib/pitch/language";
import { matchPct, parseOutlineResult, type OrderVerdict, type PointStatus } from "@/lib/pitch/outline";
import type { PitchAttemptRow } from "@/lib/db/types";
import { parseQaResult, type QaResult } from "@/lib/pitch/qa";

/*
  Dáta pre obrazovku Feedback (dizajn „3 · Feedback“), odvodené z uloženého pokusu.
  Čisté funkcie, aby sa dali otestovať a použiť aj v ukážke.
*/

export type FeedbackSection = "tempo" | "fillery" | "obsah";
export type ScoreTone = "good" | "mid" | "low";
export type BodyTone = "good" | "warn" | "alert";

export type FeedbackData = {
  attemptId: string;
  number: number;
  audienceLabel: string;
  /** jazyk pitchu, napr. „Slovenčina“ */
  languageLabel: string;
  audience: "investor" | "jury" | "customer" | "team";
  targetSeconds: number;
  focus: FeedbackSection;
  retryHref: string;
  tempo: { value: number; position: number; advice: string } | null;
  pauses: { count: number; label: string };
  fillers: { per60s: number; chips: Array<{ phrase: string; count: number }> };
  tokens: TranscriptToken[];
  content: Array<{ label: string; score: number; tone: ScoreTone; advice: string }> | null;
  body: {
    eyeContactPct: number;
    narrative: string;
    events: Array<{ at: string; label: string; tone: BodyTone }>;
    /** Pás udalostí: dĺžky úsekov (flex) a ich typ. */
    strip: Array<{ flex: number; tone: BodyTone | null }>;
  } | null;
  /** Živý tréner reči tela z nahrávania s kamerou. */
  coach: StoredCoach | null;
  /** Zhoda s témou a osnovou uloženou pred nahrávaním. */
  outline: OutlineFeedback | null;
  /** Otázky po prejave a hodnotenie odpovedí. */
  qa: QaResult | null;
  shared: boolean;
  shareDefaults: { name: string; team: string; email: string };
};

export type OutlineFeedback = {
  topic: string;
  /** null = v nahrávke nebol prepis reči, osnova sa nedala porovnať */
  match: {
    pct: number | null;
    tone: ScoreTone;
    byKeywords: boolean;
    onTopicPct: number | null;
    order: { verdict: OrderVerdict; label: string; tone: ScoreTone } | null;
    clarity: { score: number; tone: ScoreTone } | null;
    takeaway: string | null;
    advice: string | null;
    digressions: string[];
    points: Array<{ text: string; status: PointStatus; clarity: number | null; note: string | null }>;
  } | null;
  points: string[];
};

const ORDER_LABELS: Record<OrderVerdict, { label: string; tone: ScoreTone }> = {
  kept: { label: "Poradie bodov si dodržal", tone: "good" },
  minor: { label: "Drobné odbočky od poradia", tone: "mid" },
  jumped: { label: "Preskakoval si medzi bodmi", tone: "low" },
};

const ORDER_LABELS_EN: Record<OrderVerdict, string> = {
  kept: "You kept the order of the points",
  minor: "Small detours from the order",
  jumped: "You jumped between points",
};

const CATEGORY_LABELS_EN: Record<keyof typeof CATEGORY_LABELS, string> = {
  problem: "Problem",
  solution: "Solution",
  market: "Market",
  traction: "Traction",
  ask: "Ask",
};

export const SECTION_LABELS_EN: Record<FeedbackSection, string> = { tempo: "Pace", fillery: "Filler words", obsah: "Content" };

const pctTone = (pct: number): ScoreTone => (pct >= 70 ? "good" : pct >= 45 ? "mid" : "low");

export function outlineFeedback(value: unknown, locale: "sk" | "en" = "sk"): OutlineFeedback | null {
  const result = parseOutlineResult(value);
  if (!result) return null;
  const check = result.check;
  const pct = matchPct(result);
  return {
    topic: result.topic,
    points: result.points,
    match: check
      ? {
          pct,
          tone: pctTone(pct ?? 0),
          byKeywords: check.source === "keywords",
          onTopicPct: check.onTopicPct,
          order: check.order
            ? { verdict: check.order, ...ORDER_LABELS[check.order], ...(locale === "en" ? { label: ORDER_LABELS_EN[check.order] } : {}) }
            : null,
          clarity: check.clarity !== null ? { score: check.clarity, tone: scoreTone(check.clarity) } : null,
          takeaway: check.takeaway,
          advice: check.advice,
          digressions: check.digressions,
          points: check.points,
        }
      : null,
  };
}

export const SECTION_LABELS: Record<FeedbackSection, string> = { tempo: "Tempo", fillery: "Vypĺňacie slová", obsah: "Obsah" };

/** Poradie sekcií podľa odpovede z onboardingu: vybraná ide prvá. */
export function sectionOrder(first: FeedbackSection): Record<FeedbackSection, number> {
  const ord = [first, ...(["tempo", "fillery", "obsah"] as const).filter((x) => x !== first)];
  return { tempo: ord.indexOf("tempo"), fillery: ord.indexOf("fillery"), obsah: ord.indexOf("obsah") };
}

export function scoreTone(score: number): ScoreTone {
  if (score >= 7) return "good";
  if (score >= 5) return "mid";
  return "low";
}

const BODY_TONES: Record<keyof typeof BODY_EVENT_LABELS, BodyTone> = {
  restless_hands: "warn",
  looking_away: "alert",
  steady_eye_contact: "good",
  calm_hands: "good",
};

/** Najviac `limit` udalostí, opakovania tej istej udalosti za sebou zlúčené. */
function notableEvents(body: BodySummary, limit = 4) {
  const out: BodySummary["events"] = [];
  for (const event of body.events) {
    if (out.length && out[out.length - 1].kind === event.kind) continue;
    out.push(event);
  }
  const warn = out.filter((e) => BODY_EVENT_LABELS[e.kind].tone === "warn");
  const good = out.filter((e) => BODY_EVENT_LABELS[e.kind].tone === "good");
  return [...warn.slice(0, limit - Math.min(1, good.length)), ...good].slice(0, limit).sort((a, b) => a.t - b.t);
}

function bodyStrip(events: BodySummary["events"], durationMs: number) {
  const total = Math.max(durationMs, (events.at(-1)?.t ?? 0) + 3_000);
  const strip: Array<{ flex: number; tone: BodyTone | null }> = [];
  let cursor = 0;
  for (const event of events) {
    const gap = Math.max(0, event.t - cursor);
    if (gap > 0) strip.push({ flex: gap / total, tone: null });
    strip.push({ flex: 3_000 / total, tone: BODY_TONES[event.kind] });
    cursor = event.t + 3_000;
  }
  if (cursor < total) strip.push({ flex: (total - cursor) / total, tone: null });
  return strip.map((s) => ({ ...s, flex: Math.round(s.flex * 1000) / 100 }));
}

export function buildFeedback(
  attempt: PitchAttemptRow,
  extra: { number: number; retryHref: string; shareDefaults?: FeedbackData["shareDefaults"]; locale?: "sk" | "en" },
): FeedbackData {
  const locale = extra.locale ?? "sk";
  const en = locale === "en";
  const metrics = attempt.metrics as PitchMetrics | null;
  const content = attempt.content as ContentScore | null;
  const body = attempt.body as BodySummary | null;
  const longest = metrics?.longestPauseMs;
  const pauseCount = metrics?.pauses.length ?? 0;
  const events = body ? notableEvents(body) : [];

  return {
    attemptId: attempt.id,
    number: extra.number,
    audience: attempt.audience,
    audienceLabel: audienceLabel(attempt.audience, locale),
    languageLabel: en ? LANGUAGE_INFO[parseLanguage(attempt.language)].english : LANGUAGE_INFO[parseLanguage(attempt.language)].label,
    targetSeconds: attempt.target_seconds,
    focus: attempt.focus,
    retryHref: extra.retryHref,
    tempo:
      metrics?.tempo != null
        ? { value: metrics.tempo, position: tempoPosition(metrics.tempo), advice: (en ? TEMPO_ADVICE_EN : TEMPO_ADVICE)[tempoVerdict(metrics.tempo)] }
        : null,
    pauses: {
      count: pauseCount,
      label: en
        ? `${pauseCount === 1 ? "pause" : "pauses"} over 1 second${longest ? `, longest ${(longest / 1000).toFixed(1)} s` : ""}`
        : `${pausesLabel(pauseCount)}${longest ? `, najdlhšia ${decimal(longest / 1000)} s` : ""}`,
    },
    fillers: {
      per60s: Math.round(metrics?.fillersPer60s ?? 0),
      chips: Object.entries(metrics?.fillers.byPhrase ?? {})
        .filter(([, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([phrase, count]) => ({ phrase, count })),
    },
    tokens: metrics?.tokens ?? [],
    content: content
      ? orderedCategories(content).map((c) => ({ label: (en ? CATEGORY_LABELS_EN : CATEGORY_LABELS)[c.key], score: c.score, tone: scoreTone(c.score), advice: c.advice }))
      : null,
    body:
      body && body.frames > 0 && body.eyeContactPct !== null
        ? {
            eyeContactPct: body.eyeContactPct,
            narrative: bodyNarrative(body, locale),
            events: events.map((e) => ({ at: clock(e.t), label: en ? BODY_EVENT_LABELS_EN[e.kind] : BODY_EVENT_LABELS[e.kind].label, tone: BODY_TONES[e.kind] })),
            strip: bodyStrip(events, attempt.duration_ms ?? 0),
          }
        : null,
    coach: parseStoredCoach(body?.coach ?? null),
    outline: outlineFeedback(attempt.outline, locale),
    qa: parseQaResult(attempt.qa),
    shared: attempt.shared_at !== null,
    shareDefaults: extra.shareDefaults ?? { name: "", team: "", email: "" },
  };
}

/** Ukážkové dáta z dizajnu pre /ukazka (bez prihlásenia a kľúčov). */
export const FEEDBACK_FIXTURE: FeedbackData = {
  attemptId: "ukazka",
  number: 1,
  audience: "investor",
  audienceLabel: "Investorovi",
  languageLabel: "Slovenčina",
  targetSeconds: 60,
  focus: "tempo",
  retryHref: "/ukazka/nahravka/kamera",
  tempo: { value: 4.6, position: 55, advice: TEMPO_ADVICE.target },
  pauses: { count: 5, label: "pauzy nad 1 sekundu, najdlhšia 2,4 s" },
  fillers: { per60s: 6, chips: [{ phrase: "akože", count: 3 }, { phrase: "vlastne", count: 2 }, { phrase: "ehm", count: 1 }] },
  tokens: [
    ...words("Každý rok [X] zakladateľov pripravuje pitch bez spätnej väzby"),
    { type: "pause", ms: 2400, kind: "emphasis" },
    { type: "word", text: "akože", filler: true },
    ...words("sa spoliehajú na šťastie. Naša appka"),
    { type: "pause", ms: 1300, kind: "hesitation" },
    { type: "word", text: "vlastne", filler: true },
    ...words("počúva tvoj pitch a za pätnásť sekúnd ti povie, kde strácaš pozornosť."),
    { type: "word", text: "Ehm,", filler: true },
    ...words("trh, na ktorý ideme, má v Európe hodnotu [X] miliárd"),
    { type: "pause", ms: 1100, kind: "hesitation" },
    ...words("a"),
    { type: "word", text: "akože", filler: true },
    ...words("rastie každým rokom."),
  ],
  content: [
    { label: "Problém", score: 8, tone: "good", advice: "Problém je jasný a konkrétny. Pridaj jedno číslo, ktoré ukáže, aký je veľký." },
    { label: "Riešenie", score: 7, tone: "good", advice: "Je zrozumiteľné, čo produkt robí. Povedz, prečo je lepší ako súčasný spôsob." },
    { label: "Trh", score: 5, tone: "mid", advice: "Veľkosť trhu je spomenutá len okrajovo. Uveď zdroj a konkrétny segment, ktorý oslovíš ako prvý." },
    { label: "Traction", score: 4, tone: "low", advice: "Chýbajú konkrétne výsledky. Povedz počet používateľov, tržby alebo prvé pilotné testy." },
    { label: "Ask", score: 6, tone: "mid", advice: "Žiadosť zaznela, ale chýba suma a na čo ju použiješ. Zakonči jednou jasnou vetou." },
  ],
  body: {
    eyeContactPct: 82,
    narrative: "Držanie tela je otvorené a pokojné. Najčastejšie sa objavili otvorené dlane, raz si ukázal prstom na kameru.",
    events: [
      { at: "0:42", label: "Ukazovanie na kameru", tone: "alert" },
      { at: "1:12", label: "Otvorené dlane", tone: "good" },
      { at: "1:31", label: "Nepokojné ruky", tone: "warn" },
    ],
    strip: [
      { flex: 3, tone: null },
      { flex: 1, tone: "alert" },
      { flex: 4, tone: null },
      { flex: 1, tone: "good" },
      { flex: 3, tone: null },
      { flex: 1, tone: "warn" },
      { flex: 2, tone: null },
    ],
  },
  coach: PREVIEW_COACH,
  outline: {
    topic: "AI tréner, ktorý founderov pripraví na stretnutie s investorom",
    points: ["Problém: founderi pitchujú bez spätnej väzby", "Riešenie: nahráš pitch a AI povie, čo zlepšiť", "Veľkosť trhu", "Výsledky z pilotu", "Čo od investora chceme"],
    match: {
      pct: 60,
      tone: "mid",
      byKeywords: false,
      onTopicPct: 85,
      order: { verdict: "minor", ...ORDER_LABELS.minor },
      clarity: { score: 7, tone: "good" },
      takeaway: "Poslucháč pochopí, že appka dáva founderom rýchlu spätnú väzbu na pitch. Nevie však, či to už niekto používa a koľko peňazí chcete.",
      advice: "Po trhu povedz jednou vetou výsledok pilotu a zakonči konkrétnou sumou, ktorú hľadáš.",
      digressions: ["Krátka odbočka o tom, ako vznikol tím na hackathone"],
      points: [
        { text: "Problém: founderi pitchujú bez spätnej väzby", status: "covered", clarity: 8, note: "Jasne a konkrétne, s príkladom zo Startup Weekendu." },
        { text: "Riešenie: nahráš pitch a AI povie, čo zlepšiť", status: "covered", clarity: 8, note: "Je zrozumiteľné, čo produkt robí a za aký čas." },
        { text: "Veľkosť trhu", status: "partial", clarity: 4, note: "Spomenul si Európu, ale bez čísla a segmentu." },
        { text: "Výsledky z pilotu", status: "missing", clarity: 0, note: "Pilot v pitchi nezaznel." },
        { text: "Čo od investora chceme", status: "partial", clarity: 5, note: "Zaznelo, že hľadáš investora, chýba suma a na čo ju použiješ." },
      ],
    },
  },
  qa: null,
  shared: false,
  shareDefaults: { name: "", team: "", email: "" },
};

function words(text: string): TranscriptToken[] {
  return text.split(" ").map((w) => ({ type: "word" as const, text: w, filler: false }));
}
