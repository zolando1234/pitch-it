import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { PitchAttemptRow } from "../src/lib/db/types.ts";
import { buildFeedback, groupSentences, markStutters } from "../src/lib/pitch/feedback.ts";
import { buildMetrics } from "../src/lib/pitch/metrics.ts";
import { contentScoreOf, outlineFromAnalysis, splitSentences, speechAnalysisSchema, type SpeechAnalysis } from "../src/lib/pitch/speech-analysis.ts";

const analysis: SpeechAnalysis = {
  topic: { score: 8, note: "Držal si sa témy." },
  outline: { score: 6, order: "minor", note: "Trh si povedal skôr." },
  clarity: { score: 7, note: "Zrozumiteľné." },
  overall: { score: 7, summary: "Dobrý prejav." },
  takeaway: "PitchIt je AI tréner.",
  onTopicPct: 85,
  points: [
    { index: 0, title: "Problém", status: "covered", score: 8, note: "Jasné." },
    { index: 1, title: "Pilot", status: "missing", score: 0, note: "Chýbal." },
  ],
  waste: [{ quote: "vlastne ako som hovoril", kind: "unnecessary", note: "Vynechaj." }],
  sentences: [{ index: 1, severity: "major", issue: "convoluted", note: "Rozdeľ na dve vety." }],
  advice: "Pridaj pilot.",
};

describe("report prejavu", () => {
  test("vety prepisu a zakoktania", () => {
    assert.deepEqual(splitSentences("Ahoj svet. Je je to tu? Áno"), ["Ahoj svet.", "Je je to tu?", "Áno"]);
    const marked = markStutters([
      { type: "word", text: "je", filler: false },
      { type: "word", text: "je", filler: false },
      { type: "word", text: "prez-", filler: false },
      { type: "word", text: "prezentácia.", filler: false },
      { type: "word", text: "pre", filler: false },
      { type: "word", text: "prezentáciu.", filler: false },
    ]);
    assert.deepEqual(marked.map((t) => (t.type === "word" ? !!t.stutter : null)), [true, false, true, false, false, false]);
    assert.equal(groupSentences(marked).length, 2);
  });

  test("obsahové skóre je priemer bodov osnovy a osnova sa odvodí z rozboru", () => {
    assert.equal(contentScoreOf(analysis), 4);
    const outline = outlineFromAnalysis({ topic: "AI tréner", points: ["Problém", "Pilot"] }, analysis);
    assert.equal(outline.check?.points[1].status, "missing");
    assert.equal(outline.check?.onTopicPct, 85);
    assert.ok(speechAnalysisSchema.safeParse(analysis).success);
  });

  test("report zostaví sekcie 1–7 z rozboru a označí vety", () => {
    const text = "Máme problém. Ktorý je taký že vlastne nevieme. Hotovo.";
    const words = text.split(" ").map((word, i) => ({ word, start: i * 0.4, end: i * 0.4 + 0.3 }));
    const attempt = {
      id: "a",
      target_seconds: 60,
      language: "sk",
      metrics: buildMetrics({ text, words, durationMs: 6000 }),
      content: { version: 2, analysis, derivedPoints: false },
      content_score: 4,
      outline: outlineFromAnalysis({ topic: "AI tréner", points: ["Problém", "Pilot"] }, analysis),
      body: null,
      qa: null,
      shared_at: null,
    } as unknown as PitchAttemptRow;
    const data = buildFeedback(attempt, { number: 1, retryHref: "/app/nahravka" });
    assert.equal(data.topic?.score, 8);
    assert.equal(data.outline?.pct, 50);
    assert.equal(data.clarity?.score, 7);
    assert.equal(data.speech?.overall?.score, 7);
    assert.equal(data.speech?.waste[0].label, "Zbytočné");
    assert.deepEqual(data.transcript.map((s) => s.severity), ["ok", "major", "ok"]);
    assert.equal(data.transcript[1].marker, 1);
    assert.equal(data.content?.score, 4);
    assert.deepEqual(data.content?.rows.map((r) => r.label), ["Problém", "Pilot"]);

    // bez osnovy: obsahové skóre ani zoznam bodov (body si AI nevymýšľa)
    const noOutline = buildFeedback({ ...attempt, outline: null } as PitchAttemptRow, { number: 1, retryHref: "/app/nahravka" });
    assert.equal(noOutline.content, null);
    assert.deepEqual(noOutline.speech?.points, []);
  });
});

test("odkazy na čísla viet sa z textov odstránia", async () => {
  const { stripSentenceRefs } = await import("../src/lib/pitch/speech-analysis.ts");
  assert.equal(stripSentenceRefs("Veta [1] jasne spomína problém."), "Jasne spomína problém.");
  assert.equal(stripSentenceRefs("Len spomenuté 120 používateľov (veta [5]), chýbali piloty."), "Len spomenuté 120 používateľov, chýbali piloty.");
  assert.equal(stripSentenceRefs("Veta [3] je zamotaná; veta [4] je mimo."), "Je zamotaná; je mimo.");
});
