import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  afterFreeSpeech,
  balanceFor,
  balanceLabel,
  canUseLength,
  fitLength,
  formatEur,
  isValidLength,
  lengthLabel,
  pitchBalance,
  proWeeklyLimit,
  topupAfter,
} from "../src/lib/billing/pitch-pack.ts";
import {
  activePlan,
  chargeCents,
  FREE_SECONDS,
  nextWeekStart,
  priceLookupKey,
  PRO_WEEKLY_SECONDS,
  parseSeats,
  SUBSCRIBER_DISCOUNT_PERCENT,
  TEAM_MAX_SEATS,
  teamChargeCents,
  teamDiscountPercent,
  TOPUP,
  topupCentsPerMinute,
  topupMinutesFor,
  topupPrice,
  discountPercentFor,
  weekStart,
  yearlySavingPercent,
} from "../src/lib/billing/pricing.ts";

describe("cenník", () => {
  test("Pro 10 €/mes alebo 8 €/mes ročne, Unlimited 25 € alebo 18 € ročne", () => {
    assert.equal(chargeCents("pro", "month"), 1000);
    assert.equal(chargeCents("pro", "year"), 9600);
    assert.equal(chargeCents("unlimited", "month"), 2500);
    assert.equal(chargeCents("unlimited", "year"), 21600);
    assert.equal(yearlySavingPercent("pro"), 20);
    assert.equal(priceLookupKey("unlimited", "year"), "pitchit_unlimited_year");
    assert.equal(formatEur(800), "8 €");
    assert.equal(formatEur(17, "en"), "€0.17");
  });

  test("dokúpené minúty podľa sumy (0,17 €/min)", () => {
    assert.equal(topupMinutesFor(1020), 60);
    assert.equal(topupMinutesFor(170), 10);
    assert.equal(topupMinutesFor(0), 0);
  });

  test("predplatiteľ má na dokúpené minúty zľavu z jednej konštanty", () => {
    assert.equal(SUBSCRIBER_DISCOUNT_PERCENT, 10);
    assert.equal(discountPercentFor("free"), 0);
    assert.equal(discountPercentFor("pro"), SUBSCRIBER_DISCOUNT_PERCENT);
    assert.equal(discountPercentFor("unlimited"), SUBSCRIBER_DISCOUNT_PERCENT);
    assert.equal(topupCentsPerMinute("free"), TOPUP.centsPerMinute);
    assert.equal(topupCentsPerMinute("pro"), 15.3);
    assert.deepEqual(topupPrice(60, "pro"), { fullCents: 1020, cents: 918, discountPercent: 10 });
    assert.deepEqual(topupPrice(60, "free"), { fullCents: 1020, cents: 1020, discountPercent: 0 });
    assert.equal(topupPrice(10, "pro").cents, 153);
    assert.equal(topupPrice(600, "pro").cents, 9180);
  });

  test("minúty zo zľavnenej sumy podľa ceny z Checkoutu", () => {
    const unit = topupCentsPerMinute("pro");
    for (const minutes of [TOPUP.minMinutes, 15, 33, 60, 599, TOPUP.maxMinutes]) {
      assert.equal(topupMinutesFor(topupPrice(minutes, "pro").cents, unit), minutes);
    }
    // staršia platba bez ceny v metadátach alebo nezmyselná cena: plná cena
    assert.equal(topupMinutesFor(1020, undefined), 60);
    assert.equal(topupMinutesFor(1020, Number.NaN), 60);
    assert.equal(topupMinutesFor(1020, 0), 60);
    assert.equal(topupMinutesFor(1020, 99), 60);
  });

  test("tímová zľava: viac ako 1 účet −10 %, viac ako 5 −13 %, viac ako 10 −15 %", () => {
    assert.equal(teamDiscountPercent(1), 0);
    assert.equal(teamDiscountPercent(2), 10);
    assert.equal(teamDiscountPercent(5), 10);
    assert.equal(teamDiscountPercent(6), 13);
    assert.equal(teamDiscountPercent(10), 13);
    assert.equal(teamDiscountPercent(11), 15);
    assert.equal(teamDiscountPercent(TEAM_MAX_SEATS), 15);
    assert.deepEqual(teamChargeCents("pro", "month", 1), { fullCents: 1000, cents: 1000, discountPercent: 0 });
    assert.deepEqual(teamChargeCents("pro", "month", 5), { fullCents: 5000, cents: 4500, discountPercent: 10 });
    assert.deepEqual(teamChargeCents("unlimited", "month", 6), { fullCents: 15000, cents: 13050, discountPercent: 13 });
    assert.deepEqual(teamChargeCents("pro", "year", 11), { fullCents: 105600, cents: 89760, discountPercent: 15 });
  });

  test("počet účtov z požiadavky", () => {
    assert.equal(parseSeats(5), 5);
    assert.equal(parseSeats("12"), 12);
    assert.equal(parseSeats(0), null);
    assert.equal(parseSeats(2.5), null);
    assert.equal(parseSeats(TEAM_MAX_SEATS + 1), null);
    assert.equal(parseSeats(""), null);
    assert.equal(parseSeats(null), null);
  });

  test("týždenný limit Pro a dokúpené minúty rátajú s počtom účtov", () => {
    assert.equal(proWeeklyLimit(), PRO_WEEKLY_SECONDS);
    assert.equal(proWeeklyLimit(4), 4 * PRO_WEEKLY_SECONDS);
    assert.equal(proWeeklyLimit(0), PRO_WEEKLY_SECONDS);
    const team = balanceFor({ plan: "pro", wallet: null, weeklyUsedSeconds: PRO_WEEKLY_SECONDS, seats: 2 });
    assert.equal(team.weekly?.limitSeconds, 2 * PRO_WEEKLY_SECONDS);
    assert.ok(team.canPitch);
    assert.equal(topupAfter({ weeklyUsedSeconds: PRO_WEEKLY_SECONDS, topupSeconds: 600, seconds: 300, seats: 2 }), 600);
    assert.equal(topupAfter({ weeklyUsedSeconds: 2 * PRO_WEEKLY_SECONDS - 100, topupSeconds: 600, seconds: 300, seats: 2 }), 400);
  });

  test("cena so zlomkom centa", () => {
    assert.equal(formatEur(15.3), "0,153 €");
    assert.equal(formatEur(15.3, "en"), "€0.153");
    assert.equal(formatEur(918), "9,18 €");
  });

  test("plán platí len pri aktívnom predplatnom", () => {
    assert.equal(activePlan(null), "free");
    assert.equal(activePlan({ plan: "pro", status: "active" }), "pro");
    assert.equal(activePlan({ plan: "unlimited", status: "past_due" }), "unlimited");
    assert.equal(activePlan({ plan: "pro", status: "canceled" }), "free");
    assert.equal(activePlan({ plan: "free", status: "active" }), "free");
  });

  test("týždeň začína v pondelok", () => {
    const wednesday = new Date("2026-10-21T15:00:00Z");
    assert.equal(weekStart(wednesday).toISOString(), "2026-10-19T00:00:00.000Z");
    assert.equal(nextWeekStart(wednesday).toISOString(), "2026-10-26T00:00:00.000Z");
    assert.equal(weekStart(new Date("2026-10-25T23:59:00Z")).toISOString(), "2026-10-19T00:00:00.000Z");
  });
});

