import assert from "node:assert/strict";
import { test } from "node:test";
import { implausibleTranscript, MAX_WORDS_PER_SECOND, wavSeconds } from "../src/lib/pitch/transcript-sanity.ts";

test("dĺžka WAV úseku z veľkosti (16 kHz, mono, 16 bit)", () => {
  assert.equal(wavSeconds(44 + 32_000 * 30), 30);
  assert.equal(wavSeconds(10), 0);
});

test("bežná reč je v poriadku, zmes slov nie", () => {
  assert.equal(implausibleTranscript(70, 30), false); // ~2,3 slova za sekundu
  assert.equal(implausibleTranscript(120, 30), false); // rýchla reč, 4 slová za sekundu
  assert.equal(implausibleTranscript(250, 14), true); // zmes náhodných slov: ~18 za sekundu
  assert.equal(implausibleTranscript(Math.round(MAX_WORDS_PER_SECOND * 20) + 1, 20), true);
});

test("veľmi krátky zvuk sa neposudzuje", () => {
  assert.equal(implausibleTranscript(10, 1.5), false);
});
