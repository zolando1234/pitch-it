import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DRILLS, DrillTracker, ruleFilterFor, TALK_MODES } from "../src/lib/coach/modes.ts";
import { FeedbackEngine } from "../src/lib/coach/pose/feedback.ts";
import { RULES, RULE_BY_ID } from "../src/lib/coach/pose/rules.ts";
import { legsPose } from "../src/lib/coach/pose/metrics.ts";
import { computeFinalScore, gradeFor } from "../src/lib/coach/pose/scoring.ts";
import { SessionRecorder } from "../src/lib/coach/pose/session.ts";
import { finalScoreFor, fromStoredCoach, parseStoredCoach, toStoredCoach } from "../src/lib/coach/stored.ts";
import { summarizeBody } from "../src/lib/pitch/body.ts";
import { buildFeedback, FEEDBACK_FIXTURE } from "../src/lib/pitch/feedback.ts";
import { PREVIEW_COACH } from "../src/lib/preview/coach.ts";
import type { PitchAttemptRow } from "../src/lib/db/types.ts";

const idleFb = { status: "good" as const, title: "", tip: "", ruleId: null, activeIds: [] as string[], score: 80, highlight: null };

describe("tréner reči tela – pravidlá a režimy", () => {
  test("každé pravidlo má jedinečné id, slovenský názov a radu", () => {
    assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
    for (const rule of RULES) {
      assert.ok(rule.title.length > 0 && rule.tip.length > 0, rule.id);
      assert.doesNotMatch(rule.tip, /\b(the|your|and)\b/, `anglický text v pravidle ${rule.id}`);
    }
  });

  test("cvičenie sa sústredí len na svoje pravidlá a nastavenie záberu", () => {
    const drill = DRILLS[0];
    const filter = ruleFilterFor(drill, false);
    for (const id of drill.focusRules) assert.ok(filter(id), id);
    assert.ok(filter("too-close"));
    const unrelated = RULES.find((r) => !drill.focusRules.includes(r.id) && r.group !== "setup" && r.id !== "mic-away")!;
    assert.equal(filter(unrelated.id), false);
  });

  test("pri telepromptri sa nehodnotí pohľad stále do stredu", () => {
    assert.equal(ruleFilterFor(TALK_MODES[0], true)("gaze-stuck"), false);
    assert.equal(ruleFilterFor(TALK_MODES[0], false)("gaze-stuck"), true);
  });

  test("počítanie zvýraznení v cvičení", () => {
    const drill = DRILLS.find((d) => d.measure.type === "highlight-count")!;
    const tracker = new DrillTracker(drill);
    const highlight = drill.measure.type === "highlight-count" ? drill.measure.highlight : null;
    for (let i = 0; i < drill.target; i++) tracker.update(null, { ...idleFb, highlight }, 100);
    assert.equal(tracker.progress().passed, true);
    assert.equal(tracker.progress().ratio, 1);
  });

  test("bez človeka v zábere tréner čaká a vyzve postaviť sa pred kameru", () => {
    const fb = new FeedbackEngine().idle();
    assert.equal(fb.status, "idle");
    assert.equal(fb.title, "Postav sa pred kameru");
  });

  test("známky sú po slovensky", () => {
    assert.equal(gradeFor(98).grade, "A+");
    assert.equal(gradeFor(40).label, "Treba zapracovať");
  });
});

