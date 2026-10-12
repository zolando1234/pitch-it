import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth/auth-forms";
import { T } from "@/components/i18n/t";
import { AuthPage, authAvailable } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Zabudnuté heslo",
  robots: { index: false },
};

export default function ResetPasswordPage() {
  return (
    <AuthPage
      title={<T sk="Nové heslo." en="New password." />}
      description={<T sk="Zadaj e-mail k účtu. Pošleme ti odkaz, cez ktorý si nastavíš nové heslo." en="Enter your account email. We'll send you a link to set a new password." />}
      footer={
        <Link href="/prihlasenie" className="font-bold text-accent hover:underline">
          <T sk="Späť na prihlásenie" en="Back to sign in" />
        </Link>
      }
    >
      <ResetRequestForm available={authAvailable()} />
    </AuthPage>
  );
}
