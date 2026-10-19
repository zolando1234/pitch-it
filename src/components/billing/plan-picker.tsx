"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/submit-button";
import { formatEur } from "@/lib/billing/pitch-pack";
import {
  FREE_SECONDS,
  PLAN_PRICES,
  PRO_WEEKLY_SECONDS,
  stackedPercent,
  SUBSCRIBER_DISCOUNT_PERCENT,
  TEAM_DISCOUNT_TIERS,
  TEAM_MAX_SEATS,
  teamChargeCents,
  TOPUP,
  topupCentsPerMinute,
  topupPrice,
  yearlySavingPercent,
  type BillingInterval,
  type PaidPlan,
  type PlanId,
} from "@/lib/billing/pricing";

/*
  Cenník a nákup: karty plánov (Free, Pro, Unlimited) s prepínačom mesačne/ročne,
  dokúpenie minút k Pro a správa predplatného. Na verejnom cenníku vedú tlačidlá na registráciu.
*/

const TX = {
  sk: {
    monthly: "Mesačne",
    yearly: "Ročne",
    save: (p: number) => `až −${p} %`,
    perMonth: "/ mesiac",
    billedYearly: (total: string) => `pri ročnej platbe ${total} ročne`,
    billedMonthly: "platba mesačne, zrušíš kedykoľvek",
    free: "Free",
    freeTag: "Vyskúšaj si to",
    freePrice: "0 €",
    freeNote: "raz po registrácii",
    pro: "Pro",
    proTag: "Pre pravidelný tréning",
    unlimited: "Unlimited",
    unlimitedTag: "Bez počítania minút",
    features: {
      free: [`${FREE_SECONDS / 60} minút nahrávania zadarmo`, "Rozdelíš si ich, ako chceš", "Všetky typy tréningu a celý report", "Bez platobnej karty"],
      pro: ["Plný prístup ku všetkým tréningom", `${PRO_WEEKLY_SECONDS / 60} minút nahrávania týždenne`, "Prejavy až do 30 minút", <TopupFeature key="topup" locale="sk" />],
      unlimited: ["Všetko z plánu Pro", "Bez časového limitu", "Prejavy až do 60 minút, vlastná dĺžka", "Ideálne na každodenný tréning"],
    },
    choose: "Vybrať",
    current: "Tvoj plán",
    switch: "Prejsť na",
    start: "Začať zadarmo",
    opening: "Otváram…",
    changed: "Plán je zmenený.",
    failed: "Platbu sa nepodarilo otvoriť. Skús to znova.",
    noServer: "Nepodarilo sa spojiť so serverom.",
    disabled: "Platby zatiaľ nie sú zapnuté.",
    topupTitle: "Dokúpiť minúty",
    topupLabel: "Minúty",
    topupBuy: (m: number) => `Kúpiť ${m} min za`,
    extraMinutes: "Minúty navyše za",
    perMinute: "/min",
    subscriberDiscount: (p: number) => `−${p} % pre predplatiteľov`,
    was: "pôvodne",
    promoLabel: "Zľavový kód",
    promoPlaceholder: "napr. TESTER",
    promoNote: "Zľava sa ukáže v platobnej bráne pred zaplatením.",
    promoChecking: "Overujem kód…",
    promoOk: (c: string, p: number) => `Kód ${c} platí: −${p} % na prvú mesačnú platbu. Ceny nižšie sú už so zľavou.`,
    promoWrongInterval: (c: string) => `Kód ${c} platí len na mesačné predplatné. Prepni na Mesačne.`,
    codeBadge: (c: string, p: number) => `${c} −${p} %`,
    firstMonth: (then: string) => `prvý mesiac, potom ${then} mesačne`,
    teamFirstTotal: (first: string, n: string, then: string) => `prvý mesiac spolu ${first} za ${n}, potom ${then} mesačne`,
    perAccount: "/ účet / mesiac",
    accounts: (n: number) => `${n} ${n === 1 ? "účet" : n < 5 ? "účty" : "účtov"}`,
    teamTotal: (total: string, n: string, yearly: boolean) => `spolu ${total} ${yearly ? "ročne" : "mesačne"} za ${n}`,
    teamDiscount: (p: number) => `−${p} % tímová zľava`,
    seatsLabel: "Počet účtov (vrátane teba)",
    seatsMin: (n: number) => `Tím má teraz ${n}, menej sa nedá.`,
    tiers: (tiers: string) => `Tímová zľava: ${tiers}.`,
    tier: (min: number, p: number) => `od ${min} účtov −${p} %`,
    less: "Menej účtov",
    more: "Viac účtov",
    forMe: "Pre mňa",
    forTeam: "Pre tím (viac účtov)",
    teamIntro: "Zaplatíš plán za viac účtov naraz s tímovou zľavou.",
    manageTeam: "Spravovať tím: pozvať alebo odobrať ľudí",
    createTeam: "Založiť tím a pozvať kolegov",
    topupNote: `Dokúpené minúty neprepadajú, míňajú sa až po týždenných ${PRO_WEEKLY_SECONDS / 60} minútach.`,
    manage: "Spravovať predplatné",
    manageNote: "Zrušenie, platobná karta a faktúry.",
  },
  en: {
    monthly: "Monthly",
    yearly: "Yearly",
    save: (p: number) => `up to −${p}%`,
    perMonth: "/ month",
    billedYearly: (total: string) => `billed yearly at ${total}`,
    billedMonthly: "billed monthly, cancel anytime",
    free: "Free",
    freeTag: "Try it out",
    freePrice: "€0",
    freeNote: "once after sign-up",
    pro: "Pro",
    proTag: "For regular practice",
    unlimited: "Unlimited",
    unlimitedTag: "No minutes to count",
    features: {
      free: [`${FREE_SECONDS / 60} free recording minutes`, "Split them however you like", "All training types and the full report", "No credit card"],
      pro: ["Full access to all trainings", `${PRO_WEEKLY_SECONDS / 60} recording minutes per week`, "Talks up to 30 minutes", <TopupFeature key="topup" locale="en" />],
      unlimited: ["Everything in Pro", "No time limit", "Talks up to 60 minutes, custom length", "Made for daily practice"],
    },
    choose: "Choose",
    current: "Your plan",
    switch: "Switch to",
    start: "Start for free",
    opening: "Opening…",
    changed: "Your plan has changed.",
    failed: "The payment could not be opened. Try again.",
    noServer: "Could not connect to the server.",
    disabled: "Payments are not enabled yet.",
    topupTitle: "Buy extra minutes",
    topupLabel: "Minutes",
    topupBuy: (m: number) => `Buy ${m} min for`,
    extraMinutes: "Extra minutes at",
    perMinute: "/min",
    subscriberDiscount: (p: number) => `−${p}% for subscribers`,
    was: "was",
    promoLabel: "Discount code",
    promoPlaceholder: "e.g. TESTER",
    promoNote: "The discount is shown in the checkout before you pay.",
    promoChecking: "Checking the code…",
    promoOk: (c: string, p: number) => `Code ${c} is valid: −${p}% on the first monthly payment. Prices below include it.`,
    promoWrongInterval: (c: string) => `Code ${c} only works with monthly billing. Switch to Monthly.`,
    codeBadge: (c: string, p: number) => `${c} −${p}%`,
    firstMonth: (then: string) => `first month, then ${then} per month`,
    teamFirstTotal: (first: string, n: string, then: string) => `first month ${first} in total for ${n}, then ${then} per month`,
    perAccount: "/ account / month",
    accounts: (n: number) => `${n} ${n === 1 ? "account" : "accounts"}`,
    teamTotal: (total: string, n: string, yearly: boolean) => `${total} ${yearly ? "per year" : "per month"} in total for ${n}`,
    teamDiscount: (p: number) => `−${p}% team discount`,
    seatsLabel: "Number of accounts (including you)",
    seatsMin: (n: number) => `Your team has ${n} now, you can't go lower.`,
    tiers: (tiers: string) => `Team discount: ${tiers}.`,
    tier: (min: number, p: number) => `${min}+ accounts −${p}%`,
    less: "Fewer accounts",
    more: "More accounts",
    forMe: "Just me",
    forTeam: "For a team (several accounts)",
    teamIntro: "Pay for several accounts at once with a team discount.",
    manageTeam: "Manage team: invite or remove people",
    createTeam: "Create a team and invite colleagues",
    topupNote: `Extra minutes don't expire and are used only after your weekly ${PRO_WEEKLY_SECONDS / 60} minutes.`,
    manage: "Manage subscription",
    manageNote: "Cancel, payment card and invoices.",
  },
};

