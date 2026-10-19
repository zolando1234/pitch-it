import "server-only";

import { siteConfig } from "@/config/site";
import type { OAuthProvider } from "@/lib/auth/schemas";
import { signToken, verifyToken } from "@/lib/auth/token";

/*
  Prihlásenie cez Google (OpenID Connect, authorization code flow).
  Stav (CSRF + cieľová stránka) je podpísaný token v parametri `state`.
*/

type ProviderConfig = { authorize: string; token: string; userinfo: string; scope: string; id: string; secret: string };

const ENDPOINTS: Record<OAuthProvider, { authorize: string; token: string; userinfo: string; scope: string; env: string }> = {
  google: {
    authorize: "https://accounts.google.com/o/oauth2/v2/auth",
    token: "https://oauth2.googleapis.com/token",
    userinfo: "https://openidconnect.googleapis.com/v1/userinfo",
    scope: "openid email profile",
    env: "GOOGLE",
  },
};

function config(provider: OAuthProvider): ProviderConfig | null {
  const endpoints = ENDPOINTS[provider];
  const id = process.env[`${endpoints.env}_CLIENT_ID`]?.trim();
  const secret = process.env[`${endpoints.env}_CLIENT_SECRET`]?.trim();
  return id && secret ? { ...endpoints, id, secret } : null;
}

export function isProviderConfigured(provider: OAuthProvider): boolean {
  return config(provider) !== null;
}

const callbackUrl = (provider: OAuthProvider) => `${siteConfig.url}/auth/callback/${provider}`;

export async function authorizeUrl(provider: OAuthProvider, next: string): Promise<string> {
  const c = config(provider);
  if (!c) throw new Error("oauth: poskytovateľ nie je nastavený");
  const state = await signToken("oauth", { provider, next }, 10 * 60);
  const url = new URL(c.authorize);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", c.id);
  url.searchParams.set("redirect_uri", callbackUrl(provider));
  url.searchParams.set("scope", c.scope);
  url.searchParams.set("state", state);
  return url.toString();
}

export type OAuthProfile = { email: string; name: string | null; next: string };

/** Vymení kód za token a načíta e-mail a meno. Null pri akejkoľvek chybe. */
export async function completeOAuth(provider: OAuthProvider, code: string, state: string): Promise<OAuthProfile | null> {
  const c = config(provider);
  const payload = await verifyToken<{ provider: string; next: string }>("oauth", state);
  if (!c || !payload || payload.provider !== provider) return null;
  const tokenResponse = await fetch(c.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: callbackUrl(provider), client_id: c.id, client_secret: c.secret }),
  });
  const token = (await tokenResponse.json().catch(() => null)) as { access_token?: string } | null;
  if (!tokenResponse.ok || !token?.access_token) return null;
  const infoResponse = await fetch(c.userinfo, { headers: { Authorization: `Bearer ${token.access_token}` } });
  const info = (await infoResponse.json().catch(() => null)) as { email?: string; email_verified?: boolean | string; name?: string } | null;
  if (!infoResponse.ok || !info?.email || info.email_verified === false || info.email_verified === "false") return null;
  return { email: info.email, name: info.name ?? null, next: payload.next };
}
