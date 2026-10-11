import Link from "next/link";
import { cache } from "react";
import { Icon } from "@/components/app/icons";
import { getCurrentUser } from "@/lib/auth/session";
import { pitchSummary, type PlanSummary } from "@/lib/billing/summary";
import { getPitchBalance } from "@/lib/db/pitch-wallet";

/** Karta plánu v spodnej časti bočného panelu (desktop aj mobilné menu). */
export function PlanCard({ summary }: { summary: PlanSummary }) {
  const primary = summary.action.emphasis === "primary";
  return (
    <div className="rounded-[14px] border border-plan-line bg-plan px-4 pt-4 pb-4">
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

const loadSummary = cache(async (): Promise<PlanSummary | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return pitchSummary(await getPitchBalance(user.id));
});

/** Číta reláciu, preto je vždy vo vnútri <Suspense>. */
export async function PlanCardLoader() {
  const summary = await loadSummary();
  return summary ? <PlanCard summary={summary} /> : null;
}

export function PlanCardSkeleton() {
  return <div aria-hidden="true" className="skeleton h-[124px] rounded-[14px] border border-plan-line bg-plan" />;
}
