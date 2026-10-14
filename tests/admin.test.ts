import assert from "node:assert/strict";
import { test } from "node:test";
import { isAdminEmail } from "../src/lib/admin/access.ts";
import { buildAdminOverview, type AdminRaw } from "../src/lib/admin/overview.ts";

const now = new Date("2026-10-14T12:00:00Z");
const ago = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

test("administrácia: platení, minuté zadarmo, aktivácia a tržby", () => {
  const raw: AdminRaw = {
    users: [
      { id: "a", email: "a@x.sk", created_at: ago(1), provider: "email" },
      { id: "b", email: "b@x.sk", created_at: ago(10), provider: "google" },
      { id: "c", email: "c@x.sk", created_at: ago(40), provider: "email" },
    ],
    profiles: [{ id: "a", display_name: "Anna" }],
    wallets: [
      { user_id: "a", free_used: 1, credits: 0 },
      { user_id: "b", free_used: 3, credits: 0 },
      { user_id: "c", free_used: 3, credits: 7 },
    ],
    attempts: [
      { user_id: "a", created_at: ago(1), status: "ready", with_camera: true, language: "sk", target_seconds: 60, duration_ms: 60_000, content_score: 5, qa: { version: 1 } },
      { user_id: "c", created_at: ago(2), status: "ready", with_camera: false, language: "en", target_seconds: 60, duration_ms: 120_000, content_score: null, qa: null },
      { user_id: "c", created_at: ago(3), status: "failed", with_camera: false, language: "en", target_seconds: 60, duration_ms: null, content_score: null, qa: null },
    ],
    purchases: [{ user_id: "c", created_at: ago(5), amount: 100, credits: 10 }],
    checkouts: [{ user_id: "c", created_at: ago(5) }, { user_id: "b", created_at: ago(4) }],
    contexts: [{ user_id: "a", documents: 1, hasAbout: false }],
  };
  const o = buildAdminOverview(raw, now);
  assert.deepEqual(o.users, { total: 3, last7: 1, last30: 2 });
  assert.equal(o.activation.withPitch, 2);
  assert.equal(o.pitches.total, 2);
  assert.equal(o.pitches.failed, 1);
  assert.equal(o.pitches.withQa, 1);
  assert.equal(o.pitches.avgMinutes, 1.5);
  assert.equal(o.paying.users, 1);
  assert.equal(o.paying.revenueCents, 100);
  assert.equal(o.paying.freeUsedUp, 1);
  assert.deepEqual(o.rows.map((r) => [r.email, r.plan]), [["a@x.sk", "free"], ["b@x.sk", "free_used_up"], ["c@x.sk", "paid"]]);
  assert.equal(o.daily.length, 30);
  assert.equal(o.daily.at(-2)?.pitches, 1);
  assert.equal(o.documentsUsers, 1);
  // vývoj: dnes všetci 3, aktívni za 7 dní 2 (a, c), opakovane platiaci zatiaľ nikto (c zaplatil raz)
  assert.equal(o.growth.length, 90);
  assert.deepEqual(o.growth.at(-1), { date: "2026-10-14", total: 3, active: 2, repeatPayers: 0 });
  assert.deepEqual(o.now, { active: 2, repeatPayers: 0 });
  // pred 20 dňami: len c registrovaný, nikto aktívny
  assert.equal(o.growth.at(-21)?.total, 1);

  const again = buildAdminOverview({ ...raw, purchases: [...raw.purchases, { user_id: "c", created_at: ago(1), amount: 100, credits: 10 }] }, now);
  assert.equal(again.now.repeatPayers, 1);
  assert.equal(again.growth.at(-3)?.repeatPayers, 0);
});

test("administrátor podľa e-mailu (bez ohľadu na veľké písmená)", () => {
  assert.equal(isAdminEmail("Matohustak2401@gmail.com"), true);
  assert.equal(isAdminEmail("niekto@iny.sk"), false);
  assert.equal(isAdminEmail(null), false);
});
