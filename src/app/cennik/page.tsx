import type { Metadata } from "next";
import { PlanPicker } from "@/components/billing/plan-picker";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getPrimaryCta } from "@/config/site";
import { formatEur } from "@/lib/billing/pitch-pack";
import { FREE_SECONDS, PRO_WEEKLY_SECONDS, SUBSCRIBER_DISCOUNT_PERCENT, TEAM_DISCOUNT_TIERS, TOPUP, topupCentsPerMinute } from "@/lib/billing/pricing";

export const metadata: Metadata = {
  title: "Cenník",
  description: `${FREE_SECONDS / 60} minút zadarmo, Pro s ${PRO_WEEKLY_SECONDS / 60} minútami týždenne alebo Unlimited bez limitu.`,
  alternates: { canonical: "/cennik" },
};

export default function PricingPage() {
  const cta = getPrimaryCta();
  return (
    <>
      <SiteHeader cta={cta} />
      <main id="obsah" className="pt-32 pb-24 md:pt-40">
        <div className="container-page">
          <h1 className="type-display max-w-[44rem] text-[clamp(2.5rem,1.6rem+3.6vw,4rem)]">Vyskúšaj zadarmo, trénuj s plánom.</h1>
          <p className="mt-5 mb-10 max-w-[38rem] text-lg leading-relaxed text-mute">
            Po registrácii máš {FREE_SECONDS / 60} minút nahrávania zadarmo a rozdelíš si ich, ako chceš. Potom si vyberieš Pro alebo Unlimited, ročne ušetríš.
          </p>

          <PlanPicker mode="public" />

          <div className="mt-14 max-w-[44rem] space-y-3 text-[15px] leading-relaxed text-mute">
            <p>
              Pro má {PRO_WEEKLY_SECONDS / 60} minút nahrávania týždenne (obnovujú sa v pondelok). Keď ich minieš, dokúpiš si minúty navyše za{" "}
              <s className="opacity-60">
                <span className="sr-only">pôvodne </span>
                {formatEur(TOPUP.centsPerMinute)}
              </s>{" "}
              <strong className="text-paper">{formatEur(topupCentsPerMinute("pro"))}</strong> za minútu (−{SUBSCRIBER_DISCOUNT_PERCENT} % pre predplatiteľov) a neprepadajú.
            </p>
            <p>Predplatné zrušíš kedykoľvek, platí do konca zaplateného obdobia. Medzi Pro a Unlimited môžeš prejsť kedykoľvek, rozdiel sa doúčtuje pomerne.</p>
            <p>
              Ceny sú za jeden účet. Firemný tím platí plán za počet účtov a dostane zľavu:{" "}
              {[...TEAM_DISCOUNT_TIERS]
                .reverse()
                .map((t) => `od ${t.minSeats} účtov −${t.percent} %`)
                .join(", ")}
              . Pri Pro má tím {PRO_WEEKLY_SECONDS / 60} minút týždenne za každý účet, spoločne. Tím založíš v aplikácii v časti Tím.
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
