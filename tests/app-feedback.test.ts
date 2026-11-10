import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceFor } from "../src/lib/billing/pitch-pack.ts";
import { FREE_SECONDS } from "../src/lib/billing/pricing.ts";
import { FEEDBACK_BONUS_SECONDS, feedbackSchema, summarizeFeedback } from "../src/lib/feedback/survey.ts";

const answers = { experience: "Dobre, rýchlo.", usedFor: ["meeting", "public"], missing: "Export do PDF." };

test("dotazník: hviezdičky 1 – 5 povinné, komentár nepovinný", () => {
  const ok = feedbackSchema.safeParse({ ratings: { overall: 5, usefulness: 4, ease: 3 }, ...answers });
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.comment, "");
  const r = (ratings: Record<string, number>, extra = {}) => feedbackSchema.safeParse({ ratings, ...answers, ...extra }).success;
  assert.equal(r({ overall: 6, usefulness: 4, ease: 3 }), false);
  assert.equal(r({ overall: 0, usefulness: 4, ease: 3 }), false);
  assert.equal(r({ overall: 4.5, usefulness: 4, ease: 3 }), false);
  assert.equal(r({ overall: 4, usefulness: 4 }), false);
  assert.equal(r({ overall: 4, usefulness: 4, ease: 4 }, { comment: "x".repeat(2001) }), false);
});

test("dotazník: tri povinné otázky (skúsenosť, na čo, čo chýba)", () => {
  const ratings = { overall: 4, usefulness: 4, ease: 4 };
  const parse = (extra: Record<string, unknown>) => feedbackSchema.safeParse({ ratings, ...answers, ...extra });
  assert.equal(parse({ experience: "  " }).success, false);
  assert.equal(parse({ missing: undefined }).success, false);
  assert.equal(parse({ usedFor: [] }).success, false);
  assert.equal(parse({ usedFor: ["vacation"] }).success, false);
  const dup = parse({ usedFor: ["meeting", "meeting"], experience: "  Super  " });
  assert.ok(dup.success);
  assert.deepEqual(dup.success && dup.data.usedFor, ["meeting"]);
  assert.equal(dup.success && dup.data.experience, "Super");
});

test("dotazník: priemery a najnovšie odpovede prvé", () => {
  const s = summarizeFeedback(
    [
      { user_id: "a", created_at: "2026-11-01T10:00:00Z", ratings: { overall: 5, usefulness: 4, ease: 5 }, answers: { experience: " fajn ", usedFor: ["meeting", "public"], missing: "PDF" }, comment: " super " },
      { user_id: "b", created_at: "2026-11-03T10:00:00Z", ratings: { overall: 4, usefulness: 3, ease: 4 }, comment: null },
    ],
    new Map([["a", "a@x.sk"]]),
  );
  assert.equal(s.count, 2);
  assert.deepEqual(s.averages, { overall: 4.5, usefulness: 3.5, ease: 4.5 });
  assert.deepEqual(s.items.map((i) => [i.email, i.comment]), [["–", ""], ["a@x.sk", "super"]]);
  assert.deepEqual(s.uses, { meeting: 1, public: 1, investors: 0, other: 0 });
  // staršia odpoveď bez povinných otázok
  assert.deepEqual([s.items[0].experience, s.items[0].usedFor, s.items[0].missing], ["", [], ""]);
  assert.deepEqual([s.items[1].experience, s.items[1].missing], ["fajn", "PDF"]);
  assert.deepEqual(summarizeFeedback([], new Map()).averages, { overall: null, usefulness: null, ease: null });
});

test("odmena za dotazník: Free má o 5 minút viac času zadarmo", () => {
  const before = balanceFor({ plan: "free", wallet: { free_used: 0, credits: 0, free_seconds_used: FREE_SECONDS } });
  const after = balanceFor({ plan: "free", wallet: { free_used: 0, credits: 0, free_seconds_used: FREE_SECONDS - FEEDBACK_BONUS_SECONDS } });
  assert.equal(before.canPitch, false);
  assert.equal(after.freeSecondsLeft, FEEDBACK_BONUS_SECONDS);
  assert.equal(after.canPitch, true);
});
