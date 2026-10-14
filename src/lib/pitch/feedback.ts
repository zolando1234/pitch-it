import { parseStoredCoach, type StoredCoach } from "@/lib/coach/stored";
import { BODY_EVENT_LABELS, BODY_EVENT_LABELS_EN, bodyNarrative, clock, type BodySummary } from "@/lib/pitch/body";
import { decimal, pausesLabel, TEMPO_ADVICE, TEMPO_ADVICE_EN, tempoPosition, tempoVerdict, type PitchMetrics, type TranscriptToken } from "@/lib/pitch/metrics";
import { LANGUAGE_INFO, parseLanguage } from "@/lib/pitch/language";
import { matchPct, parseOutlineResult, type OrderVerdict, type PointStatus } from "@/lib/pitch/outline";
import { parseQaResult, type QaResult } from "@/lib/pitch/qa";
import { parseSpeechAnalysis, stripSentenceRefs, type SentenceIssue, type SpeechAnalysis, type WasteKind } from "@/lib/pitch/speech-analysis";
import type { PitchAttemptRow } from "@/lib/db/types";

/*
  Dáta pre report prejavu, odvodené z uloženého pokusu. Poradie v reporte: osnova prezentácie
  (zbalená), 1 téma, 2 osnova, 3 zrozumiteľnosť, 4 reč (celkové skóre, čo si poslucháč odnesie,
  pokrytie osnovy, zbytočné časti), 5 tempo a pauzy, 6 prepis s označením, 7 obsahové skóre podľa
  osnovy, 8 reč tela, 9 Q&A. Čisté funkcie, testované. Staršie pokusy (investorská rubrika) sa
  zobrazia v rovnakej štruktúre.
*/

export type ScoreTone = "good" | "mid" | "low";
export type BodyTone = "good" | "warn" | "alert";
export type Severity = "ok" | "minor" | "major";

export type ScoreRow = { score: number; tone: ScoreTone; note: string | null };

export type MarkedToken = TranscriptToken & { stutter?: boolean };

export type TranscriptSentence = {
  tokens: MarkedToken[];
  /** null = veta bez rozboru (AI nebola dostupná) */
  severity: Severity | null;
  issue: string | null;
  note: string | null;
  /** poradové číslo problému (odkaz na zoznam pod prepisom) */
  marker: number | null;
};

export type FeedbackData = {
  attemptId: string;
  number: number;
  /** jazyk prejavu, napr. „Slovenčina“ */
  languageLabel: string;
  targetSeconds: number;
  /** typ tréningu */
  mode: "public" | "client";
  retryHref: string;
  /** téma a osnova pred nahrávaním (v reporte zbalené) */
  plan: { topic: string; points: string[] } | null;
  topic: (ScoreRow & { onTopicPct: number | null }) | null;
  outline: (ScoreRow & { pct: number | null; order: { label: string; tone: ScoreTone } | null }) | null;
  clarity: ScoreRow | null;
  speech: {
    overall: { score: number; tone: ScoreTone; summary: string } | null;
    takeaway: string | null;
    points: Array<{ text: string; status: PointStatus; note: string | null }>;
    waste: Array<{ quote: string; label: string; note: string }>;
    advice: string | null;
    /** porovnanie len podľa kľúčových slov (bez AI) */
    byKeywords: boolean;
  } | null;
  tempo: { value: number; position: number; advice: string } | null;
  pauses: { count: number; label: string };
  fillers: { per60s: number; chips: Array<{ phrase: string; count: number }> };
  transcript: TranscriptSentence[];
  /** v prepise sú označené vety (inak sa zobrazí len vyznačenie výplní a zakoktaní) */
  transcriptReviewed: boolean;
  /** obsahové skóre podľa bodov osnovy, ktoré si človek zadal; null = osnova nebola zadaná */
  content: { score: number; tone: ScoreTone; rows: Array<{ label: string; score: number; tone: ScoreTone; note: string }> } | null;
  body: {
    eyeContactPct: number;
    narrative: string;
    events: Array<{ at: string; label: string; tone: BodyTone }>;
    /** Pás udalostí: dĺžky úsekov (flex) a ich typ. */
    strip: Array<{ flex: number; tone: BodyTone | null }>;
  } | null;
  /** Živý tréner reči tela z nahrávania s kamerou. */
  coach: StoredCoach | null;
  /** Otázky po prejave a hodnotenie odpovedí. */
  qa: QaResult | null;
  shared: boolean;
  shareDefaults: { name: string; team: string; email: string };
};