async function postForUrl(path: string, body: unknown): Promise<{ url?: string; changed?: boolean; error?: string }> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const data = (await response.json().catch(() => null)) as { url?: string; changed?: boolean; error?: { message?: string } } | null;
    if (response.ok && (data?.url || data?.changed)) return { url: data.url, changed: data.changed };
    return { error: data?.error?.message };
  } catch {
    return { error: "network" };
  }
}

type ActivePromo = { code: string; percentOff: number; interval: BillingInterval };

function Badge({ children }: { children: ReactNode }) {
  return <span className="ml-2 inline-block rounded-full bg-signal/15 px-2 py-0.5 text-[12px] font-bold text-accent">{children}</span>;
}

/** Cena v karte plánu: jednotlivec, tím (cena za účet a suma) a pri platnom kóde prvá platba po zľave. */
function Price({
  plan,
  interval,
  locale,
  seats = 1,
  promo = null,
}: {
  plan: PaidPlan;
  interval: BillingInterval;
  locale: "sk" | "en";
  seats?: number;
  promo?: ActivePromo | null;
}) {
  const tx = TX[locale];
  const price = PLAN_PRICES[plan];
  const monthly = interval === "year" ? price.yearlyMonthlyCents : price.monthlyCents;
  const yearly = interval === "year";
  // kód platí len na svoje obdobie (TESTER: mesačne)
  const code = promo && promo.interval === interval ? promo : null;
  const team = teamChargeCents(plan, interval, seats);
  const percent = code ? stackedPercent(code.percentOff, team.discountPercent) : team.discountPercent;
  const perAccount = Math.round((monthly * (100 - percent)) / 100);
  const firstTotal = Math.round((team.fullCents * (100 - percent)) / 100);

  if (seats > 1) {
    return (
      <>
        <p className="mt-5 text-[2.2rem] font-semibold leading-none text-paper">
          <DiscountedPrice fullCents={monthly} cents={perAccount} locale={locale} />
          <span className="ml-2 text-base font-normal text-faint">{tx.perAccount}</span>
        </p>
        <p className="mt-2 text-[13px] text-faint">
          {code
            ? tx.teamFirstTotal(formatEur(firstTotal, locale), tx.accounts(seats), formatEur(team.cents, locale))
            : tx.teamTotal(formatEur(team.cents, locale), tx.accounts(seats), yearly)}
          <Badge>{tx.teamDiscount(team.discountPercent)}</Badge>
          {code ? <Badge>{tx.codeBadge(code.code, code.percentOff)}</Badge> : null}
        </p>
      </>
    );
  }
  if (code) {
    return (
      <>
        <p className="mt-5 text-[2.6rem] font-semibold leading-none text-paper">
          <DiscountedPrice fullCents={monthly} cents={perAccount} locale={locale} />
          <span className="ml-2 text-base font-normal text-faint">{tx.perMonth}</span>
        </p>
        <p className="mt-2 text-[13px] text-faint">
          {tx.firstMonth(formatEur(monthly, locale))}
          <Badge>{tx.codeBadge(code.code, code.percentOff)}</Badge>
        </p>
      </>
    );
  }
  return (
    <>
      <p className="mt-5 text-[2.6rem] font-semibold leading-none text-paper">
        {formatEur(monthly, locale)}
        <span className="ml-2 text-base font-normal text-faint">{tx.perMonth}</span>
      </p>
      <p className="mt-2 text-[13px] text-faint">{yearly ? tx.billedYearly(formatEur(price.yearlyMonthlyCents * 12, locale)) : tx.billedMonthly}</p>
    </>
  );
}

