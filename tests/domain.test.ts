import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, test } from "node:test";
import JSZip from "jszip";
import { checkEntitlement, effectivePlan, emptyUsage, PLANS, sessionSecondsAllowed } from "../src/lib/billing/plans.ts";
import { mapSubscriptionStatus, verifyWebhookSignature } from "../src/lib/billing/stripe.ts";
import { extractPptx, PptxError } from "../src/lib/documents/extract-pptx.ts";
import { checkUploadRequest, sanitizeFileName, sniffDocumentKind } from "../src/lib/documents/file-check.ts";
import { createSessionSchema, projectSchema } from "../src/lib/validation/schemas.ts";
import { signUpSchema } from "../src/lib/auth/schemas.ts";

describe("plány a limity", () => {
  test("realtime: aspoň 30 s zostatku, inak limit", () => {
    const usage = emptyUsage();
    usage.realtime_seconds = PLANS.free.limits.realtimeMinutes * 60 - 20;
    assert.equal(checkEntitlement(PLANS.free, usage, "realtime_seconds").allowed, false);
    usage.realtime_seconds = 0;
    assert.deepEqual(checkEntitlement(PLANS.free, usage, "realtime_seconds"), { allowed: true, remaining: 1_200 });
  });

  test("Pro platí iba pri aktívnom predplatnom", () => {
    assert.equal(effectivePlan({ plan: "pro", status: "active" }).id, "pro");
    assert.equal(effectivePlan({ plan: "pro", status: "past_due" }).id, "free");
    assert.equal(effectivePlan(null).id, "free");
  });

  test("dĺžka relácie podľa plánu a zostatku", () => {
    assert.equal(sessionSecondsAllowed(PLANS.free, 20, 10_000), PLANS.free.limits.maxSessionMinutes * 60);
    assert.equal(sessionSecondsAllowed(PLANS.pro, 20, 300), 300);
  });

  test("Stripe podpis webhooku", () => {
    const secret = "whsec_test";
    const payload = '{"id":"evt_1"}';
    const t = 1_700_000_000;
    const signature = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
    assert.equal(verifyWebhookSignature(payload, `t=${t},v1=${signature}`, secret, t + 10), true);
    assert.equal(verifyWebhookSignature(payload, `t=${t},v1=${signature}`, secret, t + 1_000), false);
    assert.equal(verifyWebhookSignature(`${payload} `, `t=${t},v1=${signature}`, secret, t), false);
    assert.equal(verifyWebhookSignature(payload, null, secret, t), false);
    assert.equal(mapSubscriptionStatus("unpaid"), "past_due");
    assert.equal(mapSubscriptionStatus("incomplete_expired"), "canceled");
  });
});

