import "server-only";

import { cookies } from "next/headers";
import { siteConfig } from "@/config/site";
import { hashPassword } from "@/lib/auth/password";
import { SESSION_COOKIE, SESSION_TTL, signToken } from "@/lib/auth/token";
import { sendEmail } from "@/lib/email/send";
import { getAdminDb } from "@/lib/store/client";

/*
  Účty bez externej služby: používateľ v tabuľke auth_users, heslo ako scrypt hash,
  relácia v podpísanej httpOnly cookie. Pri registrácii vznikne profil, nastavenia,
  free plán a súhlasy (pôvodne SQL trigger handle_new_user).
*/

export type AccountRow = { id: string; email: string; password_hash: string | null; meta: Record<string, unknown>; created_at: string };

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findAccountByEmail(email: string): Promise<AccountRow | null> {
  const { data } = await getAdminDb().from("auth_users").select("*").eq("email", normalizeEmail(email)).maybeSingle<AccountRow>();
  return data;
}

export async function findAccount(id: string): Promise<AccountRow | null> {
  const { data } = await getAdminDb().from("auth_users").select("*").eq("id", id).maybeSingle<AccountRow>();
  return data;
}

export type NewAccount = {
  email: string;
  password: string | null;
  displayName: string | null;
  accountType: "participant" | "organizer";
  consentVersion: string;
  acceptedTerms: boolean;
  productEmails: boolean;
  provider?: string;
};

/** Vytvorí účet. Vráti null, ak e-mail už existuje. */
export async function createAccount(input: NewAccount): Promise<AccountRow | null> {
  const db = getAdminDb();
  const { data, error } = await db
    .from("auth_users")
    .insert({
      email: normalizeEmail(input.email),
      password_hash: input.password ? await hashPassword(input.password) : null,
      meta: { provider: input.provider ?? "email" },
    })
    .select("*")
    .single<AccountRow>();
  if (error?.code === "23505") return null;
  if (error || !data) throw new Error(`account.create: ${error?.message ?? "bez odpovede"}`);

  const name = input.displayName?.trim().slice(0, 80) || null;
  await db.from("profiles").insert({ id: data.id, display_name: name, account_type: input.accountType });
  await db.from("user_settings").insert({ user_id: data.id });
  await db.from("subscriptions").insert({ user_id: data.id });
  const version = input.consentVersion.slice(0, 32);
  const consents: Array<Record<string, unknown>> = [];
  if (input.acceptedTerms) {
    for (const kind of ["terms", "privacy_notice", "age_18"]) consents.push({ user_id: data.id, kind, granted: true, version });
  }
  if (input.productEmails) consents.push({ user_id: data.id, kind: "product_emails", granted: true, version });
  if (consents.length) await db.from("consents").insert(consents);
  return data;
}

export async function setPassword(userId: string, password: string): Promise<void> {
  const { error } = await getAdminDb().from("auth_users").update({ password_hash: await hashPassword(password) }).eq("id", userId);
  if (error) throw new Error(`account.password: ${error.message}`);
}

/** Zmaže účet a kaskádovo všetky jeho dáta. */
export async function deleteAccount(userId: string): Promise<void> {
  const { error } = await getAdminDb().from("auth_users").delete().eq("id", userId);
  if (error) throw new Error(`account.delete: ${error.message}`);
}

export async function startSession(account: Pick<AccountRow, "id" | "email">): Promise<void> {
  const token = await signToken("session", { sub: account.id, email: account.email }, SESSION_TTL);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export async function endSession(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE);
}

const RESET_TTL = 60 * 60;

/** Odkaz na nové heslo: e-mailom cez Resend (RESEND_API_KEY), inak iba do logu servera. */
export async function sendPasswordReset(account: AccountRow): Promise<void> {
  // Odtlačok hashu zneplatní odkaz po zmene hesla.
  const stamp = (account.password_hash ?? "").slice(-12);
  const token = await signToken("reset", { sub: account.id, stamp }, RESET_TTL);
  const link = `${siteConfig.url}/auth/confirm?token=${encodeURIComponent(token)}&next=${encodeURIComponent("/nove-heslo")}`;
  await sendEmail({
    to: account.email,
    subject: "Nové heslo do PitchIt",
    text: `Ahoj,\n\nnové heslo si nastavíš tu (odkaz platí hodinu):\n${link}\n\nAk si o zmenu nežiadal(a), správu ignoruj.\n\nPitchIt`,
  });
}

export function resetStamp(account: AccountRow): string {
  return (account.password_hash ?? "").slice(-12);
}
