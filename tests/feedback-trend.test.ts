import assert from "node:assert/strict";
import { test } from "node:test";
import { FeedbackEngine } from "../src/lib/coach/pose/feedback.ts";
import type { Metrics } from "../src/lib/coach/pose/metrics.ts";

/*
  Trendy: krátka pauza v gestách sa nehlási, dlhodobý stav áno; vyriešená rada sa hneď neopakuje.
  Testujeme len pravidlo „Ruky visia dole“ (okno 30 s, 60 % času).
*/
const metrics = (handsLow: boolean) => ({ handsLow, walking: false, figLeaf: false, highlights: [] }) as unknown as Metrics;

function run(engine: FeedbackEngine, from: number, ms: number, handsLow: boolean) {
  let fb = engine.update(metrics(handsLow), from);
  for (let t = from + 33; t <= from + ms; t += 33) fb = engine.update(metrics(handsLow), t);
  return fb;
}

test("krátka pauza s rukami dole nie je chyba, dlhodobé ruky dole áno", () => {
  const engine = new FeedbackEngine();
  engine.setRuleFilter((id) => id === "hands-low");
  // 8 s rúk dole (pauza medzi gestami): tréner mlčí
  assert.equal(run(engine, 1000, 8000, true).ruleId, null);
  // ruky dole väčšinu času: po prekročení 60 % z 30 s sa ozve
  const fb = run(engine, 9033, 12000, true);
  assert.equal(fb.ruleId, "hands-low");
});

test("vyriešená rada sa 30 s neopakuje", () => {
  const engine = new FeedbackEngine();
  engine.setRuleFilter((id) => id === "hands-low");
  assert.equal(run(engine, 1000, 25000, true).ruleId, "hands-low");
  // ruky hore: rada zmizne
  assert.equal(run(engine, 26033, 2000, false).ruleId, null);
  // ruky znova dole o chvíľu: ešte cooldown
  assert.equal(run(engine, 28066, 5000, true).ruleId, null);
});
