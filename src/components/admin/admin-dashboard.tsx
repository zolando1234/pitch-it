"use client";

import { useMemo, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import type { AdminOverview, AdminPlan, AdminUserRow } from "@/lib/admin/overview";
import { LANGUAGE_INFO, parseLanguage } from "@/lib/pitch/language";
import { TrendChart } from "@/components/admin/trend-chart";

/*
  Administrácia: používatelia, platiaci, využitie a zoznam účtov s vyhľadávaním.
*/

const TX = {
  sk: {
    title: "Administrácia",
    sub: (at: string) => `Stav k ${at}`,
    users: "Používatelia",
    usersNote: (d7: number, d30: number) => `+${d7} za 7 dní · +${d30} za 30 dní`,
    active: "Nahrali aspoň 1 pitch",
    activeNote: (pct: number) => `${pct} % registrovaných`,
    pitches: "Pitche spolu",
    pitchesNote: (d7: number, d30: number) => `${d7} za 7 dní · ${d30} za 30 dní`,
    paying: "Platiaci",
    payingNote: (pct: number, rev: string) => `${pct} % · tržby ${rev}`,
    perUser: "pitchov na aktívneho",
    camera: "s kamerou",
    qa: "s Q&A",
    avg: "priemerná dĺžka",
    failed: "neúspešných analýz",
    checkouts: "otvorených platieb",
    purchases: "dokončených nákupov",
    usedUp: "minuli pitche zadarmo, nekúpili",
    documents: "pridali Dokumenty",
    growth: "Vývoj",
    range: (d: number) => `${d} dní`,
    totalUsers: "Všetci používatelia",
    activeUsers: "Aktívni používatelia",
    activeUsersNote: "pitch za posledných 7 dní",
    repeatPayers: "Zaplatili viac ako raz",
    repeatNote: (n: number) => `z ${n} platiacich`,
    totalNote: "dnes",
    daily: "Posledných 30 dní",
    signups: "registrácie",
    pitchesLegend: "pitche",
    languages: "Jazyky pitchov",
    list: "Účty",
    search: "Hľadať e-mail alebo meno…",
    filters: { all: "Všetci", paid: "Platení", free: "Zadarmo", free_used_up: "Minuli zadarmo" },
    plan: { paid: "Platený", free: "Zadarmo", free_used_up: "Zadarmo, minuté" } as Record<AdminPlan, string>,
    cols: ["Používateľ", "Účet", "Registrácia", "Pitche", "Zadarmo", "Kredity", "Zaplatil", "Posledný pitch"],
    none: "Nikto nevyhovuje filtru.",
    min: "min",
  },
  en: {
    title: "Admin",
    sub: (at: string) => `As of ${at}`,
    users: "Users",
    usersNote: (d7: number, d30: number) => `+${d7} in 7 days · +${d30} in 30 days`,
    active: "Recorded at least 1 pitch",
    activeNote: (pct: number) => `${pct} % of sign-ups`,
    pitches: "Pitches total",
    pitchesNote: (d7: number, d30: number) => `${d7} in 7 days · ${d30} in 30 days`,
    paying: "Paying",
    payingNote: (pct: number, rev: string) => `${pct} % · revenue ${rev}`,
    perUser: "pitches per active user",
    camera: "with camera",
    qa: "with Q&A",
    avg: "average length",
    failed: "failed analyses",
    checkouts: "checkouts opened",
    purchases: "purchases completed",
    usedUp: "used up free pitches, didn't buy",
    documents: "added Documents",
    growth: "Trend",
    range: (d: number) => `${d} days`,
    totalUsers: "Total users",
    activeUsers: "Active users",
    activeUsersNote: "a pitch in the last 7 days",
    repeatPayers: "Paid more than once",
    repeatNote: (n: number) => `of ${n} paying`,
    totalNote: "today",
    daily: "Last 30 days",
    signups: "sign-ups",
    pitchesLegend: "pitches",
    languages: "Pitch languages",
    list: "Accounts",
    search: "Search email or name…",
    filters: { all: "All", paid: "Paid", free: "Free", free_used_up: "Used up free" },
    plan: { paid: "Paid", free: "Free", free_used_up: "Free, used up" } as Record<AdminPlan, string>,
    cols: ["User", "Plan", "Registered", "Pitches", "Free used", "Credits", "Paid", "Last pitch"],
    none: "Nobody matches the filter.",
    min: "min",
  },
};

const PLAN_STYLE: Record<AdminPlan, string> = {
  paid: "bg-signal/15 text-accent",
  free: "bg-white/5 text-mute",
  free_used_up: "bg-marker/15 text-marker",
};

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="dash-card p-5">
      <p className="text-[13px] font-semibold text-mute">{label}</p>
      <p className="mt-2 text-[32px] font-extrabold leading-none text-paper tabular-nums">{value}</p>
      {note ? <p className="mt-2 text-[13px] text-faint">{note}</p> : null}
    </div>
  );
}