export function scoreTone(score: number): ScoreTone {
  if (score >= 7) return "good";
  if (score >= 5) return "mid";
  return "low";
}

const pctTone = (pct: number): ScoreTone => (pct >= 70 ? "good" : pct >= 45 ? "mid" : "low");

const ORDER_LABELS: Record<"sk" | "en", Record<OrderVerdict, { label: string; tone: ScoreTone }>> = {
  sk: {
    kept: { label: "Poradie bodov si dodržal", tone: "good" },
    minor: { label: "Drobné odbočky od poradia", tone: "mid" },
    jumped: { label: "Preskakoval si medzi bodmi", tone: "low" },
  },
  en: {
    kept: { label: "You kept the order of the points", tone: "good" },
    minor: { label: "Small detours from the order", tone: "mid" },
    jumped: { label: "You jumped between points", tone: "low" },
  },
};

const ISSUE_LABELS: Record<"sk" | "en", Record<SentenceIssue, string>> = {
  sk: { unclear: "Nezrozumiteľné", convoluted: "Zamotaná veta", stutter: "Zakoktanie", grammar: "Gramatika", offtopic: "Mimo témy", vague: "Všeobecné, bez obsahu" },
  en: { unclear: "Unclear", convoluted: "Convoluted sentence", stutter: "Stutter", grammar: "Grammar", offtopic: "Off topic", vague: "Vague, no substance" },
};

const WASTE_LABELS: Record<"sk" | "en", Record<WasteKind, string>> = {
  sk: { offtopic: "Mimo témy", unnecessary: "Zbytočné", overexplain: "Príliš dlhé vysvetľovanie" },
  en: { offtopic: "Off topic", unnecessary: "Unnecessary", overexplain: "Over-explaining" },
};


const normalizeWord = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");

/**
 * Zakoktanie v prepise: to isté slovo dvakrát za sebou („je je“) alebo nedokončený začiatok
 * slova so spojovníkom pred celým slovom („prez- prezentácia“).
 */
export function markStutters(tokens: TranscriptToken[]): MarkedToken[] {
  const out: MarkedToken[] = tokens.map((t) => ({ ...t }));
  const words = out.map((t, i) => ({ t, i })).filter((x) => x.t.type === "word");
  for (let k = 0; k + 1 < words.length; k++) {
    const a = words[k].t as Extract<MarkedToken, { type: "word" }>;
    const b = words[k + 1].t as Extract<MarkedToken, { type: "word" }>;
    const na = normalizeWord(a.text);
    const nb = normalizeWord(b.text);
    if (!na || !nb) continue;
    const repeated = na === nb && !/[.!?…,]$/.test(a.text);
    // len so spojovníkom: „pre prezentáciu“ je predložka, nie zakoktanie
    const fragment = /[-–—]$/.test(a.text) && na.length < nb.length && nb.startsWith(na);
    if (repeated || fragment) a.stutter = true;
  }
  return out;
}

