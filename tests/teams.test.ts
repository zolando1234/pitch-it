import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { adminDb } from "../src/lib/store/db.ts";
import { resetMemoryKv } from "../src/lib/store/kv.ts";
import { inviteBlocker, inviteEmail, minPaidSeats, parseInviteEmails, seatsLeft, TEAM_MAX_MEMBERS } from "../src/lib/teams/core.ts";
import { acceptInvite, billingUserId, createInvites, createTeam, deleteTeam, getMembership, listInvites, listTeamMembers, removeMember } from "../src/lib/db/teams.ts";
import { consumeSpeech, getPaidSeats, getPitchBalance } from "../src/lib/db/pitch-wallet.ts";

const OWNER = "00000000-0000-4000-8000-0000000000a1";
const MEMBER = "00000000-0000-4000-8000-0000000000b2";
const OTHER = "00000000-0000-4000-8000-0000000000c3";

async function seedUser(id: string, email: string) {
  await adminDb().from("auth_users").insert({ id, email, password_hash: null });
  await adminDb().from("profiles").insert({ id, display_name: null });
}

test("e-maily z poľa pozvánok: oddeľovače, duplicity, chybné", () => {
  const parsed = parseInviteEmails("Jana@Firma.sk, peter@firma.sk;\n<eva@firma.sk>  jana@firma.sk nie-email");
  assert.deepEqual(parsed.valid, ["jana@firma.sk", "peter@firma.sk", "eva@firma.sk"]);
  assert.deepEqual(parsed.invalid, ["nie-email"]);
  assert.deepEqual(parseInviteEmails("  \n ").valid, []);
});

test("koho netreba pozývať a koľko miest ostáva", () => {
  const ctx = { ownerEmail: "Sef@firma.sk", memberEmails: ["jana@firma.sk"], invitedEmails: ["eva@firma.sk"] };
  assert.equal(inviteBlocker("sef@firma.sk", ctx), "self");
  assert.equal(inviteBlocker("jana@firma.sk", ctx), "member");
  assert.equal(inviteBlocker("eva@firma.sk", ctx), "invited");
  assert.equal(inviteBlocker("novy@firma.sk", ctx), null);
  assert.equal(seatsLeft(3, 2), TEAM_MAX_MEMBERS - 5);
  assert.equal(seatsLeft(TEAM_MAX_MEMBERS, 4), 0);
});

test("platený plán: pozvať sa dá len do počtu zaplatených účtov", () => {
  // 5 účtov = vlastník + 4; 2 členovia a 1 pozvánka → ešte 1
  assert.equal(seatsLeft(2, 1, 5), 1);
  assert.equal(seatsLeft(4, 0, 5), 0);
  // starší tím s viac členmi ako účtov: nikoho ďalšieho
  assert.equal(seatsLeft(6, 0, 1), 0);
  // bez plánu (Free) len limit tímu
  assert.equal(seatsLeft(2, 1, null), TEAM_MAX_MEMBERS - 3);
  // viac účtov ako limit tímu nepomôže
  assert.equal(seatsLeft(0, 0, 500), TEAM_MAX_MEMBERS);
  assert.equal(minPaidSeats(0, 0), 1);
  assert.equal(minPaidSeats(3, 2), 6);
});

test("text pozvánky obsahuje tím, pozývajúceho a odkaz", () => {
  const sk = inviteEmail({ teamName: "Acme", inviter: "Matej", link: "https://pitchit.live/pozvanka?t=x", locale: "sk" });
  assert.match(sk.subject, /Matej.*Acme/);
  assert.match(sk.text, /https:\/\/pitchit\.live\/pozvanka\?t=x/);
  assert.match(inviteEmail({ teamName: "Acme", inviter: "M", link: "L", locale: "en" }).subject, /invited you/);
});