/** Pôvodná cena prečiarknutá, nová cena vedľa nej (čítačka obrazovky dostane „pôvodne“). */
function DiscountedPrice({ fullCents, cents, locale }: { fullCents: number; cents: number; locale: "sk" | "en" }) {
  if (cents >= fullCents) return <>{formatEur(cents, locale)}</>;
  return (
    <>
      <s className="opacity-60">
        <span className="sr-only">{TX[locale].was} </span>
        {formatEur(fullCents, locale)}
      </s>{" "}
      {formatEur(cents, locale)}
    </>
  );
}

function DiscountBadge({ locale }: { locale: "sk" | "en" }) {
  return (
    <span className="ml-2 inline-block rounded-full bg-signal/15 px-2 py-0.5 text-[12px] font-bold text-accent">
      {TX[locale].subscriberDiscount(SUBSCRIBER_DISCOUNT_PERCENT)}
    </span>
  );
}

/** Riadok v karte Pro: cena minúty navyše so zľavou pre predplatiteľov. */
function TopupFeature({ locale }: { locale: "sk" | "en" }) {
  const tx = TX[locale];
  return (
    <span>
      {tx.extraMinutes} <DiscountedPrice fullCents={TOPUP.centsPerMinute} cents={topupCentsPerMinute("pro")} locale={locale} />
      {tx.perMinute}
      <DiscountBadge locale={locale} />
    </span>
  );
}