const SENTENCE_END = /[.!?…]["“”»)]*$/;

/** Rozdelí slová prepisu na vety (rovnako ako `splitSentences` pri rozbore). */
export function groupSentences(tokens: MarkedToken[]): MarkedToken[][] {
  const out: MarkedToken[][] = [];
  let current: MarkedToken[] = [];
  for (const token of tokens) {
    current.push(token);
    if (token.type === "word" && SENTENCE_END.test(token.text)) {
      out.push(current);
      current = [];
    }
  }
  if (current.length) out.push(current);
  return out;
}

/**
 * Rozdelí slová prepisu na vety podľa viet, ktoré dostala AI (počty slov). Keď sa počet slov
 * líši (prepis z úsekov, iné delenie slov), hranice sa rozložia pomerne, aby sedeli aspoň približne.
 */
export function alignSentences(tokens: MarkedToken[], sentences: string[]): MarkedToken[][] {
  const counts = sentences.map((s) => (s.match(/\S+/g) ?? []).length);
  const total = counts.reduce((a, b) => a + b, 0);
  const words = tokens.filter((t) => t.type === "word").length;
  if (!total || !words) return groupSentences(tokens);
  let cum = 0;
  const bounds = counts.map((c) => {
    cum += c;
    return Math.round((cum * words) / total);
  });
  const out: MarkedToken[][] = sentences.map(() => []);
  let seen = 0;
  let current = 0;
  for (const token of tokens) {
    while (current < bounds.length - 1 && seen >= bounds[current]) current++;
    out[current].push(token);
    if (token.type === "word") seen++;
  }
  // prázdne skupiny ostávajú, aby index vety sedel s rozborom AI
  return out;
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

/** Texty rozboru bez odkazov na čísla viet. */
function cleanAnalysis(a: SpeechAnalysis): SpeechAnalysis {
  const c = stripSentenceRefs;
  return {
    ...a,
    topic: { ...a.topic, note: c(a.topic.note) },
    outline: { ...a.outline, note: c(a.outline.note) },
    clarity: { ...a.clarity, note: c(a.clarity.note) },
    overall: { ...a.overall, summary: c(a.overall.summary) },
    takeaway: c(a.takeaway),
    points: a.points.map((p) => ({ ...p, note: c(p.note) })),
    waste: a.waste.map((w) => ({ ...w, note: c(w.note) })),
    sentences: a.sentences.map((s) => ({ ...s, note: c(s.note) })),
    advice: c(a.advice),
  };
}

export function buildFeedback(
  attempt: PitchAttemptRow,
  extra: { number: number; retryHref: string; shareDefaults?: FeedbackData["shareDefaults"]; locale?: "sk" | "en" },
): FeedbackData {
  const locale = extra.locale ?? "sk";
  const en = locale === "en";
  const metrics = attempt.metrics as PitchMetrics | null;
  const body = attempt.body as BodySummary | null;
  const longest = metrics?.longestPauseMs;
  const pauseCount = metrics?.pauses.length ?? 0;
  const events = body ? notableEvents(body) : [];
  const stored = parseSpeechAnalysis(attempt.content);
  const analysis = stored ? cleanAnalysis(stored.analysis) : null;
  const outlineResult = parseOutlineResult(attempt.outline);
  const check = outlineResult?.check ?? null;
  const pct = outlineResult ? matchPct(outlineResult) : null;
  const hasPoints = !!outlineResult?.points.length;

  // 1–3: téma, osnova, zrozumiteľnosť (nový rozbor, inak staršie porovnanie s osnovou)
  const onTopicPct = analysis?.onTopicPct ?? check?.onTopicPct ?? null;
  const topic: FeedbackData["topic"] = analysis
    ? { score: analysis.topic.score, tone: scoreTone(analysis.topic.score), note: analysis.topic.note || null, onTopicPct }
    : onTopicPct !== null
      ? { score: Math.round(onTopicPct / 10), tone: pctTone(onTopicPct), note: null, onTopicPct }
      : null;
  const order = analysis?.outline.order ?? check?.order ?? null;
  const outline: FeedbackData["outline"] = analysis
    ? { score: analysis.outline.score, tone: scoreTone(analysis.outline.score), note: analysis.outline.note || null, pct: hasPoints ? pct : null, order: order ? ORDER_LABELS[locale][order] : null }
    : hasPoints && pct !== null
      ? { score: Math.round(pct / 10), tone: pctTone(pct), note: check?.advice ?? null, pct, order: order ? ORDER_LABELS[locale][order] : null }
      : null;
  const clarityScore = analysis?.clarity.score ?? check?.clarity ?? null;
  const clarity: FeedbackData["clarity"] = clarityScore !== null ? { score: clarityScore, tone: scoreTone(clarityScore), note: analysis?.clarity.note || null } : null;

  // 4: reč
  const points = analysis
    ? hasPoints && !stored?.derivedPoints
      ? analysis.points.filter((p) => p.index < outlineResult!.points.length).map((p) => ({ text: outlineResult!.points[p.index], status: p.status, note: p.note || null }))
      : []
    : (check?.points.map((p) => ({ text: p.text, status: p.status, note: p.note })) ?? []);
  const speech: FeedbackData["speech"] =
    analysis || check
      ? {
          overall: analysis ? { score: analysis.overall.score, tone: scoreTone(analysis.overall.score), summary: analysis.overall.summary } : null,
          takeaway: analysis?.takeaway ?? check?.takeaway ?? null,
          points,
          waste: analysis
            ? analysis.waste.map((w) => ({ quote: w.quote, label: WASTE_LABELS[locale][w.kind], note: w.note }))
            : (check?.digressions ?? []).map((d) => ({ quote: "", label: WASTE_LABELS[locale].offtopic, note: d })),
          advice: analysis?.advice ?? check?.advice ?? null,
          byKeywords: !analysis && check?.source === "keywords",
        }
      : null;

  // 6: prepis po vetách s označením
  const marked = markStutters(metrics?.tokens ?? []);
  const sentences = stored?.sentences?.length ? alignSentences(marked, stored.sentences) : groupSentences(marked);
  let marker = 0;
  const transcript: TranscriptSentence[] = sentences.map((tokens, index) => {
    // jedna veta môže mať viac problémov: spoja sa, platí horšia závažnosť
    const flags = analysis?.sentences.filter((s) => s.index === index) ?? [];
    const issues = [...new Set(flags.map((f) => ISSUE_LABELS[locale][f.issue]))];
    const notes = [...new Set(flags.map((f) => f.note).filter(Boolean))];
    return {
      tokens,
      severity: analysis ? (flags.length ? (flags.some((f) => f.severity === "major") ? "major" : "minor") : "ok") : null,
      issue: issues.length ? issues.join(", ") : null,
      note: notes.length ? notes.join(" ") : null,
      marker: flags.length ? ++marker : null,
    };
  });

  // 7: obsahové skóre iba z bodov osnovy, ktoré si človek zadal
  const userPoints = analysis && hasPoints && !stored?.derivedPoints ? analysis.points.filter((p) => p.index < outlineResult!.points.length) : [];
  const contentScore = userPoints.length ? Math.round((userPoints.reduce((sum, p) => sum + p.score, 0) / userPoints.length) * 10) / 10 : null;
  const content: FeedbackData["content"] =
    contentScore !== null
      ? {
          score: contentScore,
          tone: scoreTone(contentScore),
          rows: userPoints.map((p) => ({ label: outlineResult!.points[p.index], score: p.score, tone: scoreTone(p.score), note: p.note })),
        }
      : null;

  return {
    attemptId: attempt.id,
    number: extra.number,
    languageLabel: en ? LANGUAGE_INFO[parseLanguage(attempt.language)].english : LANGUAGE_INFO[parseLanguage(attempt.language)].label,
    targetSeconds: attempt.target_seconds,
    mode: attempt.mode === "client" ? "client" : "public",
    retryHref: extra.retryHref,
    plan: outlineResult && (outlineResult.topic || outlineResult.points.length) ? { topic: outlineResult.topic, points: outlineResult.points } : null,
    topic,
    outline,
    clarity,
    speech,
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
    transcript,
    transcriptReviewed: !!analysis,
    content,
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
    qa: parseQaResult(attempt.qa),
    shared: attempt.shared_at !== null,
    shareDefaults: extra.shareDefaults ?? { name: "", team: "", email: "" },
  };
}
