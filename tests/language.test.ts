import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { countFillers } from "../src/lib/analytics/speech/text-metrics.ts";
import { LANGUAGE_INFO, parseLanguage, sttOrder } from "../src/lib/pitch/language.ts";
import { buildMetrics, countSyllables, isFillerWord } from "../src/lib/pitch/metrics.ts";

const all = { elevenlabs: true, mistral: true, openai: true };

describe("jazyk pitchu", () => {
  test("slovenčina a čeština idú najprv cez ElevenLabs Scribe (Voxtral ich nepodporuje)", () => {
    assert.equal(sttOrder("sk", all)[0], "elevenlabs");
    assert.equal(sttOrder("cs", all)[0], "elevenlabs");
  });

  test("angličtina ide najprv cez Voxtral, záloha je Scribe", () => {
    assert.deepEqual(sttOrder("en", all).slice(0, 2), ["mistral", "elevenlabs"]);
  });

  test("použijú sa len nakonfigurované modely", () => {
    assert.deepEqual(sttOrder("sk", { elevenlabs: false, mistral: true, openai: false }), ["mistral"]);
    assert.deepEqual(sttOrder("en", { elevenlabs: false, mistral: false, openai: false }), []);
  });

  test("neznámy jazyk = slovenčina, titulky majú správny jazyk prehliadača", () => {
    assert.equal(parseLanguage("xx"), "sk");
    assert.equal(parseLanguage("en"), "en");
    assert.equal(LANGUAGE_INFO.cs.bcp47, "cs-CZ");
  });

  test("anglické vypĺňacie slová a slabiky", () => {
    const fillers = countFillers("So um I mean we basically help founders, you know", "en");
    assert.equal(fillers.byPhrase["um"], 1);
    assert.equal(fillers.byPhrase["i mean"], 1);
    assert.equal(fillers.byPhrase["you know"], 1);
    assert.equal(isFillerWord("Um,", "en"), true);
    assert.equal(isFillerWord("akože", "en"), false);
    assert.equal(countSyllables("investor", "en"), 3);
    assert.equal(countSyllables("make", "en"), 1);
  });

  test("metriky bez jazyka ostávajú slovenské", () => {
    const words = [
      { word: "Máme", start: 0, end: 0.4 },
      { word: "akože", start: 0.5, end: 0.9 },
      { word: "problém.", start: 1.0, end: 1.5 },
    ];
    const m = buildMetrics({ text: "Máme akože problém.", words, durationMs: 2000 });
    assert.equal(m.fillers.byPhrase["akože"], 1);
  });
});