function Small({ value, label }: { value: string | number; label: string }) {
  return (
    <div className="rounded-2xl border border-line px-4 py-3">
      <p className="text-[20px] font-bold text-paper tabular-nums">{value}</p>
      <p className="text-[12px] text-mute">{label}</p>
    </div>
  );
}

export function AdminDashboard({ data }: { data: AdminOverview }) {
  const locale = useLocale();
  const tx = TX[locale];
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | AdminPlan>("all");
  const [days, setDays] = useState<30 | 90>(30);
  const growth = data.growth.slice(-days);
  const fmtDate = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "sk-SK", { day: "numeric", month: "numeric", year: "2-digit" }) : "–";
  const eur = (cents: number) => (locale === "en" ? `€${(cents / 100).toFixed(2)}` : `${(cents / 100).toFixed(2).replace(".", ",")} €`);
  const dec = (v: number) => (locale === "en" ? String(v) : String(v).replace(".", ","));
  const max = Math.max(1, ...data.daily.map((d) => Math.max(d.signups, d.pitches)));

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.rows.filter(
      (r: AdminUserRow) => (filter === "all" || r.plan === filter) && (!q || r.email.toLowerCase().includes(q) || (r.name ?? "").toLowerCase().includes(q)),
    );
  }, [data.rows, query, filter]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-extrabold text-paper">{tx.title}</h1>
        <p className="text-sm text-mute">{tx.sub(new Date(data.generatedAt).toLocaleString(locale === "en" ? "en-GB" : "sk-SK"))}</p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label={tx.users} value={data.users.total} note={tx.usersNote(data.users.last7, data.users.last30)} />
        <Tile label={tx.active} value={data.activation.withPitch} note={tx.activeNote(data.activation.pct)} />
        <Tile label={tx.pitches} value={data.pitches.total} note={tx.pitchesNote(data.pitches.last7, data.pitches.last30)} />
        <Tile label={tx.paying} value={data.paying.users} note={tx.payingNote(data.paying.pct, eur(data.paying.revenueCents))} />
      </section>

      <section aria-labelledby="vyvoj-nadpis" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="vyvoj-nadpis" className="text-[17px] font-bold text-paper">
            {tx.growth}
          </h2>
          <div className="flex gap-2" role="radiogroup" aria-label={tx.growth}>
            {([30, 90] as const).map((d) => (
              <button
                key={d}
                type="button"
                role="radio"
                aria-checked={days === d}
                onClick={() => setDays(d)}
                className={`rounded-full border-2 px-3 py-1 text-[13px] font-bold ${days === d ? "border-signal bg-signal/10 text-paper" : "border-line text-mute"}`}
              >
                {tx.range(d)}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          <TrendChart title={tx.totalUsers} value={data.users.total} note={tx.totalNote} points={growth.map((g) => ({ date: g.date, value: g.total }))} formatDate={fmtDate} />
          <TrendChart title={tx.activeUsers} value={data.now.active} note={tx.activeUsersNote} points={growth.map((g) => ({ date: g.date, value: g.active }))} formatDate={fmtDate} />
          <TrendChart
            title={tx.repeatPayers}
            value={data.now.repeatPayers}
            note={tx.repeatNote(data.paying.users)}
            points={growth.map((g) => ({ date: g.date, value: g.repeatPayers }))}
            formatDate={fmtDate}
          />
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Small value={dec(data.pitches.perActiveUser)} label={tx.perUser} />
        <Small value={data.pitches.withCamera} label={tx.camera} />
        <Small value={data.pitches.withQa} label={tx.qa} />
        <Small value={`${dec(data.pitches.avgMinutes)} ${tx.min}`} label={tx.avg} />
        <Small value={data.pitches.failed} label={tx.failed} />
        <Small value={data.paying.checkoutsStarted} label={tx.checkouts} />
        <Small value={data.paying.purchases} label={tx.purchases} />
        <Small value={data.paying.freeUsedUp} label={tx.usedUp} />
      </section>

      <section className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <div className="dash-card p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[17px] font-bold text-paper">{tx.daily}</h2>
            <span className="flex items-center gap-4 text-[12px] text-mute">
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm bg-violet" /> {tx.signups}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="inline-block h-2.5 w-2.5 rounded-sm bg-signal" /> {tx.pitchesLegend}
              </span>
            </span>
          </div>
          <div className="mt-4 flex h-40 items-end gap-1">
            {data.daily.map((d) => (
              <div key={d.date} className="flex h-full flex-1 items-end gap-[2px]" title={`${fmtDate(d.date)}: ${d.signups} ${tx.signups}, ${d.pitches} ${tx.pitchesLegend}`}>
                <span className="w-1/2 rounded-t bg-violet" style={{ height: `${(d.signups / max) * 100}%`, minHeight: d.signups ? 3 : 0 }} />
                <span className="w-1/2 rounded-t bg-signal" style={{ height: `${(d.pitches / max) * 100}%`, minHeight: d.pitches ? 3 : 0 }} />
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-faint">
            <span>{fmtDate(data.daily[0]?.date ?? null)}</span>
            <span>{fmtDate(data.daily.at(-1)?.date ?? null)}</span>
          </div>
        </div>
        <div className="dash-card p-5">
          <h2 className="text-[17px] font-bold text-paper">{tx.languages}</h2>
          <ul className="mt-3 flex flex-col gap-2">
            {data.languages.map((l) => (
              <li key={l.code} className="flex items-center justify-between text-sm">
                <span className="text-paper">{locale === "en" ? LANGUAGE_INFO[parseLanguage(l.code)].english : LANGUAGE_INFO[parseLanguage(l.code)].label}</span>
                <span className="font-bold tabular-nums text-mute">{l.count}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-mute">
            {data.documentsUsers} {tx.documents}
          </p>
        </div>
      </section>

      <section className="dash-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[17px] font-bold text-paper">
            {tx.list} <span className="text-mute">({rows.length})</span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(tx.filters) as Array<keyof typeof tx.filters>).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-full border-2 px-3 py-1 text-[13px] font-bold ${filter === f ? "border-signal bg-signal/10 text-paper" : "border-line text-mute"}`}
              >
                {tx.filters[f]}
              </button>
            ))}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tx.search}
              className="h-9 w-56 rounded-full border border-line bg-transparent px-4 text-sm text-paper placeholder:text-faint focus:border-signal focus:outline-none"
            />
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[12px] uppercase tracking-wider text-faint">
                {tx.cols.map((c) => (
                  <th key={c} className="py-2 pr-3 font-semibold">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line/60">
                  <td className="py-2.5 pr-3">
                    <p className="font-semibold text-paper">{r.email}</p>
                    <p className="text-[12px] text-faint">
                      {r.name ?? "–"}
                      {r.provider && r.provider !== "email" ? ` · ${r.provider}` : ""}
                    </p>
                  </td>
                  <td className="py-2.5 pr-3">
                    <span className={`whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold ${PLAN_STYLE[r.plan]}`}>{tx.plan[r.plan]}</span>
                  </td>
                  <td className="py-2.5 pr-3 text-mute">{fmtDate(r.registeredAt)}</td>
                  <td className="py-2.5 pr-3 font-bold tabular-nums text-paper">{r.pitches}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-mute">{r.freeUsed} / 3</td>
                  <td className="py-2.5 pr-3 tabular-nums text-mute">{r.credits}</td>
                  <td className="py-2.5 pr-3 tabular-nums text-mute">{r.paidCents ? eur(r.paidCents) : "–"}</td>
                  <td className="py-2.5 pr-3 text-mute">{fmtDate(r.lastPitchAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? <p className="py-6 text-center text-sm text-mute">{tx.none}</p> : null}
        </div>
      </section>
    </div>
  );
}
