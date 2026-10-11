import type { ReactNode } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { AppSidebar } from "@/components/app/app-nav";
import { MobileNavProvider } from "@/components/app/mobile-nav";
import { PlanCard, PlanCardSkeleton } from "@/components/app/plan-card";
import { TopBar, TopBarSkeleton } from "@/components/app/top-bar";
import { PageSkeleton } from "@/components/ui/skeleton";
import { PREVIEW_ACCOUNT, previewNotifications, previewPlanSummary } from "@/lib/preview/dashboard";

/** Ukážkové dáta sú relatívne k aktuálnemu času, preto sa čítajú až pri požiadavke. */
async function PreviewPlanCard() {
  await connection();
  return <PlanCard summary={previewPlanSummary()} />;
}

async function PreviewTopBar() {
  await connection();
  return <TopBar variant="preview" firstName="Alex" account={PREVIEW_ACCOUNT} notifications={previewNotifications(new Date())} />;
}

export default function PreviewShellLayout({ children }: { children: ReactNode }) {
  return (
    <MobileNavProvider>
      <div className="app-shell app-glow flex min-h-dvh">
        <AppSidebar
          variant="preview"
          footer={
            <Suspense fallback={<PlanCardSkeleton />}>
              <PreviewPlanCard />
            </Suspense>
          }
        />
        <div className="flex min-w-0 flex-1 flex-col">
          <Suspense fallback={<TopBarSkeleton />}>
            <PreviewTopBar />
          </Suspense>
          <main id="obsah" className="min-w-0 flex-1 px-4 pt-6 pb-10 sm:px-6 lg:px-9 lg:pt-1">
            <div className="max-w-[1320px]">
              <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
            </div>
          </main>
        </div>
      </div>
    </MobileNavProvider>
  );
}
