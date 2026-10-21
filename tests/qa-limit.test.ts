import assert from "node:assert/strict";
import { test } from "node:test";
import { QA_MAX_QUESTIONS, qaMaxQuestionsFor } from "../src/lib/pitch/qa.ts";

const min = (m: number) => m * 60_000;

test("počet otázok Q&A podľa dĺžky prejavu", () => {
  assert.equal(qaMaxQuestionsFor(0), 1);
  assert.equal(qaMaxQuestionsFor(min(1)), 1);
  assert.equal(qaMaxQuestionsFor(min(4.9)), 1);
  assert.equal(qaMaxQuestionsFor(min(5)), 2);
  assert.equal(qaMaxQuestionsFor(min(9.9)), 2);
  assert.equal(qaMaxQuestionsFor(min(10)), 3);
  assert.equal(qaMaxQuestionsFor(min(29.9)), 3);
  assert.equal(qaMaxQuestionsFor(min(30)), QA_MAX_QUESTIONS);
  assert.equal(QA_MAX_QUESTIONS, 5);
});
