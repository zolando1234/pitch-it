import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  countFillers,
  countWords,
  fillerRate,
  repeatedTrigramRatio,
  transcriptConfidence,
  wordsPerMinute,
} from "../src/lib/analytics/speech/text-metrics.ts";

describe("text-metrics", () => {
  test("počíta slová vrátane diakritiky a čísel", () => {
    assert.equal(countWords("Náš trh má 4,2 miliardy eur, t. j. veľa."), 10);
    assert.equal(countWords("   "), 0);
  });

  test("výplňové slová: zaváhania a viacslovné frázy bez dvojitého počítania", () => {
    const result = countFillers("Ehm, v podstate máme, eee, akože 40 zákazníkov. V podstate rastieme.");
    assert.equal(result.hesitation, 2);
    assert.equal(result.discourse, 3);
    assert.equal(result.byPhrase["v podstate"], 2);
    assert.equal(result.byPhrase.akože, 1);
  });

  test("slovo „v“ samostatne nie je výplň", () => {
    assert.equal(countFillers("Sme v Bratislave a v Brne.").total, 0);
  });

  test("tempo: slová za minútu iba pri dostatočnej dĺžke reči", () => {
    assert.equal(wordsPerMinute(150, 60_000), 150);
    assert.equal(wordsPerMinute(20, 3_000), null);
    assert.equal(wordsPerMinute(0, 60_000), null);
  });

  test("miera výplňových slov na 100 slov", () => {
    assert.equal(fillerRate(5, 100), 5);
    assert.equal(fillerRate(1, 10), null);
  });

  test("opakovanie trigramov rozpozná točenie sa v kruhu", () => {
    const repeated = Array.from({ length: 6 }, () => "náš produkt šetrí účtovníkom veľa času každý mesiac").join(" ");
    const varied = "Naši zákazníci sú e-shopy s obratom nad milión eur, ktoré dnes ručne prepisujú faktúry do účtovníctva a strácajú tým desiatky hodín mesačne, čo im naša integrácia so skladom a bankou odstráni hneď v prvom týždni používania produktu.";
    assert.ok((repeatedTrigramRatio(repeated) ?? 0) > 0.5);
    const variedRatio = repeatedTrigramRatio(varied);
    assert.ok(variedRatio === null || variedRatio < 0.1);
    assert.equal(repeatedTrigramRatio("krátka odpoveď"), null);
  });

  test("istota prepisu z logprobs", () => {
    assert.equal(transcriptConfidence([{ logprob: 0 }, { logprob: 0 }]), 1);
    assert.equal(transcriptConfidence(null), null);
  });
});
