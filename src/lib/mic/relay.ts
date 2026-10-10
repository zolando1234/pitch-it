import "server-only";

import { randomBytes } from "node:crypto";
import { getKv } from "@/lib/store/kv";

/*
  Mobil ako mikrofón: výmena WebRTC ponuky a odpovede medzi počítačom a mobilom.
  Odkaz s kódom je jediné oprávnenie mobilu, preto je kód náhodný (128 bitov) a platí 30 minút.
  Zvuk ide priamo z mobilu do prehliadača počítača, server ho nevidí.
*/

const TTL_SECONDS = 30 * 60;
export const MAX_SDP_LENGTH = 20_000;

const ownerKey = (code: string) => `mic:${code}`;
const offerKey = (code: string) => `mic:${code}:offer`;
const answerKey = (code: string) => `mic:${code}:answer`;

export const isMicCode = (code: string) => /^[a-f0-9]{32}$/.test(code);

export async function createMicLink(userId: string): Promise<string> {
  const code = randomBytes(16).toString("hex");
  await getKv().set(ownerKey(code), userId, TTL_SECONDS);
  return code;
}

export async function micLinkOwner(code: string): Promise<string | null> {
  return getKv().get(ownerKey(code));
}

/** Ponuku zapisuje počítač; pri novom pokuse o spojenie sa stará odpoveď zahodí. */
export async function setMicOffer(code: string, sdp: string): Promise<void> {
  const kv = getKv();
  await kv.del([answerKey(code)]);
  await kv.set(offerKey(code), sdp, TTL_SECONDS);
}

/** Odpoveď mobilu. Vráti false, ak už odpovedal iný mobil. */
export async function setMicAnswer(code: string, sdp: string): Promise<boolean> {
  const kv = getKv();
  const ok = await kv.setnx(answerKey(code), sdp);
  // setnx nemá TTL, kľúč expiruje spolu s ostatnými
  if (ok) await kv.set(answerKey(code), sdp, TTL_SECONDS);
  return ok;
}

export async function readMicLink(code: string): Promise<{ exists: boolean; offer: string | null; answer: string | null }> {
  const [owner, offer, answer] = await getKv().mget([ownerKey(code), offerKey(code), answerKey(code)]);
  return { exists: owner !== null, offer, answer };
}
