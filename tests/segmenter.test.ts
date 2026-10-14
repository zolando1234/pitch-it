import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mergeSegments, missingSegments } from "../src/lib/pitch/segment-merge.ts";
import { encodeWav, findCut, Resampler, SAMPLE_RATE, SEGMENT_MAX_S, SEGMENT_MIN_S, Segmenter, segmentAll } from "../src/lib/pitch/segmenter.ts";

/** Hlas (sínus) s tichom v zadaných sekundách. */
function speech(seconds: number, silences: Array<[number, number]> = []): Float32Array {
  const out = new Float32Array(Math.round(seconds * SAMPLE_RATE));
  for (let i = 0; i < out.length; i++) {
    const t = i / SAMPLE_RATE;
    const silent = silences.some(([from, to]) => t >= from && t < to);
    out[i] = silent ? 0 : 0.3 * Math.sin(2 * Math.PI * 220 * t);
  }
  return out;
}

describe("delenie reči na úseky", () => {
  test("strih až po minimálnej dĺžke a v tichu", () => {
    assert.equal(findCut(speech(20)), null);
    const cut = findCut(speech(30, [[27, 27.6]]));
    assert.ok(cut !== null && cut / SAMPLE_RATE > 27 && cut / SAMPLE_RATE < 27.6);
  });

  test("bez ticha sa strihne najneskôr na maxime", () => {
    assert.equal(findCut(speech(30)), null);
    const cut = findCut(speech(SEGMENT_MAX_S + 0.5));
    assert.ok(cut !== null && cut / SAMPLE_RATE >= SEGMENT_MIN_S);
  });

  test("dlhá reč: úseky na seba nadväzujú a pokryjú všetko", () => {
    const audio = speech(100, [[28, 28.5], [57, 57.5], [86, 86.5]]);
    const segments = segmentAll(audio);
    assert.equal(segments.length, 4);
    let expected = 0;
    for (const s of segments) {
      assert.equal(s.offsetMs, expected);
      expected += s.durationMs;
    }
    assert.ok(Math.abs(expected - 100_000) <= 1);
  });

  test("Segmenter po blokoch = segmentAll; krátky koniec sa zahodí", () => {
    const seg = new Segmenter();
    const audio = speech(40, [[30, 30.5]]);
    const out = [];
    for (let i = 0; i < audio.length; i += 4096) out.push(...seg.push(audio.subarray(i, i + 4096)));
    const last = seg.finish();
    assert.equal(out.length, 1);
    assert.ok(last && last.index === 1);
    assert.equal(new Segmenter().finish(), null);
  });

  test("WAV hlavička a prevzorkovanie", () => {
    const wav = encodeWav(new Float32Array(16));
    assert.equal(String.fromCharCode(...wav.slice(0, 4)), "RIFF");
    assert.equal(wav.length, 44 + 32);
    const resampler = new Resampler(48_000);
    let n = 0;
    for (let i = 0; i < 10; i++) n += resampler.push(new Float32Array(4800)).length;
    assert.ok(Math.abs(n - 16_000) <= 2);
  });
});

describe("spojenie prepísaných úsekov", () => {
  test("časy slov sa posunú o začiatok úseku, poradie podľa indexu", () => {
    const merged = mergeSegments([
      { index: 1, offsetMs: 30_000, text: "svet", words: [{ word: "svet", start: 0.5, end: 1 }], provider: "elevenlabs" },
      { index: 0, offsetMs: 0, text: "ahoj", words: [{ word: "ahoj", start: 0.2, end: 0.6 }], provider: "elevenlabs" },
    ]);
    assert.equal(merged.text, "ahoj svet");
    assert.deepEqual(merged.words[1], { word: "svet", start: 30.5, end: 31 });
    assert.equal(merged.provider, "elevenlabs");
  });

  test("chýbajúce úseky", () => {
    assert.deepEqual(missingSegments([0, 2], 4), [1, 3]);
    assert.deepEqual(missingSegments([], 0), []);
  });
});