describe("Free: 10 minút zadarmo", () => {
  test("nový používateľ má 10 minút a nahrá aj 10-minútový prejav", () => {
    const balance = pitchBalance(null);
    assert.equal(balance.freeSecondsLeft, FREE_SECONDS);
    assert.equal(balance.maxSeconds, FREE_SECONDS);
    assert.ok(balance.canPitch);
    assert.equal(canUseLength(600, balance), true);
    assert.equal(canUseLength(660, balance), false);
  });

  test("minúty sa odpočítavajú podľa skutočnej dĺžky, potom je koniec", () => {
    let wallet = afterFreeSpeech(null, 240);
    assert.equal(pitchBalance(wallet).freeSecondsLeft, 360);
    wallet = afterFreeSpeech(wallet, 350);
    const balance = pitchBalance(wallet);
    assert.equal(balance.freeSecondsLeft, 10);
    assert.equal(balance.canPitch, false);
    assert.equal(balanceLabel(pitchBalance(afterFreeSpeech(wallet, 30))), "Minúty zadarmo sú minuté.");
  });

  test("starší kúpený balík: kredit na prejav, ktorý sa do času zadarmo nezmestí", () => {
    const wallet = { free_used: 3, credits: 2, free_seconds_used: 500 };
    assert.equal(pitchBalance(wallet).maxSeconds, 30 * 60);
    assert.deepEqual(afterFreeSpeech(wallet, 60), { ...wallet, free_seconds_used: 560 });
    assert.deepEqual(afterFreeSpeech(wallet, 600), { ...wallet, credits: 1 });
  });
});

