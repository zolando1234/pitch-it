import type { Metadata } from "next";
import { getLocale } from "@/lib/i18n/server";
import { OnboardingQuiz } from "@/components/onboarding/onboarding-quiz";
import { requireUser } from "@/lib/auth/session";

// Stránka závisí od relácie používateľa: navigácia smie počkať na server.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Welcome" : "Vitaj" };
}

export default async function WelcomePage() {
  await requireUser("/app/vitaj");
  return <OnboardingQuiz />;
}
