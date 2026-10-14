import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, type LinePoint } from "@/components/charts/line-chart";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { listOwnPitchAttempts } from "@/lib/db/pitch";
import { formatDateTime, formatNumber, formatShortDate, plural } from "@/lib/format";
import { TEMPO_TARGET } from "@/lib/pitch/metrics";
import {
  filterRows,
  firstAndLast,
  improved,
  METRICS,
  metricText,
  progressRows,
  topicsOf,
  TRAINING_KINDS,
  type MetricKey,
  type PitchProgressRow,
  type TrainingKind,
} from "@/lib/pitch/progress";
import { getLocale } from "@/lib/i18n/server";
import { LANGUAGE_INFO, PITCH_LANGUAGES } from "@/lib/pitch/language";

type Locale = "sk" | "en";
const dateTimeEn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Bratislava" });
const shortDateEn = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/Bratislava" });
/** Názov jazyka pitchu v angličtine (riadky majú slovenský/natívny názov). */
const languageEn = (label: string) => PITCH_LANGUAGES.map((l) => LANGUAGE_INFO[l]).find((i) => i.label === label)?.english ?? label;

// Stránka závisí od dát používateľa: navigácia smie počkať na server.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Progress" : "Progres" };
}

const ORDER: MetricKey[] = ["body", "content", "fillers", "tempo", "outline", "qa"];

const KIND_LABELS: Record<Locale, Record<TrainingKind, string>> = {
  sk: { public: "Verejné vystúpenie", client: "Tréning s AI klientom", meeting: "Skutočné stretnutie" },
  en: { public: "Public speaking", client: "AI client practice", meeting: "Real meeting" },
};

/** Odkaz na progres s filtrom (prázdne hodnoty sa vynechajú). */
function filterHref(kind: TrainingKind | null, topicKey: string | null): string {
  const params = new URLSearchParams();
  if (kind) params.set("typ", kind);
  if (topicKey) params.set("tema", topicKey);
  const query = params.toString();
  return query ? `/app/progres?${query}` : "/app/progres";
}

function FilterChip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? "true" : undefined}
      className={`inline-flex max-w-full items-center gap-2 truncate rounded-full border-2 px-3.5 py-1.5 text-[13px] font-bold transition ${
        active ? "border-signal bg-signal/10 text-paper" : "border-line text-mute hover:border-faint"
      }`}
    >
      {children}
    </Link>
  );
}

const fmt = (key: MetricKey, value: number, locale: Locale = "sk") =>
  locale === "en" ? value.toFixed(METRICS[key].digits) : formatNumber(value, METRICS[key].digits);
const lengthLabel = (s: number) => (s >= 60 ? `${s / 60} min` : `${s} s`);

function points(rows: PitchProgressRow[], key: MetricKey, locale: Locale): LinePoint[] {
  const en = locale === "en";
  return rows
    .filter((r) => r[key] !== null)
    .map((r) => ({
      key: r.id,
      xLabel: `${r.number}.`,
      value: r[key] as number,
      detail: en
        ? `Attempt ${r.number} · ${shortDateEn.format(new Date(r.createdAt))} · ${lengthLabel(r.targetSeconds)}`
        : `${r.number}. pokus · ${formatShortDate(r.createdAt)} · ${lengthLabel(r.targetSeconds)}`,
    }));
}

function SummaryCard({ rows, metric, locale }: { rows: PitchProgressRow[]; metric: MetricKey; locale: Locale }) {
  const range = firstAndLast(rows, metric);
  if (!range) return null;
  const info = metricText(metric, locale);
  const en = locale === "en";
  const better = improved(metric, range.first, range.last);
  const tone = better === null ? "text-mute" : better ? "text-accent" : "text-coral";
  const arrow = range.last > range.first ? "↑" : range.last < range.first ? "↓" : "→";
  return (
    <div className="dash-card p-5">
      <p className="text-[13px] font-semibold text-mute">{info.title}</p>
      <p className="mt-2 text-[28px] font-extrabold leading-none text-paper">
        {fmt(metric, range.last, locale)} <span className="text-[14px] font-semibold text-mute">{info.unit}</span>
      </p>
      <p className={`mt-2 text-[13px] font-semibold ${tone}`}>
        {range.count > 1 ? (
          <>
            {arrow} {en ? `from ${fmt(metric, range.first, locale)} on your first attempt` : `z ${fmt(metric, range.first)} pri prvom pokuse`}
          </>
        ) : en ? (
          "Just one attempt so far"
        ) : (
          "Zatiaľ jeden pokus"
        )}
      </p>
    </div>
  );
}