describe("Pro a Unlimited", () => {
  test("Pro: 60 min týždenne, potom dokúpené minúty", () => {
    const fresh = balanceFor({ plan: "pro", wallet: null, weeklyUsedSeconds: 0 });
    assert.equal(fresh.maxSeconds, 30 * 60);
    const late = balanceFor({ plan: "pro", wallet: { free_used: 0, credits: 0, topup_seconds: 120 }, weeklyUsedSeconds: PRO_WEEKLY_SECONDS - 300 });
    assert.equal(late.maxSeconds, 420);
    assert.equal(balanceLabel(late), "Tento týždeň zostáva 5 z 60 min, k tomu 2 dokúpených min.");
    const empty = balanceFor({ plan: "pro", wallet: null, weeklyUsedSeconds: PRO_WEEKLY_SECONDS });
    assert.equal(empty.canPitch, false);
  });

  test("dokúpené minúty sa míňajú až po týždennom limite", () => {
    assert.equal(topupAfter({ weeklyUsedSeconds: 0, topupSeconds: 600, seconds: 300 }), 600);
    assert.equal(topupAfter({ weeklyUsedSeconds: PRO_WEEKLY_SECONDS - 100, topupSeconds: 600, seconds: 300 }), 400);
    assert.equal(topupAfter({ weeklyUsedSeconds: PRO_WEEKLY_SECONDS, topupSeconds: 100, seconds: 300 }), 0);
  });

  test("Unlimited bez limitu", () => {
    const balance = balanceFor({ plan: "unlimited", wallet: null, weeklyUsedSeconds: 99_999 });
    assert.ok(balance.canPitch);
    assert.equal(balance.maxSeconds, 60 * 60);
    assert.equal(canUseLength(60 * 60, balance), true);
    // Pro a Free ostávajú pri 30 minútach
    assert.equal(canUseLength(45 * 60, balanceFor({ plan: "pro", wallet: null, weeklyUsedSeconds: 0 })), false);
    assert.equal(canUseLength(45 * 60, pitchBalance({ free_used: 0, credits: 3 })), false);
  });
});

describe("dĺžka prejavu", () => {
  test("platné dĺžky a skrátenie podľa zostatku", () => {
    assert.equal(isValidLength(30), true);
    assert.equal(isValidLength(600), true);
    assert.equal(isValidLength(90), false);
    assert.equal(isValidLength(31 * 60), true); // platné, no dovolí ho len Unlimited
    assert.equal(isValidLength(61 * 60), false);
    assert.equal(canUseLength(240, null), true);
    const sevenMinutes = balanceFor({ plan: "pro", wallet: null, weeklyUsedSeconds: PRO_WEEKLY_SECONDS - 7 * 60 - 20 });
    assert.equal(fitLength(600, sevenMinutes), 420);
    assert.equal(fitLength(180, sevenMinutes), 180);
    const twoMinutes = pitchBalance({ free_used: 0, credits: 0, free_seconds_used: FREE_SECONDS - 150 });
    assert.equal(fitLength(600, twoMinutes), 120);
    assert.equal(lengthLabel(240), "4 min");
    assert.equal(lengthLabel(30), "30 s");
  });
});

describe("člen firemného tímu", () => {
  const paidPro = balanceFor({ plan: "pro", wallet: null, weeklyUsedSeconds: PRO_WEEKLY_SECONDS - 120 });

  test("vlastné minúty sa pripočítajú k plánu vlastníka", async () => {
    const { memberBalance, splitMemberSpeech } = await import("../src/lib/billing/pitch-pack.ts");
    const fresh = memberBalance(paidPro, null);
    assert.equal(fresh.freeSecondsLeft, 600);
    assert.equal(fresh.maxSeconds, 120 + 600);
    assert.equal(memberBalance(paidPro, { free_used: 0, credits: 0, free_seconds_used: 600 }).maxSeconds, 120);
    assert.equal(splitMemberSpeech(900, 0).fromPlan, 300);
    assert.deepEqual(splitMemberSpeech(100, 550), { fromOwnFree: 50, fromPlan: 50 });
  });

  test("keď vlastník plán nemá, člen je ako Free so svojimi minútami", async () => {
    const { memberBalance } = await import("../src/lib/billing/pitch-pack.ts");
    const ownerFree = pitchBalance(null);
    const member = memberBalance(ownerFree, { free_used: 0, credits: 0, free_seconds_used: 590 });
    assert.equal(member.plan, "free");
    assert.equal(member.canPitch, false);
  });
});
