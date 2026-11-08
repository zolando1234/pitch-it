import Link from "next/link";
import { cache } from "react";
import { offersFeedback } from "@/components/app/feedback-card";
import { FeedbackTeaser } from "@/components/app/feedback-teaser";
import { Icon } from "@/components/app/icons";
import { getCurrentUser } from "@/lib/auth/session";
import { pitchSummary, teamPitchSummary, type PlanSummary } from "@/lib/billing/summary";
import { getPitchBalance } from "@/lib/db/pitch-wallet";
import { getMembership } from "@/lib/db/teams";
import { getLocale } from "@/lib/i18n/server";

/** Karta plánu v spodnej časti bočného panelu (desktop aj mobilné menu); nad zostatkom minút prípadne ponuka +5 min za dotazník. */
export function PlanCard({ summary, feedback = false }: { summary: PlanSummary; feedback?: boolean }) {
  const primary = summary.action.emphasis === "primary";
  return (
    <div className="rounded-[14px] border border-plan-line bg-plan px-4 pt-4 pb-4">
      {feedback ? <FeedbackTeaser /> : null}
      <div className="flex items-start gap-3.5 px-1">
        <Icon name="bolt" className="mt-0.5 size-7 text-accent" strokeWidth={1.5} />
        <div className="min-w-0">
          <p className="text-[14px] leading-tight font-semibold text-paper">{summary.title}</p>
          <p className="mt-1 text-[12.5px] leading-snug text-mute">{summary.detail}</p>
        </div>
      </div>
      <Link
        href={summary.action.href}
        className={`mt-4 flex h-11 w-full items-center justify-center rounded-full text-[15px] font-bold transition-[filter,transform,background-color] duration-200 hover:-translate-y-px active:translate-y-0 ${
          primary ? "bg-signal text-on-signal hover:brightness-105" : "border border-line-strong text-paper hover:bg-panel-2"
        }`}
      >
        {summary.action.label}
      </Link>
    </div>
  );
}

const loadSummary = cache(async (): Promise<{ summary: PlanSummary; feedback: boolean } | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const [balance, membership, locale, feedback] = await Promise.all([getPitchBalance(user.id), getMembership(user.id), getLocale(), offersFeedback(user.id)]);
  return { summary: membership ? teamPitchSummary(membership.team.name, balance, locale) : pitchSummary(balance, locale), feedback };
});

/** Číta reláciu, preto je vždy vo vnútri <Suspense>. */
export async function PlanCardLoader() {
  const loaded = await loadSummary();
  return loaded ? <PlanCard summary={loaded.summary} feedback={loaded.feedback} /> : null;
}

export function PlanCardSkeleton() {
  return <div aria-hidden="true" className="skeleton h-[124px] rounded-[14px] border border-plan-line bg-plan" />;
}
