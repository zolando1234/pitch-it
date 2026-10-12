import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, type LinePoint } from "@/components/charts/line-chart";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { listOwnPitchAttempts } from "@/lib/db/pitch";
import { formatDateTime, formatNumber, formatShortDate, plural } from "@/lib/format";
import { TEMPO_TARGET } from "@/lib/pitch/metrics";
import { firstAndLast, improved, METRICS, metricText, progressRows, type MetricKey, type PitchProgressRow } from "@/lib/pitch/progress";
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

const ORDER: MetricKey[] = ["body", "content", "fillers", "tempo", "outline"];

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
        ? `Pitch ${r.number} · ${shortDateEn.format(new Date(r.createdAt))} · ${lengthLabel(r.targetSeconds)}`
        : `${r.number}. pitch · ${formatShortDate(r.createdAt)} · ${lengthLabel(r.targetSeconds)}`,
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
            {arrow} {en ? `from ${fmt(metric, range.first, locale)} on your first pitch` : `z ${fmt(metric, range.first)} pri prvom pitchi`}
          </>
        ) : en ? (
          "Just one pitch so far"
        ) : (
          "Zatiaľ jeden pitch"
        )}
      </p>
    </div>
  );
}

export default async function ProgressPage() {
  const user = await requireUser("/app/progres");
  const rows = progressRows(await listOwnPitchAttempts(user.id, 200));
  const locale = await getLocale();
  const en = locale === "en";

  if (!rows.length) {
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

      <section aria-label={en ? "Summary" : "Súhrn"} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
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
          {en ? "All pitches" : "Všetky pitche"}
        </h2>
        <ul className="mt-3 divide-y divide-line/70">
          {[...rows].reverse().map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-paper">
                  {en ? `Pitch ${r.number}` : `${r.number}. pitch`} · {lengthLabel(r.targetSeconds)} · {en ? languageEn(r.languageLabel) : r.languageLabel}
                </p>
                <p className="text-[13px] text-mute">
                  {en ? dateTimeEn.format(new Date(r.createdAt)) : formatDateTime(r.createdAt)}
                  {r.body !== null ? ` · ${en ? "body language" : "reč tela"} ${fmt("body", r.body, locale)}` : ""}
                  {r.content !== null ? ` · ${en ? "content" : "obsah"} ${fmt("content", r.content, locale)}/10` : ""}
                  {r.fillers !== null ? ` · ${en ? "fillers" : "výplne"} ${fmt("fillers", r.fillers, locale)}/min` : ""}
                  {r.outline !== null ? ` · ${en ? "outline" : "osnova"} ${r.outline} %` : ""}
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