describe("tréner reči tela – nohy", () => {
  // rečník čelom ku kamere: jeho ľavé rameno (a ľavá noha) má v obraze väčšie x
  const sw = 200;
  const facing = 1;
  const pt = (x: number, y: number) => ({ x, y });

  test("rozkročený postoj je v poriadku", () => {
    const legs = legsPose({ leftKnee: pt(560, 700), rightKnee: pt(440, 700), leftAnkle: pt(570, 900), rightAnkle: pt(430, 900) }, sw, facing);
    assert.deepEqual(legs, { legsVisible: true, legsCrossed: false, narrowStance: false });
  });

  test("prekrížené členky aj kolená sa rozpoznajú", () => {
    const ankles = legsPose({ leftKnee: pt(520, 700), rightKnee: pt(480, 700), leftAnkle: pt(450, 900), rightAnkle: pt(550, 900) }, sw, facing);
    assert.equal(ankles.legsCrossed, true);
    const knees = legsPose({ leftKnee: pt(460, 700), rightKnee: pt(540, 700), leftAnkle: null, rightAnkle: null }, sw, facing);
    assert.equal(knees.legsCrossed, true);
    assert.equal(RULE_BY_ID["legs-crossed"].severity, "bad");
  });

  test("chodidlá tesne pri sebe sú upozornenie, nie prekríženie", () => {
    const legs = legsPose({ leftKnee: pt(515, 700), rightKnee: pt(485, 700), leftAnkle: pt(515, 900), rightAnkle: pt(490, 900) }, sw, facing);
    assert.equal(legs.narrowStance, true);
    assert.equal(legs.legsCrossed, false);
  });

  test("bez kolien v zábere alebo pri natočení bokom nohy nehodnotíme", () => {
    assert.equal(legsPose({ leftKnee: null, rightKnee: null, leftAnkle: null, rightAnkle: null }, sw, facing).legsVisible, false);
    const sideways = legsPose({ leftKnee: pt(460, 700), rightKnee: pt(540, 700), leftAnkle: pt(450, 900), rightAnkle: pt(550, 900) }, sw, 0);
    assert.equal(sideways.legsCrossed, false);
  });
});

describe("tréner reči tela – uloženie k pokusu", () => {
  test("záznam chyby z relácie, bez fotiek pri uložení", () => {
    const rec = new SessionRecorder();
    rec.begin(0);
    for (let t = 0; t <= 4_000; t += 100) {
      const active = t >= 1_000 && t < 3_000 ? ["crossed"] : [];
      rec.record(t, { ...idleFb, status: active.length ? "bad" : "good", activeIds: active }, null, () => "data:image/jpeg;base64,xx");
    }
    const summary = rec.summary();
    assert.equal(summary.mistakes.length, 1);
    assert.equal(summary.mistakes[0].id, "crossed");
    assert.ok(summary.mistakes[0].snapshot);

    const stored = toStoredCoach(summary, { teleprompter: false, micMode: false });
    assert.equal("snapshot" in stored.summary.mistakes[0], false);
    assert.doesNotMatch(JSON.stringify(stored), /data:image/);
    const parsed = parseStoredCoach(JSON.parse(JSON.stringify(stored)));
    assert.ok(parsed);
    assert.equal(fromStoredCoach(parsed).mistakes[0].snapshot, null);
  });

  test("dlhý priebeh sa pri uložení zmenší", () => {
    const rec = new SessionRecorder();
    rec.begin(0);
    for (let t = 0; t <= 180_000; t += 50) rec.record(t, idleFb, null);
    const stored = toStoredCoach(rec.summary(), { teleprompter: false, micMode: false });
    assert.ok(stored.summary.timeline.length <= 300);
    assert.ok(parseStoredCoach(stored));
  });

  test("neplatný záznam sa zahodí", () => {
    assert.equal(parseStoredCoach({ version: 1 }), null);
    assert.equal(parseStoredCoach(null), null);
  });

  test("skóre ukážky je rovnaké ako priamy výpočet", () => {
    const final = finalScoreFor(PREVIEW_COACH);
    assert.ok(final.total !== null && final.total > 0 && final.total <= 100);
    assert.deepEqual(final, computeFinalScore(fromStoredCoach(PREVIEW_COACH), ruleFilterFor(TALK_MODES[0], false)));
    for (const issue of PREVIEW_COACH.summary.issues) assert.ok(RULE_BY_ID[issue.id], issue.id);
  });

  test("feedback prečíta súhrn trénera z pokusu", () => {
    const attempt = {
      id: "a",
      audience: "investor",
      target_seconds: 60,
      focus: "tempo",
      duration_ms: 60_000,
      metrics: null,
      content: null,
      body: { ...summarizeBody([]), coach: PREVIEW_COACH },
      shared_at: null,
    } as unknown as PitchAttemptRow;
    const data = buildFeedback(attempt, { number: 1, retryHref: "/app/nahravka/kamera" });
    assert.deepEqual(data.coach, PREVIEW_COACH);
    assert.equal(data.body, null);
    assert.ok(FEEDBACK_FIXTURE.coach);
  });
});
