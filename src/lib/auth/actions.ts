"use server";

import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getSignupMode, isAuthConfigured } from "@/config/env";
import { getHashSalt } from "@/config/server-env";
import {
  LEGAL_VERSION,
  newPasswordSchema,
  OAUTH_PROVIDERS,
  type OAuthProvider,
  resetRequestSchema,
  signInSchema,
  signUpSchema,
  type AuthFormState,
} from "@/lib/auth/schemas";
import { deleteAccount } from "@/lib/privacy/account";
import { createAccount, endSession, findAccountByEmail, sendPasswordReset, setPassword, startSession } from "@/lib/auth/accounts";
import { checkPassword } from "@/lib/auth/password";
import { authorizeUrl, isProviderConfigured } from "@/lib/auth/oauth";
import { getCurrentUser, safeNextPath } from "@/lib/auth/session";
import { trackEvent } from "@/lib/events/track";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { fieldErrors } from "@/lib/validation/schemas";

const NOT_CONFIGURED: AuthFormState = {
  status: "error",
  message: "Prihlasovanie momentálne nefunguje. Skús to neskôr.",
};

const TOO_MANY: AuthFormState = {
  status: "error",
  message: "Z tejto siete prišlo veľa pokusov. Skús to znova o 10 minút.",
};

async function rateKey(scope: string): Promise<string> {
  const requestHeaders = await headers();
  const ip =
    requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip")?.trim() || "unknown";
  const salt = getHashSalt() ?? "pitch-it";
  return `${scope}:${createHmac("sha256", salt).update(ip).digest("hex").slice(0, 32)}`;
}

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function signUp(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured()) return NOT_CONFIGURED;
  if (getSignupMode() === "waitlist") {
    return { status: "error", message: "Registrácia je zatiaľ iba na pozvánku. Zapíš sa na early access na úvodnej stránke." };
  }
  if (!consumeRateLimit(await rateKey("signup"), RATE_LIMITS.auth)) return TOO_MANY;

  const values = {
    display_name: text(formData, "display_name"),
    email: text(formData, "email"),
  };
  const parsed = signUpSchema.safeParse({
    display_name: values.display_name,
    email: values.email,
    password: text(formData, "password"),
    accept_terms: formData.get("accept_terms") ?? undefined,
    account_type: text(formData, "account_type"),
    product_emails: formData.get("product_emails") ?? undefined,
  });
  if (!parsed.success) {
    return { status: "error", message: "Skontroluj zvýraznené polia.", fieldErrors: fieldErrors(parsed.error), values };
  }

  let account;
  try {
    // Iba vo vývoji: opakovaná registrácia s tým istým e-mailom nahradí starý účet.
    if (process.env.NODE_ENV === "development") {
      const existing = await findAccountByEmail(parsed.data.email);
      if (existing) await deleteAccount(existing.id);
    }
    account = await createAccount({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.display_name,
      accountType: parsed.data.account_type,
      consentVersion: LEGAL_VERSION,
      acceptedTerms: true,
      productEmails: Boolean(parsed.data.product_emails),
    });
  } catch (error) {
    console.error("[auth] signUp:", error instanceof Error ? error.message : error);
    return { status: "error", message: "Účet sa nepodarilo vytvoriť. Skús to znova o chvíľu.", values };
  }
  if (!account) {
    return {
      status: "error",
      message: "Účet s týmto e-mailom už existuje. Prihlás sa.",
      fieldErrors: { email: "Tento e-mail už má účet." },
      values,
    };
  }

  await trackEvent(account.id, "signup_completed", { email_confirmation: false });
  await startSession(account);
  redirect("/app");
}

export async function signIn(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured()) return NOT_CONFIGURED;
  if (!consumeRateLimit(await rateKey("signin"), RATE_LIMITS.auth)) return TOO_MANY;

  const values = { email: text(formData, "email") };
  const parsed = signInSchema.safeParse({ email: values.email, password: text(formData, "password") });
  if (!parsed.success) {
    return { status: "error", message: "Skontroluj zvýraznené polia.", fieldErrors: fieldErrors(parsed.error), values };
  }

  const account = await findAccountByEmail(parsed.data.email);
  if (!account || !(await checkPassword(parsed.data.password, account.password_hash))) {
    return { status: "error", message: "Nesprávny e-mail alebo heslo.", values };
  }
  await startSession(account);

  redirect(safeNextPath(text(formData, "next")));
}

export async function requestPasswordReset(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured()) return NOT_CONFIGURED;
  if (!consumeRateLimit(await rateKey("reset"), RATE_LIMITS.auth)) return TOO_MANY;

  const values = { email: text(formData, "email") };
  const parsed = resetRequestSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", message: "Skontroluj e-mail.", fieldErrors: fieldErrors(parsed.error), values };
  }

  const account = await findAccountByEmail(parsed.data.email);
  if (account) await sendPasswordReset(account).catch((error) => console.error("[auth] reset:", error instanceof Error ? error.message : error));

  // Vždy rovnaká odpoveď: nezverejňujeme, či účet existuje.
  return {
    status: "success",
    message: "Ak k tomuto e-mailu existuje účet, poslali sme naň odkaz na nastavenie nového hesla.",
  };
}

export async function updatePassword(_previous: AuthFormState, formData: FormData): Promise<AuthFormState> {
  if (!isAuthConfigured()) return NOT_CONFIGURED;
  const parsed = newPasswordSchema.safeParse({
    password: text(formData, "password"),
    password_confirm: text(formData, "password_confirm"),
  });
  if (!parsed.success) {
    return { status: "error", message: "Skontroluj zvýraznené polia.", fieldErrors: fieldErrors(parsed.error) };
  }

  const user = await getCurrentUser();
  if (!user) {
    return {
      status: "error",
      message: "Odkaz na zmenu hesla vypršal. Vypýtaj si nový.",
    };
  }
  await setPassword(user.id, parsed.data.password);
  redirect("/app?heslo=zmenene");
}

export async function signOut(): Promise<void> {
  if (isAuthConfigured()) await endSession();
  redirect("/");
}

/**
 * Prihlásenie cez Google alebo LinkedIn (OpenID Connect).
 * Zapína sa premennými GOOGLE_CLIENT_ID/SECRET a LINKEDIN_CLIENT_ID/SECRET.
 */
export async function signInWithProvider(formData: FormData): Promise<void> {
  const provider = text(formData, "provider") as OAuthProvider;
  if (!isAuthConfigured() || !OAUTH_PROVIDERS.includes(provider) || !isProviderConfigured(provider)) redirect("/prihlasenie?chyba=poskytovatel");
  const next = safeNextPath(text(formData, "next") || "/app");
  redirect(await authorizeUrl(provider, next));
}