export default async function ProgressPage({ searchParams }: PageProps<"/app/progres">) {
  const user = await requireUser("/app/progres");
  const allRows = progressRows(await listOwnPitchAttempts(user.id, 200));
  const locale = await getLocale();
  const en = locale === "en";
  const params = await searchParams;
  const kind = TRAINING_KINDS.find((k) => k === params.typ) ?? null;
  // témy podľa zvoleného typu, aby ponuka obsahovala len to, čo sa dá vybrať
  const kindRows = filterRows(allRows, { kind });
  const topics = topicsOf(kindRows);
  const topicKey = typeof params.tema === "string" && topics.some((t) => t.key === params.tema) ? params.tema : null;
  const rows = filterRows(allRows, { kind, topicKey });
  const kindCounts = Object.fromEntries(TRAINING_KINDS.map((k) => [k, allRows.filter((r) => r.mode === k).length])) as Record<TrainingKind, number>;
  const untitled = en ? "Without a topic" : "Bez témy";

  if (!allRows.length) {
    return (
      <>
        <PageHeader
          title={en ? "Progress" : "Progres"}
          description={en ? "Here you'll see how your pitches improve from the first attempt." : "Tu uvidíš, ako sa tvoje pitche zlepšujú od prvého pokusu."}
        />
        <section className="dash-card flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] text-mute">
            {en ? "You don't have an evaluated pitch yet. Record your first one and your progress starts being tracked." : "Zatiaľ nemáš žiadny vyhodnotený pitch. Nahraj prvý a progres sa začne zapisovať."}
          </p>
          <Link href="/app/nahravka" className="inline-flex h-11 items-center rounded-full bg-signal px-6 text-[15px] font-bold text-on-signal hover:brightness-105">
            {en ? "Record pitch" : "Nahrať pitch"}
          </Link>
        </section>
      </>
    );
  }

  const metrics = ORDER.filter((key) => firstAndLast(rows, key));

  return (
    <>
      <PageHeader
        title={en ? "Progress" : "Progres"}
        description={
          en
            ? `${rows.length} evaluated ${rows.length === 1 ? "pitch" : "pitches"}. Comparison with your first attempt and progress over time.`
            : `${rows.length} ${plural(rows.length, "vyhodnotený pitch", "vyhodnotené pitche", "vyhodnotených pitchov")}. Porovnanie s prvým pokusom a priebeh v čase.`
        }
        actions={
          <Link href="/app/nahravka" className="inline-flex h-10 items-center rounded-full bg-signal px-5 text-[14px] font-bold text-on-signal hover:brightness-105">
            {en ? "Record another pitch" : "Nahrať ďalší pitch"}
          </Link>
        }
      />

      <section aria-label={en ? "Filter" : "Filter"} className="dash-card mb-6 flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-[13px] font-semibold text-mute">{en ? "Training type" : "Typ tréningu"}</span>
          <FilterChip href={filterHref(null, null)} active={!kind}>
            {en ? "All" : "Všetko"} <span className="text-faint">{allRows.length}</span>
          </FilterChip>
          {TRAINING_KINDS.filter((k) => kindCounts[k] > 0).map((k) => (
            <FilterChip key={k} href={filterHref(k, null)} active={kind === k}>
              {KIND_LABELS[locale][k]} <span className="text-faint">{kindCounts[k]}</span>
            </FilterChip>
          ))}
        </div>
        {topics.length ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13px] font-semibold text-mute">{en ? "Topic" : "Téma"}</span>
            <FilterChip href={filterHref(kind, null)} active={!topicKey}>
              {en ? "All topics" : "Všetky témy"}
            </FilterChip>
            {topics.map((t) => (
              <FilterChip key={t.key} href={filterHref(kind, t.key)} active={topicKey === t.key}>
                <span className="truncate" title={t.topic}>
                  {t.topic.length > 48 ? `${t.topic.slice(0, 48)}…` : t.topic}
                </span>
                <span className="text-faint">{t.count}</span>
              </FilterChip>
            ))}
          </div>
        ) : null}
      </section>

      {!rows.length ? (
        <p className="dash-card p-5 text-[15px] text-mute">{en ? "No attempts match the filter." : "Filtru nezodpovedá žiadny pokus."}</p>
      ) : null}

      <section aria-label={en ? "Summary" : "Súhrn"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {metrics.map((key) => (
          <SummaryCard key={key} rows={rows} metric={key} locale={locale} />
        ))}
      </section>

      {rows.length > 1 ? (
        <section aria-label={en ? "Progress over time" : "Priebeh"} className="mt-6 grid gap-4 md:grid-cols-2">
          {metrics.map((key) => (
            <LineChart
              key={key}
              title={metricText(key, locale).title}
              unit={metricText(key, locale).unit}
              digits={METRICS[key].digits}
              points={points(rows, key, locale)}
              band={key === "tempo" ? { low: TEMPO_TARGET.min, high: TEMPO_TARGET.max, label: en ? "target" : "cieľ" } : undefined}
            />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="pokusy" className="dash-card mt-6 p-5">
        <h2 id="pokusy" className="text-[17px] font-bold text-paper">
          {en ? "All attempts" : "Všetky pokusy"}
        </h2>
        <ul className="mt-3 divide-y divide-line/70">
          {[...rows].reverse().map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-paper">
                  {en ? `Attempt ${r.number}` : `${r.number}. pokus`} · {KIND_LABELS[locale][r.mode]} · {lengthLabel(r.targetSeconds)} · {en ? languageEn(r.languageLabel) : r.languageLabel}
                </p>
                <p className="truncate text-[13px] text-paper/80">{r.topic || untitled}</p>
                <p className="text-[13px] text-mute">
                  {en ? dateTimeEn.format(new Date(r.createdAt)) : formatDateTime(r.createdAt)}
                  {r.body !== null ? ` · ${en ? "body language" : "reč tela"} ${fmt("body", r.body, locale)}` : ""}
                  {r.content !== null ? ` · ${en ? "content" : "obsah"} ${fmt("content", r.content, locale)}/10` : ""}
                  {r.fillers !== null ? ` · ${en ? "fillers" : "výplne"} ${fmt("fillers", r.fillers, locale)}/min` : ""}
                  {r.outline !== null ? ` · ${en ? "outline" : "osnova"} ${r.outline} %` : ""}
                  {r.qa !== null ? ` · ${en ? "answers" : "odpovede"} ${fmt("qa", r.qa, locale)}/10` : ""}
                </p>
              </div>
              <Link href={`/app/nahravka/${r.id}`} className="text-[14px] font-semibold text-accent hover:underline">
                Feedback →
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
