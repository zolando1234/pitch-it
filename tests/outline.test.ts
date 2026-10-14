import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { keywordStatus, matchPct, outlineByKeywords, outlineFromCheck, parseOutlinePoints, toOutline, type OutlineCheck } from "../src/lib/pitch/outline.ts";
import { buildFeedback } from "../src/lib/pitch/feedback.ts";
import type { PitchAttemptRow } from "../src/lib/db/types.ts";
import { buildContentPrompt } from "../src/lib/pitch/content.ts";
import { buildOutlinePrompt } from "../src/lib/pitch/outline.ts";

describe("osnova pitchu", () => {
  test("body z textu: jeden na riadok, bez odrážok a čísel", () => {
    assert.deepEqual(parseOutlinePoints("- Problém\n\n2. Riešenie\n• Trh  \n3) Ask"), ["Problém", "Riešenie", "Trh", "Ask"]);
  });

  test("prázdna téma aj osnova = žiadna osnova", () => {
    assert.equal(toOutline("  ", "\n \n"), null);
    assert.deepEqual(toOutline(" AI tréner ", ""), { topic: "AI tréner", points: [] });
  });

  test("zhoda kľúčových slov zvládne skloňovanie a diakritiku", () => {
    const transcript = "Founderi dnes pitchuju bez spatnej vazby a nase riesenia im pomozu.";
    assert.equal(keywordStatus("Problém: founderi pitchujú bez spätnej väzby", transcript), "covered");
    assert.equal(keywordStatus("Výsledky z pilotu", transcript), "missing");
  });

  test("percento zhody: pokrytý bod 1, čiastočne polovica", () => {
    const outline = { topic: "", points: ["Problém", "Riešenie", "Trh", "Ask"] };
    const check: OutlineCheck = {
      points: [
        { index: 0, status: "covered", clarity: 8, note: "ok" },
        { index: 1, status: "covered", clarity: 7, note: "ok" },
        { index: 2, status: "partial", clarity: 4, note: "len okrajovo" },
        { index: 3, status: "missing", clarity: 5, note: "nezaznelo" },
      ],
      onTopicPct: 80,
      order: "kept",
      digressions: [],
      clarity: 7,
      takeaway: "Poslucháč pochopí problém.",
      advice: "Povedz sumu.",
    };
    const result = outlineFromCheck(outline, check, "");
    assert.equal(matchPct(result), 63);
    // chýbajúci bod nemá zrozumiteľnosť
    assert.equal(result.check?.points[3].clarity, 0);
  });

  test("bod, ktorý model vynechal, doplní zhoda kľúčových slov", () => {
    const outline = { topic: "", points: ["Problém", "Veľkosť trhu"] };
    const check: OutlineCheck = {
      points: [{ index: 0, status: "covered", clarity: 8, note: "ok" }],
      onTopicPct: 90,
      order: "kept",
      digressions: [],
      clarity: 8,
      takeaway: "x",
      advice: "y",
    };
    const result = outlineFromCheck(outline, check, "Trh je veľký.");
    assert.equal(result.check?.points[1].status, "covered");
    assert.equal(result.check?.points[1].note, null);
  });

  test("bez bodov rozhoduje držanie sa témy, bez prepisu niet zhody", () => {
    const onlyTopic = outlineFromCheck(
      { topic: "AI tréner", points: [] },
      { points: [], onTopicPct: 72, order: "kept", digressions: [], clarity: 6, takeaway: "x", advice: "y" },
      "",
    );
    assert.equal(matchPct(onlyTopic), 72);
    assert.equal(matchPct({ version: 1, topic: "AI tréner", points: [], check: null }), null);
  });

  test("feedback bez AI označí porovnanie podľa kľúčových slov", () => {
    const attempt = { id: "a", target_seconds: 60, outline: outlineByKeywords({ topic: "", points: ["Problém", "Pilot"] }, "Máme problém."), metrics: null, content: null, body: null, qa: null, shared_at: null } as unknown as PitchAttemptRow;
    const data = buildFeedback(attempt, { number: 1, retryHref: "/app/nahravka" });
    assert.equal(data.speech?.byKeywords, true);
    assert.equal(data.outline?.pct, 50);
    assert.equal(data.clarity, null);
    assert.deepEqual(data.plan?.points, ["Problém", "Pilot"]);
  });

  test("téma ide ako záväzné zadanie do obsahového skóre aj porovnania s osnovou", () => {
    const topic = "PitchIt pripraví foundera na stretnutie s investorom.";
    const content = buildContentPrompt({ transcript: "Ahoj.", audience: "investor", targetSeconds: 60, notes: null, topic, outline: ["Problém"] });
    assert.match(content, /záväzné zadanie/);
    assert.ok(content.includes(topic));
    assert.ok(content.includes("- Problém"));
    assert.ok(buildOutlinePrompt({ outline: { topic, points: [] }, transcript: "Ahoj.", audience: "investor" }).includes(topic));
    // bez témy zostáva prompt ako predtým
    assert.doesNotMatch(buildContentPrompt({ transcript: "Ahoj.", audience: "investor", targetSeconds: 60, notes: null }), /záväzné zadanie/);
  });
});