function Features({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-6 flex-1 space-y-2.5">
      {items.map((item, index) => (
        <li key={index} className="flex gap-3 text-[14.5px] leading-relaxed text-paper/90">
          <span aria-hidden="true" className="mt-[0.7em] h-px w-4 shrink-0 bg-signal-soft" />
          {item}
        </li>
      ))}
    </ul>
  );
}

/**
 * Karty plánov. `mode="public"`: tlačidlá vedú na registráciu (cenník na webe).
 * `mode="app"`: nákup alebo zmena plánu prihláseného používateľa.
 */
export function PlanPicker({
  mode,
  current = "free",
  currentInterval = null,
  paymentsEnabled = true,
  showFree = true,
  seats,
  currentSeats = 1,
}: {
  mode: "public" | "app";
  current?: PlanId;
  currentInterval?: BillingInterval | null;
  paymentsEnabled?: boolean;
  showFree?: boolean;
  /** tímový plán: počet účtov, za ktoré sa platí (bez neho sa ponechá súčasný počet) */
  seats?: number;
  currentSeats?: number;
}) {
  const locale = useLocale();
  const tx = TX[locale];
  const [interval, setInterval] = useState<BillingInterval>(currentInterval ?? "year");
  const [pending, setPending] = useState<PaidPlan | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [code, setCode] = useState("");
  const [promo, setPromo] = useState<ActivePromo | null>(null);
  const [promoState, setPromoState] = useState<{ status: "idle" | "checking" | "error"; message?: string }>({ status: "idle" });
  // kód sa zadáva len pri novom predplatnom (zmena plánu ide bez Checkoutu)
  // kód platí aj pre tím (prvá platba má obe zľavy)
  const canUseCode = mode === "app" && current === "free" && paymentsEnabled;

  // náhľad zľavového kódu: server overí kód chvíľu po dopísaní, ceny v kartách sa prepočítajú
  useEffect(() => {
    const trimmed = code.trim();
    if (!canUseCode || !trimmed) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/billing/kod", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
          signal: controller.signal,
        });
        const data = (await response.json().catch(() => null)) as (Partial<ActivePromo> & { error?: { message?: string } }) | null;
        if (response.ok && data?.code && typeof data.percentOff === "number" && (data.interval === "month" || data.interval === "year")) {
          setPromo({ code: data.code, percentOff: data.percentOff, interval: data.interval });
          setPromoState({ status: "idle" });
        } else {
          setPromoState({ status: "error", message: data?.error?.message ?? tx.failed });
        }
      } catch {
        if (!controller.signal.aborted) setPromoState({ status: "error", message: tx.noServer });
      }
    }, 450);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [code, canUseCode, tx.failed, tx.noServer]);

  const choose = async (plan: PaidPlan) => {
    setPending(plan);
    setMessage(null);
    const result = await postForUrl("/api/billing/predplatne", {
      plan,
      interval,
      ...(seats !== undefined ? { seats } : {}),
      ...(canUseCode && code.trim() ? { code: code.trim() } : {}),
    });
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    if (result.changed) {
      setMessage({ tone: "success", text: tx.changed });
      window.location.reload();
      return;
    }
    setPending(null);
    setMessage({ tone: "error", text: result.error === "network" ? tx.noServer : (result.error ?? tx.failed) });
  };

  const card = (plan: PaidPlan) => {
    const isCurrent = current === plan && (currentInterval === null || currentInterval === interval) && (seats === undefined || seats === currentSeats);
    const highlight = plan === "pro";
    return (
      <section key={plan} className={`flex min-w-0 flex-col rounded-[18px] border p-6 sm:p-7 ${highlight ? "border-signal/70 bg-panel" : "border-line bg-panel/50"}`}>
        <h3 className="type-heading text-[1.5rem]">{tx[plan]}</h3>
        <p className="mt-1 text-mute">{plan === "pro" ? tx.proTag : tx.unlimitedTag}</p>
        <Price plan={plan} interval={interval} locale={locale} seats={seats ?? 1} promo={canUseCode ? promo : null} />
        <Features items={tx.features[plan]} />
        {mode === "public" ? (
          <Link href="/registracia" className={buttonClasses({ size: "lg", variant: highlight ? "primary" : "secondary", className: "mt-8" })}>
            {`${tx.choose} ${tx[plan]}`}
          </Link>
        ) : (
          <button
            type="button"
            disabled={pending !== null || !paymentsEnabled || isCurrent}
            onClick={() => void choose(plan)}
            className={buttonClasses({ size: "lg", variant: highlight ? "primary" : "secondary", className: "mt-8" })}
          >
            {pending === plan ? (
              <>
                <Spinner />
                {tx.opening}
              </>
            ) : isCurrent ? (
              tx.current
            ) : current === "free" ? (
              `${tx.choose} ${tx[plan]}`
            ) : (
              `${tx.switch} ${tx[plan]}`
            )}
          </button>
        )}
      </section>
    );
  };

  return (
    <div>
      <div role="radiogroup" aria-label={`${tx.monthly} / ${tx.yearly}`} className="inline-flex rounded-full border border-line p-1">
        {(["month", "year"] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={interval === value}
            onClick={() => setInterval(value)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${interval === value ? "bg-signal text-on-signal" : "text-mute hover:text-paper"}`}
          >
            {value === "month" ? tx.monthly : tx.yearly}
            {value === "year" ? <span className="ml-1.5 text-[12px] opacity-80">{tx.save(Math.max(yearlySavingPercent("pro"), yearlySavingPercent("unlimited")))}</span> : null}
          </button>
        ))}
      </div>
      {canUseCode ? (
        <div className="mt-4">
          <label className="flex flex-wrap items-center gap-2 text-sm text-mute">
            {tx.promoLabel}
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setPromo(null);
                setPromoState({ status: e.target.value.trim() ? "checking" : "idle" });
              }}
              placeholder={tx.promoPlaceholder}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              className="w-40 rounded-xl border border-line bg-transparent px-3 py-2 text-base font-bold uppercase text-paper placeholder:font-normal placeholder:normal-case placeholder:text-faint focus:border-signal focus:outline-none"
            />
          </label>
          {promoState.status === "checking" ? <p className="mt-1.5 text-[13px] text-faint">{tx.promoChecking}</p> : null}
          {promoState.status === "error" ? (
            <p role="alert" className="mt-1.5 text-[13px] text-coral">
              {promoState.message}
            </p>
          ) : null}
          {promo ? (
            <p role="status" className={`mt-1.5 text-[13px] ${promo.interval === interval ? "text-accent" : "text-marker"}`}>
              {promo.interval === interval ? tx.promoOk(promo.code, promo.percentOff) : tx.promoWrongInterval(promo.code)} {tx.promoNote}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={`mt-6 grid gap-5 ${showFree ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
        {showFree ? (
          <section className="flex min-w-0 flex-col rounded-[18px] border border-line bg-panel/50 p-6 sm:p-7">
            <h3 className="type-heading text-[1.5rem]">{tx.free}</h3>
            <p className="mt-1 text-mute">{tx.freeTag}</p>
            <p className="mt-5 text-[2.6rem] font-semibold leading-none text-paper">{tx.freePrice}</p>
            <p className="mt-2 text-[13px] text-faint">{tx.freeNote}</p>
            <Features items={tx.features.free} />
            {mode === "public" ? (
              <Link href="/registracia" className={buttonClasses({ size: "lg", variant: "secondary", className: "mt-8" })}>
                {tx.start}
              </Link>
            ) : null}
          </section>
        ) : null}
        {card("pro")}
        {card("unlimited")}
      </div>
      {mode === "app" && !paymentsEnabled ? <p className="mt-4 text-sm text-marker">{tx.disabled}</p> : null}
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`mt-4 text-[14.5px] ${message.tone === "error" ? "text-coral" : "text-accent"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Tímový plán: počet účtov (vrátane vlastníka) a karty plánov s cenou za účet po množstevnej zľave.
 * Menej účtov, ako má tím členov a pozvánok, sa zvoliť nedá.
 */
export function TeamPlanPicker({
  current,
  currentInterval,
  currentSeats,
  minSeats,
  paymentsEnabled,
}: {
  current: PlanId;
  currentInterval: BillingInterval | null;
  currentSeats: number;
  minSeats: number;
  paymentsEnabled: boolean;
}) {
  const locale = useLocale();
  const tx = TX[locale];
  const floor = Math.min(TEAM_MAX_SEATS, Math.max(2, minSeats));
  const [seats, setSeats] = useState(Math.max(floor, currentSeats));
  // pole sa dá voľne prepísať, počet sa ustáli pri opustení poľa
  const [draft, setDraft] = useState<string | null>(null);
  const clamp = (n: number) => Math.min(TEAM_MAX_SEATS, Math.max(floor, Number.isFinite(n) ? Math.round(n) : floor));
  const tiers = [...TEAM_DISCOUNT_TIERS].reverse().map((t) => tx.tier(t.minSeats, t.percent)).join(", ");
  const stepClass = "h-10 w-10 rounded-xl border border-line text-lg font-bold text-paper hover:border-signal disabled:opacity-40";
  return (
    <div>
      <label htmlFor="team-seats" className="text-sm text-mute">
        {tx.seatsLabel}
      </label>
      <div className="mt-2 flex items-center gap-2">
        <button type="button" aria-label={tx.less} className={stepClass} disabled={seats <= floor} onClick={() => setSeats((n) => clamp(n - 1))}>
          −
        </button>
        <input
          id="team-seats"
          type="number"
          inputMode="numeric"
          min={floor}
          max={TEAM_MAX_SEATS}
          value={draft ?? String(seats)}
          onChange={(e) => {
            setDraft(e.target.value);
            const n = Number(e.target.value);
            if (Number.isInteger(n) && n >= floor && n <= TEAM_MAX_SEATS) setSeats(n);
          }}
          onBlur={() => {
            if (draft !== null) setSeats(clamp(Number(draft)));
            setDraft(null);
          }}
          className="w-20 rounded-xl border border-line bg-transparent px-3 py-2 text-center text-base font-bold text-paper focus:border-signal focus:outline-none"
        />
        <button type="button" aria-label={tx.more} className={stepClass} disabled={seats >= TEAM_MAX_SEATS} onClick={() => setSeats((n) => clamp(n + 1))}>
          +
        </button>
      </div>
      <p className="mt-2 text-[13px] text-faint">
        {tx.tiers(tiers)}
        {minSeats > 2 ? ` ${tx.seatsMin(minSeats)}` : ""}
      </p>
      <div className="mt-6">
        <PlanPicker mode="app" current={current} currentInterval={currentInterval} paymentsEnabled={paymentsEnabled} showFree={false} seats={seats} currentSeats={currentSeats} />
      </div>
    </div>
  );
}

/**
 * Výber plánu v Nastaveniach: pre jednotlivca alebo pre tím (počet účtov s tímovou zľavou).
 * Vlastník tímu alebo ten, kto už platí viac účtov, začína na karte tímu.
 */
export function PlanChooser({
  current,
  currentInterval,
  currentSeats,
  minTeamSeats,
  paymentsEnabled,
  ownsTeam,
}: {
  current: PlanId;
  currentInterval: BillingInterval | null;
  currentSeats: number;
  /** vlastník + členovia + pozvánky (bez tímu 1) */
  minTeamSeats: number;
  paymentsEnabled: boolean;
  ownsTeam: boolean;
}) {
  const locale = useLocale();
  const tx = TX[locale];
  const [team, setTeam] = useState(ownsTeam || currentSeats > 1);
  return (
    <div>
      <div role="tablist" className="mb-6 inline-flex flex-wrap rounded-full border border-line p-1">
        {([false, true] as const).map((value) => (
          <button
            key={String(value)}
            type="button"
            role="tab"
            aria-selected={team === value}
            onClick={() => setTeam(value)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition ${team === value ? "bg-signal text-on-signal" : "text-mute hover:text-paper"}`}
          >
            {value ? tx.forTeam : tx.forMe}
          </button>
        ))}
      </div>
      {team ? (
        <>
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <p className="text-[14.5px] text-mute">{tx.teamIntro}</p>
            <Link href="/app/tim" className={buttonClasses({ variant: "secondary" })}>
              {ownsTeam ? tx.manageTeam : tx.createTeam}
            </Link>
          </div>
          <TeamPlanPicker current={current} currentInterval={currentInterval} currentSeats={currentSeats} minSeats={minTeamSeats} paymentsEnabled={paymentsEnabled} />
        </>
      ) : (
        <PlanPicker mode="app" current={current} currentInterval={currentInterval} paymentsEnabled={paymentsEnabled} showFree={false} seats={1} currentSeats={currentSeats} />
      )}
    </div>
  );
}

