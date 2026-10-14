import assert from "node:assert/strict";
import { test } from "node:test";
import { applyRoles, buildRolesPrompt, dialogForPrompt, meetingToQa, rolesFromCodes, speakerCodes } from "../src/lib/pitch/meeting-dialog.ts";
import { mergeSegments, speakerTurns } from "../src/lib/pitch/segment-merge.ts";

const seg = (index: number, offsetMs: number, words: Array<[string, string]>) => ({
  index,
  offsetMs,
  text: words.map((w) => w[0]).join(" "),
  words: words.map(([word, speaker], i) => ({ word, start: i, end: i + 0.5, speaker })),
  provider: "elevenlabs",
});

test("rečníci sa označia po úsekoch a rozhovor sa rozdelí na teba a klienta", () => {
  const merged = mergeSegments([
    seg(0, 0, [["Dobrý", "speaker_0"], ["deň.", "speaker_0"], ["Koľko", "speaker_1"], ["to", "speaker_1"], ["stojí?", "speaker_1"]]),
    // v ďalšom úseku má ten istý človek iné označenie
    seg(1, 30_000, [["Stojí", "speaker_1"], ["dvadsať", "speaker_1"], ["eur.", "speaker_1"]]),
  ]);
  const turns = speakerTurns(merged.words);
  assert.deepEqual(turns.map((t) => t.label), ["s0:speaker_0", "s0:speaker_1", "s1:speaker_1"]);
  assert.match(buildRolesPrompt(turns, "PitchIt"), /\[R2\] Koľko to stojí\?/);

  // AI odpovedá kódmi (aj s drobnou odchýlkou v zápise)
  const roles = rolesFromCodes(speakerCodes(turns), [
    { label: "R1", role: "me" },
    { label: "[r2]", role: "client" },
    { label: "R3", role: "me" },
  ]);
  const { mine, dialog } = applyRoles(merged.words, roles);
  assert.equal(mine.map((w) => w.word).join(" "), "Dobrý deň. Stojí dvadsať eur.");
  assert.deepEqual(dialog.map((d) => d.role), ["me", "client", "me"]);
  assert.equal(dialogForPrompt(dialog), "TY: Dobrý deň.\nKLIENT: Koľko to stojí?\nTY: Stojí dvadsať eur.");
});

test("reakcie na klienta sa zobrazia ako Q&A s priemerom", () => {
  const qa = meetingToQa(
    {
      summary: "Dobré stretnutie.",
      reactions: [
        { client: "Koľko to stojí?", response: "Dvadsať eur.", score: 8, strength: "Priamo.", improve: "Dodaj hodnotu." },
        { client: "A konkurencia?", response: "(bez odpovede)", score: 2, strength: "", improve: "Odpovedz." },
      ],
    },
    "sk",
  );
  assert.equal(qa.score, 5);
  assert.equal(qa.summary, "Dobré stretnutie.");
  assert.equal(qa.answers[0].question, "Koľko to stojí?");
});
