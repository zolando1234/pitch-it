import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { PROMO_CODES, promoErrorMessage, resolvePromo, stackedPercent, type PromoCode } from "../src/lib/billing/promo.ts";

describe("zľavové kódy", () => {
  test("TESTER: −60 % na jednu mesačnú platbu", () => {
    const tester = PROMO_CODES.find((c) => c.code === "TESTER");
    assert.ok(tester);
    assert.equal(tester.percentOff, 60);
    assert.equal(tester.interval, "month");
    const result = resolvePromo("tester", "month", false);
    assert.deepEqual(result, { ok: true, promo: tester });
    assert.deepEqual(resolvePromo("  Tester ", "month", false), { ok: true, promo: tester });
  });

  test("bez kódu nič, neznámy alebo vypnutý kód neplatí", () => {
    assert.equal(resolvePromo(undefined, "month", false), null);
    assert.equal(resolvePromo("   ", "month", false), null);
    assert.equal(resolvePromo(42, "month", false), null);
    assert.deepEqual(resolvePromo("NIECO", "month", false), { ok: false, reason: "unknown" });
    const off: PromoCode[] = [{ code: "TESTER", percentOff: 60, interval: "month", active: false, couponId: "x" }];
    assert.deepEqual(resolvePromo("TESTER", "month", false, off), { ok: false, reason: "unknown" });
  });

  test("len mesačne a len na prvé predplatné", () => {
    assert.deepEqual(resolvePromo("TESTER", "year", false), { ok: false, reason: "wrong_interval" });
    assert.deepEqual(resolvePromo("TESTER", "month", true), { ok: false, reason: "already_subscribed" });
    assert.equal(promoErrorMessage("wrong_interval"), "Tento kód platí len na mesačné predplatné.");
    assert.equal(promoErrorMessage("unknown", "en"), "This discount code is not valid.");
  });

  test("náhľad ceny: kód sa overí bez obdobia", () => {
    const tester = PROMO_CODES.find((c) => c.code === "TESTER");
    assert.deepEqual(resolvePromo("tester", null, false), { ok: true, promo: tester });
    assert.deepEqual(resolvePromo("tester", null, true), { ok: false, reason: "already_subscribed" });
  });

  test("TESTER pre tím: prvá platba má tímovú zľavu aj kód", () => {
    assert.equal(stackedPercent(60, 0), 60);
    assert.equal(stackedPercent(60, 10), 64);
    assert.equal(stackedPercent(60, 13), 65.2);
    assert.equal(stackedPercent(60, 15), 66);
    // 5 účtov Pro mesačne: 50 € − 10 % = 45 €, s kódom 18 €
    assert.equal(Math.round(5000 * (1 - stackedPercent(60, 10) / 100)), 1800);
  });
});
