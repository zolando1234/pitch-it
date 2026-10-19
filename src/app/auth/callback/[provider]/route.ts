import { NextResponse, type NextRequest } from "next/server";
import { createAccount, findAccountByEmail, startSession } from "@/lib/auth/accounts";
import { completeOAuth } from "@/lib/auth/oauth";
import { LEGAL_VERSION, OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/auth/schemas";
import { safeNextPath } from "@/lib/auth/session";
import { trackEvent } from "@/lib/events/track";

/** Návrat z Google: nájde alebo vytvorí účet podľa overeného e-mailu a prihlási. */
export async function GET(request: NextRequest, { params }: RouteContext<"/auth/callback/[provider]">) {
  const { provider } = await params;
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const fail = () => NextResponse.redirect(new URL("/prihlasenie?chyba=poskytovatel", request.url));
  if (!OAUTH_PROVIDERS.includes(provider as OAuthProvider) || !code || !state) return fail();

  const profile = await completeOAuth(provider as OAuthProvider, code, state).catch(() => null);
  if (!profile) return fail();

  let account = await findAccountByEmail(profile.email);
  if (!account) {
    account = await createAccount({
      email: profile.email,
      password: null,
      displayName: profile.name,
      accountType: "participant",
      consentVersion: LEGAL_VERSION,
      acceptedTerms: true,
      productEmails: false,
      provider,
    });
    if (!account) return fail();
    await trackEvent(account.id, "signup_completed", { provider });
  }
  await startSession(account);
  return NextResponse.redirect(new URL(safeNextPath(profile.next), request.url));
}