describe("podklady", () => {
  test("typ súboru podľa obsahu, nie podľa prípony", () => {
    assert.equal(sniffDocumentKind(new TextEncoder().encode("%PDF-1.7 ...")), "pdf");
    assert.equal(sniffDocumentKind(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])), "pptx");
    assert.equal(sniffDocumentKind(new TextEncoder().encode("<html>")), null);
  });

  test("kontrola nahrávania a bezpečný názov", () => {
    assert.equal(checkUploadRequest({ fileName: "deck.key", size: 10 }).ok, false);
    assert.equal(checkUploadRequest({ fileName: "deck.pdf", size: 30 * 1024 * 1024 }).ok, false);
    assert.equal(sanitizeFileName("../../etc/passwd<x>.pdf"), "passwdx.pdf");
    assert.equal(sanitizeFileName("C:\\Users\\deck final.pptx"), "deck final.pptx");
  });

  test("PPTX: poradie slidov, nadpis, text a poznámky", async () => {
    const zip = new JSZip();
    zip.file("[Content_Types].xml", '<Types><Override ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
    zip.file(
      "ppt/presentation.xml",
      '<p:presentation><p:sldIdLst><p:sldId id="257" r:id="rId3"/><p:sldId id="256" r:id="rId2"/></p:sldIdLst></p:presentation>',
    );
    zip.file(
      "ppt/_rels/presentation.xml.rels",
      '<Relationships><Relationship Id="rId2" Target="slides/slide1.xml"/><Relationship Id="rId3" Target="slides/slide2.xml"/></Relationships>',
    );
    const slide = (title: string, body: string) =>
      `<p:sld><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:sp><p:sp><a:p><a:r><a:t>${body}</a:t></a:r><a:r><a:t> &amp; viac</a:t></a:r></a:p></p:sp></p:sld>`;
    zip.file("ppt/slides/slide1.xml", slide("Trh", "4,2 mld €"));
    zip.file("ppt/slides/slide2.xml", slide("Problém", "Faktúry"));
    zip.file("ppt/slides/_rels/slide2.xml.rels", '<Relationships><Relationship Target="../notesSlides/notesSlide1.xml"/></Relationships>');
    zip.file("ppt/notesSlides/notesSlide1.xml", "<p:notes><a:p><a:r><a:t>Povedať príbeh</a:t></a:r></a:p><a:p><a:r><a:t>2</a:t></a:r></a:p></p:notes>");
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const slides = await extractPptx(bytes);
    assert.deepEqual(
      slides.map((item) => [item.slideNumber, item.title, item.body, item.notes]),
      [
        [1, "Problém", "Faktúry & viac", "Povedať príbeh"],
        [2, "Trh", "4,2 mld € & viac", null],
      ],
    );
  });

  test("PPTX: neplatný súbor", async () => {
    await assert.rejects(extractPptx(new Uint8Array([1, 2, 3])), (error) => error instanceof PptxError && error.code === "invalid");
  });
});



describe("validácia vstupov", () => {
  test("projekt: prázdne polia sú null, suma sa prevedie na číslo", () => {
    const parsed = projectSchema.parse({ name: "  X  ", stage: "seed", raise_amount: "250000", problem: "", raise_currency: "EUR" });
    assert.equal(parsed.name, "X");
    assert.equal(parsed.problem, null);
    assert.equal(parsed.raise_amount, 250_000);
    assert.equal(projectSchema.safeParse({ name: "X", stage: "unicorn" }).success, false);
    assert.equal(projectSchema.safeParse({ name: "X", stage: "seed", raise_amount: "-5" }).success, false);
  });

  test("tréning: iba známe štýly, scenáre a dĺžky", () => {
    const ok = createSessionSchema.safeParse({
      projectId: "11111111-1111-4111-8111-111111111111",
      mode: "coach",
      investorKey: "market",
      scenarioKey: "first_meeting",
      durationMinutes: "12",
    });
    assert.equal(ok.success, true);
    assert.equal(createSessionSchema.safeParse({ projectId: "x", mode: "coach", investorKey: "market", scenarioKey: "first_meeting", durationMinutes: 12 }).success, false);
    assert.equal(createSessionSchema.safeParse({ projectId: "11111111-1111-4111-8111-111111111111", mode: "coach", investorKey: "evil", scenarioKey: "first_meeting", durationMinutes: 12 }).success, false);
  });

  test("registrácia vyžaduje súhlas (podmienky aj vek 18+), typ účtu a silnejšie heslo", () => {
    const base = { email: "Jana@Startup.sk", password: "dostatocne-dlhe", accept_terms: "on", account_type: "organizer" };
    const parsed = signUpSchema.safeParse(base);
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.email, "jana@startup.sk");
    if (parsed.success) assert.equal(parsed.data.account_type, "organizer");
    const fallback = signUpSchema.safeParse({ ...base, account_type: "admin" });
    assert.equal(fallback.success && fallback.data.account_type, "participant");
    assert.equal(signUpSchema.safeParse({ ...base, accept_terms: undefined }).success, false);
    assert.equal(signUpSchema.safeParse({ ...base, password: "kratke" }).success, false);
  });
});
