import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth/auth-forms";
import { T } from "@/components/i18n/t";
import { AuthPage, authAvailable } from "@/components/auth/auth-page";
import { EarlyAccessForm } from "@/components/sections/early-access-form";
import { getSignupMode } from "@/config/env";
import { isEarlyAccessConfigured } from "@/lib/early-access/store";

export const metadata: Metadata = {
  title: "Registrácia",
  description: "Vytvor si účet a natrénuj investorské stretnutie na vlastných podkladoch.",
};

const DEFAULT_DESCRIPTION = <T sk="Začni zadarmo. Netreba kreditnú kartu." en="Start for free. No credit card needed." />;

// searchParams sú runtime dáta: čítame ich až za Suspense, zvyšok stránky ostáva statický
async function SignUpDescription({ searchParams }: { searchParams: PageProps<"/registracia">["searchParams"] }) {
  return (await searchParams)["stary-ucet"] === "1"
    ? <T sk="Po aktualizácii sme tvoj predošlý účet nenašli. Prepáč, zaregistruj sa prosím znova, tentoraz sa už všetko uloží." en="After an update we couldn't find your previous account. Sorry, please sign up again, this time everything will be saved." />
    : DEFAULT_DESCRIPTION;
}

export default function SignUpPage({ searchParams }: PageProps<"/registracia">) {
  if (getSignupMode() === "waitlist") {
    return (
      <AuthPage
        title="Zatiaľ púšťame po skupinách."
        description="Hlasový tréning stojí reálne peniaze, preto účty otvárame postupne. Zapíš sa a ozveme sa, keď príde rad na teba."
      >
        <EarlyAccessForm available={isEarlyAccessConfigured()} setupHint={null} />
      </AuthPage>
    );
  }

  return (
    <AuthPage
      title={<T sk="Vytvor si účet." en="Create your account." />}
      description={
        <Suspense fallback={DEFAULT_DESCRIPTION}>
          <SignUpDescription searchParams={searchParams} />
        </Suspense>
      }
      footer={
        <>
          <T sk="Už máš účet?" en="Already have an account?" />{" "}
          <Link href="/prihlasenie" className="font-bold text-accent hover:underline">
            <T sk="Prihlásiť sa" en="Sign in" />
          </Link>
        </>
      }
    >
      <SignUpForm available={authAvailable()} />
    </AuthPage>
  );
}
