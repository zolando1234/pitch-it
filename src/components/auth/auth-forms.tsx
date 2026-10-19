"use client";

import Link from "next/link";
import { useActionState, useId } from "react";
import { useSearchParams } from "next/navigation";
import { buttonClasses } from "@/components/ui/button";
import { Checkbox, Field, Input } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { SubmitButton } from "@/components/ui/submit-button";
import { requestPasswordReset, signIn, signInWithProvider, signUp, updatePassword } from "@/lib/auth/actions";
import { initialAuthState, PASSWORD_MIN_LENGTH, type OAuthProvider } from "@/lib/auth/schemas";
import { useLocale } from "@/components/i18n/locale-provider";

/* Hlásenia zo servera (auth akcie a validácia) sú po slovensky, v angličtine ich preložíme tu. */
const SERVER_EN: Record<string, string> = {
  "Prihlasovanie momentálne nefunguje. Skús to neskôr.": "Sign-in isn't working right now. Try again later.",
  "Z tejto siete prišlo veľa pokusov. Skús to znova o 10 minút.": "Too many attempts from this network. Try again in 10 minutes.",
  "Registrácia je zatiaľ iba na pozvánku. Zapíš sa na early access na úvodnej stránke.": "Sign-up is invite-only for now. Join early access on the home page.",
  "Skontroluj zvýraznené polia.": "Check the highlighted fields.",
  "Účet sa nepodarilo vytvoriť. Skús to znova o chvíľu.": "The account couldn't be created. Try again in a moment.",
  "Účet s týmto e-mailom už existuje. Prihlás sa.": "An account with this email already exists. Sign in.",
  "Tento e-mail už má účet.": "This email already has an account.",
  "Nesprávny e-mail alebo heslo.": "Wrong email or password.",
  "Skontroluj e-mail.": "Check your email.",
  "Ak k tomuto e-mailu existuje účet, poslali sme naň odkaz na nastavenie nového hesla.": "If an account exists for this email, we've sent it a link to set a new password.",
  "Odkaz na zmenu hesla vypršal. Vypýtaj si nový.": "The password reset link has expired. Request a new one.",
  "Zadaj e-mail.": "Enter your email.",
  "E-mail je príliš dlhý.": "The email is too long.",
  "Tento e-mail nevyzerá správne.": "This email doesn't look right.",
  [`Heslo musí mať aspoň ${PASSWORD_MIN_LENGTH} znakov.`]: `The password must have at least ${PASSWORD_MIN_LENGTH} characters.`,
  "Heslo je príliš dlhé.": "The password is too long.",
  "Najviac 80 znakov.": "At most 80 characters.",
  "Na vytvorenie účtu potrebujeme tvoj súhlas s podmienkami a potvrdenie veku.": "To create an account we need your consent to the terms and confirmation of your age.",
  "Zadaj heslo.": "Enter your password.",
  "Heslá sa nezhodujú.": "The passwords don't match.",
};

/** Preklad hlásenia zo servera do jazyka rozhrania. */
function useServerText() {
  const en = useLocale() === "en";
  return (text?: string) => (en && text ? (SERVER_EN[text] ?? text) : text);
}

/** Chybové hlásenia polí v jazyku rozhrania. */
function useFieldErrors(errors?: Record<string, string | undefined>) {
  const t = useServerText();
  return (name: string) => t(errors?.[name]);
}

function FormMessage({ status, message: raw }: { status: string; message?: string }) {
  const message = useServerText()(raw);
  if (!message) return null;
  return (
    <Notice tone={status === "success" ? "success" : "error"} role={status === "success" ? "status" : "alert"}>
      {message}
    </Notice>
  );
}

const LINK_ERRORS: Record<"sk" | "en", Record<string, string>> = {
  sk: {
    odkaz: "Odkaz z e-mailu je neplatný alebo vypršal. Prihlás sa alebo si vypýtaj nový.",
    poskytovatel: "Prihlásenie cez tento účet sa nepodarilo. Skús to znova alebo použi e-mail.",
  },
  en: {
    odkaz: "The link from the email is invalid or has expired. Sign in or request a new one.",
    poskytovatel: "Signing in with this account failed. Try again or use your email.",
  },
};

const PROVIDER_LABELS: Record<"sk" | "en", Record<OAuthProvider, string>> = {
  sk: { google: "Pokračovať cez Google" },
  en: { google: "Continue with Google" },
};

