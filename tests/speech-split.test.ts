import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildSpeechPrompt,
  combineAnalysis,
  MAX_FLAGGED_SENTENCES,
  maxFlaggedFor,
  OVERVIEW_SYSTEM,
  SENTENCES_SYSTEM,
  sentenceFlagsSchema,
  speechAnalysisSchema,
  speechOverviewSchema,
} from "../src/lib/pitch/speech-analysis.ts";

const base = {
  sentences: ["Ahoj, volám sa Jana.", "Robíme appku na tréning prejavov."],
  audience: "investori",
  targetSeconds: 180,
  durationMs: 150_000,
  language: "Slovak",
  feedbackLocale: "sk" as const,
  outline: { topic: "Naša appka", points: ["Problém", "Riešenie"] },
  context: "Firma Acme.",
};

const scored = { score: 7, note: "Dobre." };
const overview = {
  topic: scored,
  outline: { ...scored, order: "kept" as const },
  clarity: scored,
  overall: { score: 7, summary: "Fajn prejav." },
  takeaway: "Appka na tréning.",
  onTopicPct: 90,
  points: [{ index: 0, title: "Problém", status: "covered" as const, score: 8, note: "Jasné." }],
  waste: [],
  advice: "Hovor pomalšie.",
};

test("počet označených viet rastie s dĺžkou prejavu, no má strop", () => {
  assert.equal(maxFlaggedFor(30_000), 5);
  assert.equal(maxFlaggedFor(5 * 60_000), 14);
  assert.equal(maxFlaggedFor(60 * 60_000), MAX_FLAGGED_SENTENCES);
  assert.ok(maxFlaggedFor(1_000) >= 4);
});

test("dve schémy dokopy dávajú pôvodný rozbor", () => {
  assert.ok(speechOverviewSchema.safeParse(overview).success);
  assert.equal("sentences" in speechOverviewSchema.shape, false);
  const flags = sentenceFlagsSchema.parse({ sentences: [{ index: 1, severity: "major", issue: "convoluted", note: "Zamotané." }] });
  const merged = combineAnalysis(speechOverviewSchema.parse(overview), flags);
  assert.ok(speechAnalysisSchema.safeParse(merged).success);
  assert.equal(merged.sentences.length, 1);
  // keď označenie viet zlyhá, rozbor ostáva bez podčiarknutí
  assert.deepEqual(combineAnalysis(speechOverviewSchema.parse(overview), null).sentences, []);
});

test("prompt prehľadu obsahuje osnovu a podklady, prompt viet očíslovaný prepis a limit", () => {
  const o = buildSpeechPrompt({ ...base, part: "overview" });
  assert.match(o, /Osnova \(index: bod\)/);
  assert.match(o, /Firma Acme/);
  assert.doesNotMatch(o, /\[0\]/);
  const s = buildSpeechPrompt({ ...base, part: "sentences" });
  assert.match(s, /\[0\] Ahoj/);
  assert.match(s, /\[1\] Robíme/);
  assert.match(s, new RegExp(`najviac ${maxFlaggedFor(150_000)} viet`));
  assert.doesNotMatch(s, /Osnova \(index/);
  assert.doesNotMatch(s, /Firma Acme/);
});

test("systémové texty sú rozdelené podľa úlohy", () => {
  assert.match(OVERVIEW_SYSTEM, /takeaway/);
  assert.doesNotMatch(OVERVIEW_SYSTEM, /sentences/);
  assert.match(SENTENCES_SYSTEM, /convoluted/);
  assert.doesNotMatch(SENTENCES_SYSTEM, /takeaway/);
});
