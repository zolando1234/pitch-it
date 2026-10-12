import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/auth/auth-forms";
import { T } from "@/components/i18n/t";
import { AuthPage, authAvailable } from "@/components/auth/auth-page";

export const metadata: Metadata = {
  title: "Nastavenie hesla",
  robots: { index: false },
};

export default function NewPasswordPage() {
  return (
    <AuthPage title={<T sk="Nastav si nové heslo." en="Set a new password." />} description={<T sk="Po uložení ťa rovno prihlásime." en="After saving we'll sign you in right away." />}>
      <NewPasswordForm available={authAvailable()} />
    </AuthPage>
  );
}