function Separator() {
  return (
    <div className="mt-6 mb-3.5 flex items-center gap-3 text-[13px] text-mute" aria-hidden="true">
      <span className="h-px flex-1 bg-line" />
      {useLocale() === "en" ? "or" : "alebo"}
      <span className="h-px flex-1 bg-line" />
    </div>
  );
}

function ProviderButtons({ providers, next, disabled }: { providers: OAuthProvider[]; next?: string; disabled?: boolean }) {
  const locale = useLocale();
  return (
    <>
      <Separator />
      {providers.map((provider) => (
        <form key={provider} action={signInWithProvider} className="mt-2.5">
          <input type="hidden" name="provider" value={provider} />
          {next ? <input type="hidden" name="next" value={next} /> : null}
          <button type="submit" disabled={disabled} className={buttonClasses({ variant: "secondary", className: "min-h-12 w-full" })}>
            {PROVIDER_LABELS[locale][provider]}
          </button>
        </form>
      ))}
    </>
  );
}

export function SignInForm({ available }: { available: boolean }) {
  const [state, action] = useActionState(signIn, initialAuthState);
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const locale = useLocale();
  const en = locale === "en";
  const linkError = LINK_ERRORS[locale][params.get("chyba") ?? ""];
  const id = useId();
  const err = useFieldErrors(state.fieldErrors);

  return (
    <>
      <form action={action} className="space-y-4" noValidate>
        <input type="hidden" name="next" value={next} />
        {linkError && state.status === "idle" ? <Notice tone="attention">{linkError}</Notice> : null}
        {params.get("heslo") === "zmenene" ? <Notice tone="success">{en ? "Your password has been changed." : "Heslo je zmenené."}</Notice> : null}
        <FormMessage status={state.status} message={state.message} />
        <Field id={`${id}-email`} label="E-mail" error={err("email")}>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder={en ? "you@startup.com" : "ty@startup.sk"}
            required
            defaultValue={state.values?.email}
            error={err("email")}
          />
        </Field>
        <Field id={`${id}-password`} label={en ? "Password" : "Heslo"} error={err("password")}>
          <Input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder={en ? "Your password" : "Tvoje heslo"}
            required
            error={err("password")}
          />
        </Field>
        <div className="!mt-3 mb-6 text-right text-sm">
          <Link href="/zabudnute-heslo" className="text-accent hover:underline">
            {en ? "Forgot your password?" : "Zabudnuté heslo?"}
          </Link>
        </div>
        <SubmitButton pendingLabel={en ? "Signing in…" : "Prihlasujem…"} disabled={!available} className="min-h-[52px] w-full">
          {en ? "Sign in" : "Prihlásiť sa"}
        </SubmitButton>
      </form>
      <ProviderButtons providers={["google"]} next={next} disabled={!available} />
    </>
  );
}

