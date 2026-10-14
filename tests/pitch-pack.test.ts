import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { afterPitch, FREE_PITCHES, formatEur, PITCH_PACK, pitchBalance } from "../src/lib/billing/pitch-pack.ts";

describe("paywall pitchov", () => {
  test("nový používateľ má 3 pitche zadarmo", () => {
    assert.deepEqual(pitchBalance(null), { freeLeft: FREE_PITCHES, credits: 0, canPitch: true });
  });

  test("štvrtý pitch už potrebuje kúpený balík", () => {
    let wallet = null as ReturnType<typeof afterPitch> | null;
    for (let i = 0; i < FREE_PITCHES; i++) wallet = afterPitch(wallet);
    assert.deepEqual(pitchBalance(wallet), { freeLeft: 0, credits: 0, canPitch: false });
  });

  test("najprv sa míňajú pitche zadarmo, potom kúpené", () => {
    const bought = { free_used: 1, credits: 10 };
    assert.deepEqual(afterPitch(bought), { free_used: 2, credits: 10 });
    assert.deepEqual(afterPitch({ free_used: 3, credits: 10 }), { free_used: 3, credits: 9 });
    assert.deepEqual(afterPitch({ free_used: 3, credits: 0 }), { free_used: 3, credits: 0 });
  });

  test("balík: 10 pitchov za 19,99 €", () => {
    assert.equal(PITCH_PACK.credits, 10);
    assert.equal(formatEur(PITCH_PACK.priceCents), "19,99 €");
  });
});

describe("dĺžka pitchu", () => {
  test("4 minúty len s kúpenými pitchami", async () => {
    const { canUseLength, lengthLabel } = await import("../src/lib/billing/pitch-pack.ts");
    assert.equal(canUseLength(240, { freeLeft: 3, credits: 0, canPitch: true }), false);
    assert.equal(canUseLength(240, { freeLeft: 0, credits: 5, canPitch: true }), true);
    assert.equal(canUseLength(180, { freeLeft: 1, credits: 0, canPitch: true }), true);
    assert.equal(canUseLength(240, null), true);
    // vlastná dĺžka len v celých minútach do 30 min
    const { isValidLength } = await import("../src/lib/billing/pitch-pack.ts");
    assert.equal(isValidLength(30), true);
    assert.equal(isValidLength(600), true);
    assert.equal(isValidLength(90), false);
    assert.equal(isValidLength(31 * 60), false);
    assert.equal(canUseLength(600, { freeLeft: 3, credits: 0, canPitch: true }), false);
    assert.equal(lengthLabel(240), "4 min");
    assert.equal(lengthLabel(30), "30 s");
  });
});
