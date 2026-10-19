import assert from "node:assert/strict";
import { test } from "node:test";
import { GRACE_MS, silenceStep, SILENCE_MS } from "../src/lib/pitch/silence.ts";

test("do minúty ticha sa nič nedeje, potom sa opýtame", () => {
  assert.deepEqual(silenceStep({ now: 59_000, lastVoice: 0, askedAt: null }), { kind: "quiet" });
  assert.deepEqual(silenceStep({ now: SILENCE_MS, lastVoice: 0, askedAt: null }), { kind: "ask" });
});

test("počas otázky beží odpočet a po lehote sa nahrávanie ukončí", () => {
  const askedAt = 60_000;
  assert.deepEqual(silenceStep({ now: 70_000, lastVoice: 0, askedAt }), { kind: "wait", secondsLeft: 20 });
  assert.deepEqual(silenceStep({ now: askedAt + GRACE_MS - 1, lastVoice: 0, askedAt }), { kind: "wait", secondsLeft: 1 });
  assert.deepEqual(silenceStep({ now: askedAt + GRACE_MS, lastVoice: 0, askedAt }), { kind: "timeout", idleMs: 90_000 });
});

test("vlastné lehoty", () => {
  assert.deepEqual(silenceStep({ now: 5_000, lastVoice: 0, askedAt: null, silenceMs: 5_000 }), { kind: "ask" });
  assert.deepEqual(silenceStep({ now: 8_000, lastVoice: 0, askedAt: 5_000, graceMs: 2_000 }), { kind: "timeout", idleMs: 8_000 });
});
