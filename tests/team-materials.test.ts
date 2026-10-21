import assert from "node:assert/strict";
import test from "node:test";
import { docxParagraphs } from "../src/lib/documents/extract-docx.ts";
import { buildSpeechPrompt } from "../src/lib/pitch/speech-analysis.ts";
import { averageMatch, criteriaForPrompt, materialsAsContext, EMPTY_MATERIALS } from "../src/lib/pitch/team-materials.ts";

test("docxParagraphs spojí texty v odseku a vynechá prázdne odseky", () => {
  const xml = "<w:p><w:r><w:t>Ahoj </w:t></w:r><w:r><w:t xml:space=\"preserve\">svet &amp; tím</w:t></w:r></w:p><w:p></w:p><w:p><w:r><w:t>Druhý</w:t></w:r></w:p>";
  assert.deepEqual(docxParagraphs(xml), ["Ahoj svet & tím", "Druhý"]);
});

test("averageMatch priemeruje len pokusy so zhodou", () => {
  assert.equal(averageMatch([80, null, 90, undefined]), 85);
  assert.equal(averageMatch([null, undefined]), null);
});

test("criteriaForPrompt použije tému a kľúčové body, keď nič nie je vybrané", () => {
  assert.match(criteriaForPrompt([]), /Dodržanie témy/);
  assert.match(criteriaForPrompt(["facts"]), /Presnosť faktov/);
  assert.doesNotMatch(criteriaForPrompt(["facts"]), /Dodržanie témy/);
});

test("materialsAsContext nemá text o firme", () => {
  assert.equal(materialsAsContext(EMPTY_MATERIALS).about, "");
});

test("prompt obsahuje materiály tímu len v prehľade", () => {
  const base = { sentences: ["Ahoj."], audience: "x", targetSeconds: 60, durationMs: 60_000, language: "Slovak", feedbackLocale: "sk" as const, outline: null, context: null };
  const team = { facts: "Cena je 10 eur.", criteria: "- Presnosť faktov" };
  assert.match(buildSpeechPrompt({ ...base, part: "overview", team }), /Cena je 10 eur\./);
  assert.match(buildSpeechPrompt({ ...base, part: "overview", team }), /materialsMatch/);
  assert.doesNotMatch(buildSpeechPrompt({ ...base, part: "sentences", team }), /Cena je 10 eur\./);
  assert.doesNotMatch(buildSpeechPrompt({ ...base, part: "overview" }), /materialsMatch/);
});
