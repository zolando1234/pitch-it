import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { fitToSchema } from "../src/lib/ai/llm/fit-schema.ts";
import { speechAnalysisSchema } from "../src/lib/pitch/speech-analysis.ts";

test("prekročené limity modelu sa opravia, nie zahodia", () => {
  const schema = z.object({
    note: z.string().max(10),
    score: z.number().int().min(0).max(10),
    items: z.array(z.object({ t: z.string().max(3) })).max(2),
    opt: z.string().max(5).nullable(),
  });
  const json = z.toJSONSchema(schema, { unrepresentable: "any" }) as Record<string, unknown>;
  const fixed = fitToSchema({ note: "veľmi dlhý komentár", score: 11.4, items: [{ t: "abcd" }, { t: "x" }, { t: "y" }], opt: null }, json as never);
  const parsed = schema.safeParse(fixed);
  assert.ok(parsed.success);
  assert.deepEqual(parsed.data, { note: "veľmi dlhý", score: 10, items: [{ t: "abc" }, { t: "x" }], opt: null });
});

test("rozbor prejavu s príliš dlhými poznámkami prejde", () => {
  const json = z.toJSONSchema(speechAnalysisSchema, { unrepresentable: "any" }) as Record<string, unknown>;
  const long = "x".repeat(1000);
  const raw = {
    topic: { score: 7, note: long },
    outline: { score: 6, note: long, order: "kept" },
    clarity: { score: 8, note: long },
    overall: { score: 7, summary: long },
    takeaway: long,
    onTopicPct: 104,
    points: [],
    waste: Array.from({ length: 9 }, () => ({ quote: long, kind: "unnecessary", note: long })),
    sentences: [{ index: 0, severity: "minor", issue: "vague", note: long }],
    advice: long,
  };
  assert.equal(speechAnalysisSchema.safeParse(raw).success, false);
  assert.ok(speechAnalysisSchema.safeParse(fitToSchema(raw, json as never)).success);
});
