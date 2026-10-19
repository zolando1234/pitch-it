import { z } from "zod";

/** Verzia textu podmienok a informácií o spracúvaní. Pri zmene textu zvýš. */
export const LEGAL_VERSION = "2026-10-10";

export const PASSWORD_MIN_LENGTH = 10;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Zadaj e-mail.")
  .max(254, "E-mail je príliš dlhý.")
  .pipe(z.email("Tento e-mail nevyzerá správne."));

const password = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Heslo musí mať aspoň ${PASSWORD_MIN_LENGTH} znakov.`)
  .max(128, "Heslo je príliš dlhé.");

const checked = (message: string) =>
  z.union([z.literal("on"), z.literal("true")], message).transform(() => true as const);

export const ACCOUNT_TYPES = ["participant", "organizer"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const OAUTH_PROVIDERS = ["google"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export const signUpSchema = z.object({
  display_name: z.string().trim().max(80, "Najviac 80 znakov.").optional().default(""),
  email,
  password,
  accept_terms: checked("Na vytvorenie účtu potrebujeme tvoj súhlas s podmienkami a potvrdenie veku."),
  account_type: z.enum(ACCOUNT_TYPES).catch("participant"),
  product_emails: z.literal("on").optional(),
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Zadaj heslo.").max(128),
});

export const resetRequestSchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, password_confirm: z.string() })
  .refine((value) => value.password === value.password_confirm, {
    message: "Heslá sa nezhodujú.",
    path: ["password_confirm"],
  });

export type AuthFormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export const initialAuthState: AuthFormState = { status: "idle" };
