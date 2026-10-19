import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AuthPage } from "@/components/auth/auth-page";
import { AcceptInviteButton } from "@/components/team/team-forms";
import { buttonClasses } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Skeleton } from "@/components/ui/skeleton";
import { signInWithProvider } from "@/lib/auth/actions";
import { isProviderConfigured } from "@/lib/auth/oauth";
import { getCurrentUser } from "@/lib/auth/session";
import { verifyToken } from "@/lib/auth/token";
import { getInvite, getTeam } from "@/lib/db/teams";
import { getLocale } from "@/lib/i18n/server";
import { getAdminDb } from "@/lib/store/client";
import { acceptInviteAction, switchAccountAction } from "@/lib/teams/actions";

export const metadata: Metadata = {
  title: "Pozvánka do tímu",
  robots: { index: false },
};

async function ownerEmail(ownerId: string): Promise<string | null> {
  const { data } = await getAdminDb().from("auth_users").select("email").eq("id", ownerId).maybeSingle<{ email: string }>();
  return data?.email ?? null;
}

/** Odkaz z e-mailovej pozvánky: ukáže tím a podľa prihlásenia ponúkne prijatie, prihlásenie alebo registráciu. */
async function Invitation({ searchParams }: { searchParams: PageProps<"/pozvanka">["searchParams"] }) {
  const raw = (await searchParams).t;
  const token = typeof raw === "string" ? raw : "";
  const en = (await getLocale()) === "en";
  const L = (sk: string, enText: string) => (en ? enText : sk);

  // overenie tokenu číta Date.now(): počkáme na skutočnú požiadavku (Cache Components)
  await connection();
  const payload = verifyToken<{ iid: string }>("team-invite", token);
  const invite = payload ? await getInvite(payload.iid) : null;
  const team = invite ? await getTeam(invite.team_id) : null;
  if (!invite || !team) {
    return (
      <AuthPage title={L("Pozvánka už neplatí.", "This invitation is no longer valid.")} description={L("Odkaz vypršal alebo bol zrušený. Požiadaj o novú pozvánku.", "The link expired or was cancelled. Ask for a new invitation.")}>
        <Link href="/app" className={buttonClasses({ variant: "secondary", className: "w-full" })}>
          {L("Pokračovať do aplikácie", "Continue to the app")}
        </Link>
      </AuthPage>
    );
  }

  const [owner, user] = await Promise.all([ownerEmail(team.owner_id), getCurrentUser()]);
  const here = `/pozvanka?t=${encodeURIComponent(token)}`;
  const title = L(`Pozvánka do tímu ${team.name}`, `Invitation to ${team.name}`);
  const description = owner
    ? L(`${owner} ťa pozýva do PitchIt. Tréning ti platí tím.`, `${owner} invited you to PitchIt. The team pays for your training.`)
    : L("Tréning ti platí tím.", "The team pays for your training.");

  if (user) {
    const matches = (user.email ?? "").toLowerCase() === invite.email;
    return (
      <AuthPage title={title} description={description}>
        {matches ? (
          <AcceptInviteButton action={acceptInviteAction.bind(null, invite.id)} />
        ) : (
          <>
            <Notice tone="attention">
              {L(
                `Pozvánka je pre ${invite.email}, ale si prihlásený ako ${user.email}. Odhlás sa a prihlás sa pozvaným e-mailom.`,
                `The invitation is for ${invite.email}, but you're signed in as ${user.email}. Sign out and sign in with the invited email.`,
              )}
            </Notice>
            <form action={switchAccountAction} className="mt-5">
              <input type="hidden" name="next" value={here} />
              <button type="submit" className={buttonClasses({ variant: "secondary", className: "w-full" })}>
                {L("Odhlásiť a prihlásiť iným účtom", "Sign out and use another account")}
              </button>
            </form>
          </>
        )}
      </AuthPage>
    );
  }

  const signUpHref = `/registracia?next=${encodeURIComponent(here)}&email=${encodeURIComponent(invite.email)}`;
  return (
    <AuthPage
      title={title}
      description={description}
      footer={
        <>
          {L("Už máš účet?", "Already have an account?")}{" "}
          <Link href={`/prihlasenie?next=${encodeURIComponent(here)}`} className="font-bold text-accent hover:underline">
            {L("Prihlásiť sa", "Sign in")}
          </Link>
        </>
      }
    >
      <p className="mb-5 text-center text-[14.5px] text-mute">
        {L(`Prihlás sa alebo si vytvor účet s e-mailom ${invite.email}.`, `Sign in or create an account with the email ${invite.email}.`)}
      </p>
      {isProviderConfigured("google") ? (
        <form action={signInWithProvider}>
          <input type="hidden" name="provider" value="google" />
          <input type="hidden" name="next" value={here} />
          <button type="submit" className={buttonClasses({ variant: "secondary", className: "min-h-12 w-full" })}>
            {L("Pokračovať cez Google", "Continue with Google")}
          </button>
        </form>
      ) : null}
      <Link href={signUpHref} className={buttonClasses({ className: "mt-2.5 min-h-12 w-full" })}>
        {L("Vytvoriť účet e-mailom", "Create an account with email")}
      </Link>
    </AuthPage>
  );
}

export default function InvitationPage({ searchParams }: PageProps<"/pozvanka">) {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <Invitation searchParams={searchParams} />
    </Suspense>
  );
}
