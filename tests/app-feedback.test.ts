import assert from "node:assert/strict";
import { test } from "node:test";
import { balanceFor } from "../src/lib/billing/pitch-pack.ts";
import { FREE_SECONDS } from "../src/lib/billing/pricing.ts";
import { FEEDBACK_BONUS_SECONDS, feedbackSchema, summarizeFeedback } from "../src/lib/feedback/survey.ts";

test("dotazník: hviezdičky 1 – 5 povinné, komentár nepovinný", () => {
  const ok = feedbackSchema.safeParse({ ratings: { overall: 5, usefulness: 4, ease: 3 } });
  assert.equal(ok.success, true);
  assert.equal(ok.success && ok.data.comment, "");
  assert.equal(feedbackSchema.safeParse({ ratings: { overall: 6, usefulness: 4, ease: 3 } }).success, false);
  assert.equal(feedbackSchema.safeParse({ ratings: { overall: 0, usefulness: 4, ease: 3 } }).success, false);
  assert.equal(feedbackSchema.safeParse({ ratings: { overall: 4.5, usefulness: 4, ease: 3 } }).success, false);
  assert.equal(feedbackSchema.safeParse({ ratings: { overall: 4, usefulness: 4 } }).success, false);
  assert.equal(feedbackSchema.safeParse({ ratings: { overall: 4, usefulness: 4, ease: 4 }, comment: "x".repeat(2001) }).success, false);
});

test("dotazník: priemery a najnovšie odpovede prvé", () => {
  const s = summarizeFeedback(
    [
      { user_id: "a", created_at: "2026-11-01T10:00:00Z", ratings: { overall: 5, usefulness: 4, ease: 5 }, comment: " super " },
      { user_id: "b", created_at: "2026-11-03T10:00:00Z", ratings: { overall: 4, usefulness: 3, ease: 4 }, comment: null },
    ],
    new Map([["a", "a@x.sk"]]),
  );
  assert.equal(s.count, 2);
  assert.deepEqual(s.averages, { overall: 4.5, usefulness: 3.5, ease: 4.5 });
  assert.deepEqual(s.items.map((i) => [i.email, i.comment]), [["–", ""], ["a@x.sk", "super"]]);
  assert.deepEqual(summarizeFeedback([], new Map()).averages, { overall: null, usefulness: null, ease: null });
});

test("odmena za dotazník: Free má o 5 minút viac času zadarmo", () => {
  const before = balanceFor({ plan: "free", wallet: { free_used: 0, credits: 0, free_seconds_used: FREE_SECONDS } });
  const after = balanceFor({ plan: "free", wallet: { free_used: 0, credits: 0, free_seconds_used: FREE_SECONDS - FEEDBACK_BONUS_SECONDS } });
  assert.equal(before.canPitch, false);
  assert.equal(after.freeSecondsLeft, FEEDBACK_BONUS_SECONDS);
  assert.equal(after.canPitch, true);
});
