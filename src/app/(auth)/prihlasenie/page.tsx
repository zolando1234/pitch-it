import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignInForm } from "@/components/auth/auth-forms";
import { T } from "@/components/i18n/t";
import { AuthPage, authAvailable } from "@/components/auth/auth-page";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Prihlásenie",
  robots: { index: false },
};

export default function SignInPage() {
  return (
    <AuthPage
      title={<T sk="Vitaj späť." en="Welcome back." />}
      description={<T sk="Prihlás sa a pokračuj v cvičení svojho pitchu." en="Sign in and keep practising your pitch." />}
      footer={
        <>
          <T sk="Ešte nemáš účet?" en="Don't have an account yet?" />{" "}
          <Link href="/registracia" className="font-bold text-accent hover:underline">
            <T sk="Vytvoriť účet" en="Create account" />
          </Link>
        </>
      }
    >
      <Suspense fallback={<Skeleton className="h-64" />}>
        <SignInForm available={authAvailable()} />
      </Suspense>
    </AuthPage>
  );
}