describe("firemný tím v úložisku", () => {
  beforeEach(async () => {
    resetMemoryKv();
    await seedUser(OWNER, "sef@firma.sk");
    await seedUser(MEMBER, "jana@firma.sk");
    await seedUser(OTHER, "cudzi@iny.sk");
  });

  async function teamWithMember() {
    const created = await createTeam(OWNER, "Acme");
    assert.ok(created.ok);
    const [invite] = await createInvites(created.team.id, ["Jana@firma.sk"]);
    const accepted = await acceptInvite(invite.id, { id: MEMBER, email: "jana@firma.sk" });
    assert.ok(accepted.ok);
    return created.team;
  }

  test("jeden tím na vlastníka, pozvánka na e-mail len raz", async () => {
    const first = await createTeam(OWNER, "Acme");
    assert.ok(first.ok);
    assert.deepEqual(await createTeam(OWNER, "Druhý"), { ok: false, reason: "exists" });
    const created = await createInvites(first.team.id, ["jana@firma.sk", "jana@firma.sk", "eva@firma.sk"]);
    assert.equal(created.length, 2);
    assert.equal((await createInvites(first.team.id, ["eva@firma.sk"])).length, 0);
  });

  test("prijatie pozvánky: iba pozvaný e-mail, potom je členom a pozvánka zmizne", async () => {
    const created = await createTeam(OWNER, "Acme");
    assert.ok(created.ok);
    const [invite] = await createInvites(created.team.id, ["jana@firma.sk"]);
    assert.deepEqual(await acceptInvite(invite.id, { id: OTHER, email: "cudzi@iny.sk" }), { ok: false, reason: "wrong_email" });
    assert.ok((await acceptInvite(invite.id, { id: MEMBER, email: "JANA@firma.sk" })).ok);
    assert.equal((await getMembership(MEMBER))?.team.id, created.team.id);
    assert.equal((await listInvites(created.team.id)).length, 0);
    assert.deepEqual(await acceptInvite(invite.id, { id: MEMBER, email: "jana@firma.sk" }), { ok: false, reason: "invalid" });
  });

  test("vlastník iného tímu ani člen iného tímu sa nepridá", async () => {
    const team = await teamWithMember();
    const other = await createTeam(OTHER, "Iný");
    assert.ok(other.ok);
    const [toMember] = await createInvites(other.team.id, ["jana@firma.sk"]);
    assert.deepEqual(await acceptInvite(toMember.id, { id: MEMBER, email: "jana@firma.sk" }), { ok: false, reason: "other_team" });
    const [toOwner] = await createInvites(team.id, ["cudzi@iny.sk"]);
    assert.deepEqual(await acceptInvite(toOwner.id, { id: OTHER, email: "cudzi@iny.sk" }), { ok: false, reason: "owner_elsewhere" });
    assert.deepEqual(await createTeam(MEMBER, "Vlastný"), { ok: false, reason: "member_elsewhere" });
  });

  test("člen má vlastných 10 minút a až potom míňa plán vlastníka (Pro)", async () => {
    await teamWithMember();
    await adminDb().from("subscriptions").insert({ user_id: OWNER, plan: "pro", status: "active" });
    assert.equal(await billingUserId(MEMBER), OWNER);
    const before = await getPitchBalance(MEMBER);
    assert.equal(before.plan, "pro");
    assert.equal(before.freeSecondsLeft, 600);
    await consumeSpeech(MEMBER, 600); // celé z vlastných minút
    assert.equal((await getPitchBalance(OWNER)).weekly?.usedSeconds, 0);
    assert.equal((await getPitchBalance(MEMBER)).freeSecondsLeft, 0);
    await consumeSpeech(MEMBER, 300); // už z plánu vlastníka
    assert.equal((await getPitchBalance(OWNER)).weekly?.usedSeconds, 300);
    const own = await adminDb().from("usage_events").select("*").eq("user_id", MEMBER);
    assert.equal((own.data as unknown[]).length, 0);
  });

  test("tímový Pro za 3 účty: spoločný limit 3 × 60 minút týždenne", async () => {
    await teamWithMember();
    await adminDb().from("subscriptions").insert({ user_id: OWNER, plan: "pro", status: "active", seats: 3 });
    assert.equal(await getPaidSeats(OWNER), 3);
    assert.equal((await getPitchBalance(OWNER)).weekly?.limitSeconds, 3 * 3600);
    assert.equal((await getPitchBalance(MEMBER)).weekly?.limitSeconds, 3 * 3600);
    await consumeSpeech(OWNER, 3600 + 600); // viac ako jeden účet, stále bez dokúpených minút
    const after = await getPitchBalance(OWNER);
    assert.equal(after.weekly?.usedSeconds, 4200);
    assert.ok(after.canPitch);
  });

  test("bez plánu nie sú zaplatené účty, starší riadok bez seats = 1 účet", async () => {
    assert.equal(await getPaidSeats(OWNER), null);
    await adminDb().from("subscriptions").insert({ user_id: OWNER, plan: "unlimited", status: "active" });
    assert.equal(await getPaidSeats(OWNER), 1);
  });

  test("prejav presahujúci vlastné minúty sa rozdelí medzi člena a plán", async () => {
    await teamWithMember();
    await adminDb().from("subscriptions").insert({ user_id: OWNER, plan: "pro", status: "active" });
    await consumeSpeech(MEMBER, 900);
    assert.equal((await getPitchBalance(MEMBER)).freeSecondsLeft, 0);
    assert.equal((await getPitchBalance(OWNER)).weekly?.usedSeconds, 300);
  });

  test("Unlimited vlastník: člen aj tak míňa najprv svoje minúty", async () => {
    await teamWithMember();
    await adminDb().from("subscriptions").insert({ user_id: OWNER, plan: "unlimited", status: "active" });
    await consumeSpeech(MEMBER, 240);
    assert.equal((await getPitchBalance(MEMBER)).freeSecondsLeft, 360);
    assert.equal((await getPitchBalance(MEMBER)).maxSeconds, 3600);
  });

  test("Free vlastník: člen má vlastných 10 minút, vlastníkove sa nemíňajú", async () => {
    await teamWithMember();
    await consumeSpeech(MEMBER, 240);
    assert.equal((await getPitchBalance(MEMBER)).freeSecondsLeft, 360);
    assert.equal((await getPitchBalance(OWNER)).freeSecondsLeft, 600);
    await consumeSpeech(MEMBER, 360);
    assert.equal((await getPitchBalance(MEMBER)).canPitch, false);
    assert.equal((await getPitchBalance(OWNER)).canPitch, true);
  });

  test("odobratie a zrušenie tímu: člen opäť platí sám, účet ostáva", async () => {
    const team = await teamWithMember();
    assert.equal((await listTeamMembers(team.id)).length, 1);
    await removeMember(team.id, MEMBER);
    assert.equal(await billingUserId(MEMBER), MEMBER);

    const again = await createInvites(team.id, ["jana@firma.sk"]);
    assert.ok((await acceptInvite(again[0].id, { id: MEMBER, email: "jana@firma.sk" })).ok);
    await deleteTeam(team.id);
    assert.equal(await getMembership(MEMBER), null);
    const account = await adminDb().from("auth_users").select("id").eq("id", MEMBER).maybeSingle();
    assert.ok(account.data);
  });
});
