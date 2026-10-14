import assert from "node:assert/strict";
import { test } from "node:test";
import { ruleFilterFor, TALK_MODES } from "../src/lib/coach/modes.ts";
import { GAP_AFTER_ANSWER_MS, maxQuestionsFor, planQuestionTimes } from "../src/lib/pitch/meeting.ts";
import { buildQuestionsPrompt } from "../src/lib/pitch/qa.ts";

test("koľko otázok sa zmestí do stretnutia", () => {
  assert.equal(maxQuestionsFor(30_000), 0);
  assert.equal(maxQuestionsFor(60_000), 1);
  assert.equal(maxQuestionsFor(180_000), 4);
  assert.equal(maxQuestionsFor(30 * 60_000), 10);
});

test("otázky sú rozložené rastúco, s odstupom, nie na začiatku ani na konci", () => {
  for (const seed of [0, 0.5, 0.999]) {
    const times = planQuestionTimes(10 * 60_000, 3, () => seed);
    assert.equal(times.length, 3);
    assert.ok(times[0] >= 45_000);
    for (let i = 1; i < times.length; i++) assert.ok(times[i] - times[i - 1] >= GAP_AFTER_ANSWER_MS);
    assert.ok(times[2] <= 10 * 60_000 - 20_000);
  }
  // viac otázok, ako sa zmestí: orežú sa
  assert.equal(planQuestionTimes(180_000, 10).length, 4);
  assert.deepEqual(planQuestionTimes(30_000, 3), []);
});

test("pri stole neplatia pravidlá pódia a nôh, gestá áno", () => {
  const seated = ruleFilterFor(TALK_MODES[0], false, true);
  for (const id of ["pacing", "rooted", "sway", "legs-crossed", "narrow-stance", "hands-low", "edge"]) assert.equal(seated(id), false, id);
  for (const id of ["crossed", "face-touch", "head-down", "turned", "fists"]) assert.equal(seated(id), true, id);
  assert.equal(ruleFilterFor(TALK_MODES[0], false)("pacing"), true);
});

test("otázka klienta nadväzuje na koniec výkladu a neopakuje sa", () => {
  const prompt = buildQuestionsPrompt({ count: 1, language: "Slovak", transcript: "x".repeat(7000) + " KONIEC", seed: 1, asked: ["Koľko to stojí?"], client: true });
  assert.match(prompt, /KONIEC/);
  assert.match(prompt, /Koľko to stojí\?/);
  assert.match(prompt, /na ten nadviaž/);
});