export function SignUpForm({ available }: { available: boolean }) {
  const [state, action] = useActionState(signUp, initialAuthState);
  // z pozvánky do tímu: návrat na pozvánku a predvyplnený pozvaný e-mail
  const params = useSearchParams();
  const next = params.get("next") ?? "/app";
  const invitedEmail = params.get("email") ?? undefined;
  const id = useId();
  const en = useLocale() === "en";
  const err = useFieldErrors(state.fieldErrors);

  if (state.status === "success") {
    return (
      <Notice tone="success" title={en ? "Check your email" : "Skontroluj e-mail"}>
        {state.message}
      </Notice>
    );
  }

  return (
    <>
      <form action={action} className="space-y-4" noValidate>
        <FormMessage status={state.status} message={state.message} />
        <input type="hidden" name="account_type" value="participant" />
        <input type="hidden" name="next" value={next} />
        <Field id={`${id}-name`} label={en ? "Full name" : "Celé meno"} error={err("display_name")}>
          <Input
            id={`${id}-name`}
            name="display_name"
            autoComplete="name"
            placeholder={en ? "Your name" : "Tvoje meno"}
            maxLength={80}
            defaultValue={state.values?.display_name}
            error={err("display_name")}
          />
        </Field>
        <Field id={`${id}-email`} label={en ? "Work email" : "Pracovný e-mail"} error={err("email")}>
          <Input
            id={`${id}-email`}
            name="email"
            type="email"
            autoComplete="email"
            placeholder={en ? "you@startup.com" : "ty@startup.sk"}
            required
            defaultValue={state.values?.email ?? invitedEmail}
            error={err("email")}
          />
        </Field>
        <Field id={`${id}-password`} label={en ? "Password" : "Heslo"} error={err("password")}>
          <Input
            id={`${id}-password`}
            name="password"
            type="password"
            autoComplete="new-password"
            placeholder={en ? `At least ${PASSWORD_MIN_LENGTH} characters` : `Aspoň ${PASSWORD_MIN_LENGTH} znakov`}
            minLength={PASSWORD_MIN_LENGTH}
            required
            error={err("password")}
          />
        </Field>
        <Checkbox
          id={`${id}-terms`}
          name="accept_terms"
          className="!mt-[22px] mb-6"
          error={err("accept_terms")}
          label={
            en ? (
              <>
                I agree to the{" "}
                <Link href="/podmienky" className="text-paper underline-offset-2 hover:underline" target="_blank">
                  Terms
                </Link>{" "}
                and the{" "}
                <Link href="/ochrana-osobnych-udajov" className="text-paper underline-offset-2 hover:underline" target="_blank">
                  Privacy Policy
                </Link>{" "}
                and I am at least 18 years old. My recordings are never shared without my consent.
              </>
            ) : (
            <>
              Súhlasím s{" "}
              <Link href="/podmienky" className="text-paper underline-offset-2 hover:underline" target="_blank">
                Podmienkami
              </Link>{" "}
              a{" "}
              <Link href="/ochrana-osobnych-udajov" className="text-paper underline-offset-2 hover:underline" target="_blank">
                Zásadami ochrany súkromia
              </Link>{" "}
              a mám aspoň 18 rokov. Moje nahrávky sa nikdy nezdieľajú bez môjho súhlasu.
            </>
            )
          }
        />
        <SubmitButton pendingLabel={en ? "Creating account…" : "Vytváram účet…"} disabled={!available} className="min-h-[52px] w-full">
          {en ? "Create account" : "Vytvoriť účet"}
        </SubmitButton>
      </form>
      <ProviderButtons providers={["google"]} next={next} disabled={!available} />
    </>
  );
}

export function ResetRequestForm({ available }: { available: boolean }) {
  const [state, action] = useActionState(requestPasswordReset, initialAuthState);
  const id = useId();
  const en = useLocale() === "en";
  const t = useServerText();
  const err = useFieldErrors(state.fieldErrors);
  if (state.status === "success") return <Notice tone="success">{t(state.message)}</Notice>;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <Field id={`${id}-email`} label="E-mail" error={err("email")}>
        <Input
          id={`${id}-email`}
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={state.values?.email}
          error={err("email")}
        />
      </Field>
      <SubmitButton pendingLabel={en ? "Sending…" : "Posielam…"} disabled={!available} className="min-h-[52px] w-full">
        {en ? "Send link" : "Poslať odkaz"}
      </SubmitButton>
    </form>
  );
}

export function NewPasswordForm({ available }: { available: boolean }) {
  const [state, action] = useActionState(updatePassword, initialAuthState);
  const id = useId();
  const en = useLocale() === "en";
  const err = useFieldErrors(state.fieldErrors);
  const minHint = en ? `At least ${PASSWORD_MIN_LENGTH} characters.` : `Aspoň ${PASSWORD_MIN_LENGTH} znakov.`;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage status={state.status} message={state.message} />
      <Field id={`${id}-password`} label={en ? "New password" : "Nové heslo"} hint={minHint} error={err("password")}>
        <Input
          id={`${id}-password`}
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN_LENGTH}
          required
          hint={minHint}
          error={err("password")}
        />
      </Field>
      <Field id={`${id}-confirm`} label={en ? "New password again" : "Nové heslo ešte raz"} error={err("password_confirm")}>
        <Input
          id={`${id}-confirm`}
          name="password_confirm"
          type="password"
          autoComplete="new-password"
          required
          error={err("password_confirm")}
        />
      </Field>
      <SubmitButton pendingLabel={en ? "Saving…" : "Ukladám…"} disabled={!available} className="min-h-[52px] w-full">
        {en ? "Set password" : "Nastaviť heslo"}
      </SubmitButton>
    </form>
  );
}
