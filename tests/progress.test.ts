import { test, describe } from "node:test";
import assert from "node:assert/strict";
import type { PitchAttemptRow } from "../src/lib/db/types.ts";
import { filterRows, firstAndLast, improved, pitchStatCards, progressRows, topicsOf } from "../src/lib/pitch/progress.ts";

const attempt = (id: string, createdAt: string, patch: Partial<PitchAttemptRow>): PitchAttemptRow =>
  ({
    id,
    user_id: "u",
    audience: "investor",
    target_seconds: 60,
    focus: "tempo",
    with_camera: false,
    duration_ms: 60_000,
    status: "ready",
    transcript: null,
    metrics: null,
    content: null,
    content_score: null,
    body: null,
    outline: null,
    language: "sk",
    stt_model: null,
    model: null,
    event_id: null,
    share_name: null,
    share_team: null,
    share_email: null,
    shared_at: null,
    created_at: createdAt,
    ...patch,
  }) as PitchAttemptRow;

describe("progres pitchov", () => {
  const rows = progressRows([
    attempt("b", "2026-10-11T10:00:00Z", { content_score: 7.5, metrics: { tempo: 4.2, fillersPer60s: 3 } as never }),
    attempt("a", "2026-10-10T10:00:00Z", { content_score: 5, metrics: { tempo: 5.8, fillersPer60s: 9 } as never }),
    attempt("x", "2026-10-11T11:00:00Z", { status: "failed" }),
  ]);

  test("len hotové pitche, zoradené od prvého", () => {
    assert.deepEqual(
      rows.map((r) => [r.id, r.number]),
      [
        ["a", 1],
        ["b", 2],
      ],
    );
  });

  test("porovnanie prvého a posledného pitchu", () => {
    assert.deepEqual(firstAndLast(rows, "content"), { first: 5, last: 7.5, count: 2 });
    assert.equal(improved("content", 5, 7.5), true);
    assert.equal(improved("fillers", 9, 3), true);
    assert.equal(improved("tempo", 5.8, 4.2), null);
    assert.equal(firstAndLast(rows, "body"), null);
  });

  test("karty na prehľade ukazujú poslednú hodnotu a zmenu", () => {
    const cards = pitchStatCards(rows);
    const fillers = cards.find((c) => c.key === "fillers")!;
    assert.equal(fillers.value, "3,0");
    assert.equal(fillers.delta?.verdict, "better");
    assert.equal(cards.find((c) => c.key === "body")!.value, null);
  });
});

describe("progres podľa typu tréningu a témy", () => {
  const outline = (topic: string) => ({ version: 1, topic, points: [], check: null });
  const rows = progressRows([
    attempt("a", "2026-10-10T10:00:00Z", { mode: "public", outline: outline("PitchIt investorom") as never }),
    attempt("b", "2026-10-11T10:00:00Z", { mode: "client", outline: outline("Ponuka pre Tatra banku") as never, qa: { version: 1, language: "sk", answers: [], score: 6.5, summary: null } as never }),
    attempt("c", "2026-10-12T10:00:00Z", { mode: "public", outline: outline("  pitchit   INVESTOROM ") as never }),
    attempt("d", "2026-10-13T10:00:00Z", { mode: "meeting" }),
  ]);

  test("typ, téma a skóre odpovedí sa prenesú do riadkov", () => {
    assert.deepEqual(rows.map((r) => r.mode), ["public", "client", "public", "meeting"]);
    assert.equal(rows[1].qa, 6.5);
    // rovnaká téma s inými medzerami a písmenami = rovnaký kľúč
    assert.equal(rows[0].topicKey, rows[2].topicKey);
    assert.equal(rows[3].topicKey, "");
  });

  test("filter prečísluje pokusy a témy sú zoradené podľa počtu", () => {
    const publicRows = filterRows(rows, { kind: "public" });
    assert.deepEqual(publicRows.map((r) => [r.id, r.number]), [["a", 1], ["c", 2]]);
    const topics = topicsOf(rows);
    assert.equal(topics[0].count, 2);
    assert.equal(topics.length, 2);
    assert.deepEqual(filterRows(rows, { topicKey: topics[1].key }).map((r) => r.id), ["b"]);
  });
});