/** Dokúpenie minút k Pro so zľavou pre predplatiteľov (množstvo sa dá ešte upraviť v Checkoute). */
export function TopupButton({ plan = "pro" }: { plan?: PlanId }) {
  const locale = useLocale();
  const tx = TX[locale];
  const [minutes, setMinutes] = useState<number>(TOPUP.defaultMinutes);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const valid = Number.isInteger(minutes) && minutes >= TOPUP.minMinutes && minutes <= TOPUP.maxMinutes;
  const shown = valid ? minutes : TOPUP.defaultMinutes;
  const price = topupPrice(shown, plan);

  const buy = async () => {
    setPending(true);
    setError(null);
    const result = await postForUrl("/api/billing/minuty", { minutes });
    if (result.url) {
      window.location.assign(result.url);
      return;
    }
    setPending(false);
    setError(result.error === "network" ? tx.noServer : (result.error ?? tx.failed));
  };

  return (
    <div>
      <p className="font-medium text-paper">
        {tx.topupTitle}
        {price.discountPercent > 0 ? <DiscountBadge locale={locale} /> : null}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-mute">
          {tx.topupLabel}
          <input
            type="number"
            inputMode="numeric"
            min={TOPUP.minMinutes}
            max={TOPUP.maxMinutes}
            step={10}
            value={Number.isFinite(minutes) ? minutes : ""}
            onChange={(e) => setMinutes(Math.round(Number(e.target.value)))}
            className="w-24 rounded-xl border border-line bg-transparent px-3 py-2 text-base font-bold text-paper focus:border-signal focus:outline-none"
          />
        </label>
        <button type="button" disabled={pending || !valid} onClick={() => void buy()} className={buttonClasses({ variant: "secondary" })}>
          {pending ? (
            <>
              <Spinner />
              {tx.opening}
            </>
          ) : (
            <>
              {tx.topupBuy(shown)} <DiscountedPrice fullCents={price.fullCents} cents={price.cents} locale={locale} />
            </>
          )}
        </button>
      </div>
      <p className="mt-2 text-[13px] text-faint">{tx.topupNote}</p>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Zákaznícky portál Stripe (zrušenie, karta, faktúry). */
export function ManageSubscriptionButton() {
  const locale = useLocale();
  const tx = TX[locale];
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={buttonClasses({ variant: "secondary" })}
        onClick={async () => {
          setPending(true);
          setError(null);
          const result = await postForUrl("/api/billing/portal", {});
          if (result.url) {
            window.location.assign(result.url);
            return;
          }
          setPending(false);
          setError(result.error === "network" ? tx.noServer : (result.error ?? tx.failed));
        }}
      >
        {pending ? <Spinner /> : null}
        {tx.manage}
      </button>
      <p className="mt-2 text-[13px] text-faint">{tx.manageNote}</p>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] text-coral">
          {error}
        </p>
      ) : null}
    </div>
  );
}
