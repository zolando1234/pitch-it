import assert from "node:assert/strict";
import { test } from "node:test";
import { summarizeMember, teamTotals } from "../src/lib/teams/progress.ts";
import type { PitchProgressRow } from "../src/lib/pitch/progress.ts";

const NOW = new Date("2026-10-21T12:00:00Z"); // streda

function row(id: string, createdAt: string, patch: Partial<PitchProgressRow> = {}): PitchProgressRow {
  return {
    id,
    number: 0,
    createdAt,
    targetSeconds: 60,
    languageLabel: "Slovenčina",
    body: null,
    content: null,
    fillers: null,
    tempo: null,
    outline: null,
    qa: null,
    mode: "public",
    topic: "",
    topicKey: "",
    ...patch,
  };
}

test("súhrn člena: počty, minúty, posledný pokus a trend skóre", () => {
  const rows = [
    row("a", "2026-10-02T10:00:00Z", { content: 4, mode: "public" }),
    row("b", "2026-10-19T09:00:00Z", { content: 6, qa: 5, mode: "client" }),
    row("c", "2026-10-20T09:00:00Z", { content: 7.5, qa: 7, mode: "client" }),
  ];
  const durations = new Map([["a", 120], ["b", 300], ["c", 180]]);
  const s = summarizeMember(rows, durations, NOW);
  assert.equal(s.attempts, 3);
  assert.equal(s.thisWeek, 2); // od pondelka 19. 10.
  assert.equal(s.thisMonth, 3);
  assert.equal(s.last7, 2);
  assert.equal(s.minutes, 10);
  assert.equal(s.daysSince, 1);
  assert.deepEqual(s.content, { first: 4, last: 7.5, avg: 5.8, count: 3 });
  assert.equal(s.trend, "up");
  assert.deepEqual(s.byKind, { public: 1, client: 2, meeting: 0 });
});

test("člen bez pokusov a s jedným pokusom nemá trend", () => {
  const none = summarizeMember([], new Map(), NOW);
  assert.equal(none.attempts, 0);
  assert.equal(none.lastAt, null);
  assert.equal(none.daysSince, null);
  assert.equal(none.trend, null);
  const one = summarizeMember([row("a", "2026-10-21T08:00:00Z", { content: 5 })], new Map(), NOW);
  assert.equal(one.trend, null);
  assert.equal(one.daysSince, 0);
  assert.equal(one.minutes, 1); // bez zmeranej dĺžky sa berie cieľová dĺžka
});

test("klesajúce a stabilné skóre", () => {
  const down = summarizeMember([row("a", "2026-10-01T00:00:00Z", { content: 8 }), row("b", "2026-10-02T00:00:00Z", { content: 5 })], new Map(), NOW);
  assert.equal(down.trend, "down");
  const flat = summarizeMember([row("a", "2026-10-01T00:00:00Z", { content: 6 }), row("b", "2026-10-02T00:00:00Z", { content: 6.1 })], new Map(), NOW);
  assert.equal(flat.trend, "flat");
});

test("súhrn tímu: aktívni za 7 dní a tí, čo nič nevyskúšali", () => {
  const active = summarizeMember([row("a", "2026-10-20T00:00:00Z")], new Map(), NOW);
  const old = summarizeMember([row("b", "2026-09-01T00:00:00Z")], new Map(), NOW);
  const idle = summarizeMember([], new Map(), NOW);
  const totals = teamTotals([active, old, idle]);
  assert.deepEqual(totals, { members: 3, active7: 1, attempts: 2, thisMonth: 1, neverTried: 1, minutes: 2 });
});
