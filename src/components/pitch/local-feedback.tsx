"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeedbackScreen } from "@/components/pitch/feedback-screen";
import { PI_BACKGROUND, PiTopbar } from "@/components/pitch/pi-topbar";
import type { PitchAttemptRow } from "@/lib/db/types";
import { buildFeedback } from "@/lib/pitch/feedback";
import { getLocalAttempt } from "@/lib/pitch/local-attempt";
import { useLocale } from "@/components/i18n/locale-provider";

/** Feedback z výsledku, ktorý prišiel s odoslaním nahrávky (keď ho server nenájde). */
export function LocalFeedback({ attemptId, email }: { attemptId: string; email: string }) {
  const [attempt, setAttempt] = useState<PitchAttemptRow | null | undefined>(undefined);
  const locale = useLocale();
  const en = locale === "en";
  useEffect(() => {
    setAttempt(getLocalAttempt(attemptId)); // eslint-disable-line react-hooks/set-state-in-effect -- sessionStorage je len na klientovi
  }, [attemptId]);

  if (attempt === undefined) return <div style={{ background: PI_BACKGROUND, minHeight: "100dvh" }} />;
  if (!attempt) {
    return (
      <div style={{ background: PI_BACKGROUND, color: "var(--color-paper)", minHeight: "100dvh" }}>
        <PiTopbar />
        <main id="obsah" className="mx-auto max-w-xl px-6 py-24 text-center">
          <h1 className="font-display text-4xl font-bold">{en ? "Feedback not found." : "Feedback sa nenašiel."}</h1>
          <p className="mt-4 text-mute">
            {en
              ? "This attempt is no longer available. Record the pitch again and you'll see the feedback right after the analysis."
              : "Tento pokus už nie je dostupný. Nahraj pitch znova a feedback uvidíš hneď po analýze."}
          </p>
          <Link href="/app/nahravka" className="mt-8 inline-flex min-h-[46px] items-center rounded-full border border-line-strong px-6 font-bold">
            {en ? "Record a pitch" : "Nahrať pitch"}
          </Link>
        </main>
      </div>
    );
  }
  const data = buildFeedback(attempt, {
    number: 1,
    retryHref: attempt.with_camera ? "/app/nahravka" : "/app/nahravka/zvuk",
    shareDefaults: { name: "", team: "", email },
    locale,
  });
  return <FeedbackScreen data={data} />;
}
