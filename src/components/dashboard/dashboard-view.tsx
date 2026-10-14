import type { ReactNode } from "react";
import Link from "next/link";
import { GettingStarted, type ChecklistItem } from "@/components/app/getting-started";
import { Icon, PlayIcon, type IconName } from "@/components/app/icons";
import type { StatCard } from "@/lib/dashboard/stat-card";

export type DashboardViewData = {
  stats: StatCard[];
  notice?: ReactNode;
  /** Prvé kroky nového účtu; hotové sa neukážu. */
  checklist?: ChecklistItem[];
  /** Prepis odkazov. */
  href?: (path: string) => string;
  /** jazyk rozhrania */
  locale?: "sk" | "en";
};

/* ───────────── Spoločné časti ───────────── */

function IconBadge({ icon, tone, size = "md" }: { icon: IconName; tone: "lime" | "violet" | "amber"; size?: "sm" | "md" | "lg" }) {
  const tones = { lime: "bg-lime-tint text-accent", violet: "bg-violet-tint text-violet-soft", amber: "bg-amber-tint text-marker" };
  const sizes = { sm: "size-10 [&_svg]:size-[19px]", md: "size-11 [&_svg]:size-[21px]", lg: "size-[54px] [&_svg]:size-[24px]" };
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 items-center justify-center rounded-full ${tones[tone]} ${sizes[size]}`}>
      <Icon name={icon} />
    </span>
  );
}

/* ───────────── Úvodná karta ───────────── */

function Hero({ recordHref, en }: { recordHref: string; en: boolean }) {
  return (
    <section aria-labelledby="hero-title" className="dash-hero relative isolate overflow-hidden rounded-[16px] border border-hero-line">
      {/* eslint-disable-next-line @next/next/no-img-element -- dekoratívne pozadie, rovnaký súbor ako na landingu */}
      <img src="/landing/hero.jpg" alt="" aria-hidden="true" className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-[75%_center]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-r from-ink via-ink/85 to-ink/10" />
      <div className="relative px-6 pt-7 pb-7 sm:px-[30px] sm:pt-9 sm:pb-[27px] md:max-w-[58%]">
        <p className="text-[11px] font-semibold tracking-[0.1em] text-periwinkle uppercase">{en ? "Your progress" : "Tvoj rozvoj"}</p>
        <h2 id="hero-title" className="mt-3.5 text-[34px] leading-[1.06] font-extrabold tracking-[-0.015em] text-paper sm:text-[44px]">
          {en ? "Your next training" : "Tvoj ďalší tréning"}
          <span className="block text-accent">{en ? "starts here" : "začína tu"}</span>
        </h2>
        <p className="mt-3 text-[15px] leading-relaxed text-slide sm:text-[16px]">
          {en ? "Pick a training type, record yourself and get tailored feedback." : "Vyber typ tréningu, nahraj sa a dostaneš spätnú väzbu na mieru."}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Link
            href={recordHref}
            className="dash-cta inline-flex h-11 items-center gap-3 rounded-full bg-signal pr-5 pl-[26px] text-[15px] font-bold text-on-signal transition-[transform,filter] duration-200 hover:-translate-y-0.5 hover:brightness-105 active:translate-y-0"
        >
            <PlayIcon className="size-[17px]" />
            {en ? "Start training" : "Začať tréning"}
            <Icon name="chevronRight" className="size-[18px]" strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Karty s metrikami ───────────── */

const STAT_ICONS: Record<StatCard["icon"], IconName> = { star: "star", gauge: "gauge", chat: "chat", timer: "timer" };

function StatTile({ card }: { card: StatCard }) {
  const verdictColor = card.delta
    ? card.delta.verdict === "better"
      ? "text-accent"
      : card.delta.verdict === "worse"
        ? "text-coral"
        : "text-mute"
    : "";
  return (
    <li className="dash-card flex min-w-0 flex-col p-[18px]" title={card.hint ?? undefined}>
      <div className="flex items-center gap-3.5">
        <IconBadge icon={STAT_ICONS[card.icon]} tone={card.tone} />
        <h3 className="min-w-0 text-[14px] leading-tight font-semibold text-paper">{card.label}</h3>
      </div>
      <p className="mt-[18px] flex items-baseline gap-1.5 whitespace-nowrap">
        {card.value !== null ? (
          <>
            <span className="text-[32px] leading-none font-bold tracking-[-0.02em] text-paper tabular-nums">{card.value}</span>
            {card.unit ? <span className="text-[20px] leading-none text-mute">{card.unit}</span> : null}
            {card.hint ? <span className="sr-only">({card.hint})</span> : null}
          </>
        ) : (
          <span className="text-[32px] leading-none font-bold text-faint">–</span>
        )}
      </p>
      <p className="mt-auto flex items-center gap-2.5 pt-4 text-[11.5px] text-faint">
        {card.delta ? (
          <>
            <span className={`flex items-center gap-1.5 text-[14px] font-bold tabular-nums ${verdictColor}`}>
              <Icon
                name={card.delta.sign === "up" ? "arrowUp" : card.delta.sign === "down" ? "arrowDown" : "arrowRight"}
                className="size-[15px]"
                strokeWidth={2.2}
              />
              <span aria-hidden="true">{card.delta.text}</span>
              <span className="sr-only">{card.delta.description}</span>
            </span>
            <span aria-hidden="true" className="truncate">
              {card.note}
            </span>
          </>
        ) : (
          <span className="truncate text-[12px]">{card.note}</span>
        )}
      </p>
    </li>
  );
}

/* ───────────── Kompozícia ───────────── */

export function DashboardView({
  stats,
  notice = null,
  checklist = [],
  href = (path) => path,
  locale = "sk",
}: DashboardViewData) {
  const en = locale === "en";
  return (
    <div className="dash-enter space-y-5">
      {notice}
      <div className="min-w-0 space-y-[18px]">
          <Hero recordHref={href("/app/nahravka")} en={en} />
          <GettingStarted items={checklist} href={href} en={en} />
          <section aria-label={en ? "Results of your latest pitch" : "Výsledky posledného tréningu"}>
            <ul className="grid grid-cols-1 gap-[18px] min-[420px]:grid-cols-2 2xl:grid-cols-4">
              {stats.map((card) => (
                <StatTile key={card.key} card={card} />
              ))}
            </ul>
          </section>
      </div>
    </div>
  );
}
