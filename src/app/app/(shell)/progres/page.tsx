import type { Metadata } from "next";
import Link from "next/link";
import { LineChart, type LinePoint } from "@/components/charts/line-chart";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { listOwnPitchAttempts } from "@/lib/db/pitch";
import { formatDateTime, formatNumber, formatShortDate, plural } from "@/lib/format";
import { TEMPO_TARGET } from "@/lib/pitch/metrics";
import { firstAndLast, improved, METRICS, progressRows, type MetricKey, type PitchProgressRow } from "@/lib/pitch/progress";

// Stránka závisí od dát používateľa: navigácia smie počkať na server.
export const instant = false;

export const metadata: Metadata = { title: "Progres" };

const ORDER: MetricKey[] = ["body", "content", "fillers", "tempo", "outline"];

const fmt = (key: MetricKey, value: number) => formatNumber(value, METRICS[key].digits);
const lengthLabel = (s: number) => (s >= 60 ? `${s / 60} min` : `${s} s`);

function points(rows: PitchProgressRow[], key: MetricKey): LinePoint[] {
  return rows
    .filter((r) => r[key] !== null)
    .map((r) => ({
      key: r.id,
      xLabel: `${r.number}.`,
      value: r[key] as number,
      detail: `${r.number}. pitch · ${formatShortDate(r.createdAt)} · ${lengthLabel(r.targetSeconds)}`,
    }));
}

function SummaryCard({ rows, metric }: { rows: PitchProgressRow[]; metric: MetricKey }) {
  const range = firstAndLast(rows, metric);
  if (!range) return null;
  const info = METRICS[metric];
  const better = improved(metric, range.first, range.last);
  const tone = better === null ? "text-mute" : better ? "text-accent" : "text-coral";
  const arrow = range.last > range.first ? "↑" : range.last < range.first ? "↓" : "→";
  return (
    <div className="dash-card p-5">
      <p className="text-[13px] font-semibold text-mute">{info.title}</p>
      <p className="mt-2 text-[28px] font-extrabold leading-none text-paper">
        {fmt(metric, range.last)} <span className="text-[14px] font-semibold text-mute">{info.unit}</span>
      </p>
      <p className={`mt-2 text-[13px] font-semibold ${tone}`}>
        {range.count > 1 ? (
          <>
            {arrow} z {fmt(metric, range.first)} pri prvom pitchi
          </>
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

  if (!rows.length) {
    return (
      <>
        <PageHeader title="Progres" description="Tu uvidíš, ako sa tvoje pitche zlepšujú od prvého pokusu." />
        <section className="dash-card flex flex-col items-start gap-4 p-6">
          <p className="text-[15px] text-mute">Zatiaľ nemáš žiadny vyhodnotený pitch. Nahraj prvý a progres sa začne zapisovať.</p>
          <Link href="/app/nahravka" className="inline-flex h-11 items-center rounded-full bg-signal px-6 text-[15px] font-bold text-on-signal hover:brightness-105">
            Nahrať pitch
          </Link>
        </section>
      </>
    );
  }

  const metrics = ORDER.filter((key) => firstAndLast(rows, key));

  return (
    <>
      <PageHeader
        title="Progres"
        description={`${rows.length} ${plural(rows.length, "vyhodnotený pitch", "vyhodnotené pitche", "vyhodnotených pitchov")}. Porovnanie s prvým pokusom a priebeh v čase.`}
        actions={
          <Link href="/app/nahravka" className="inline-flex h-10 items-center rounded-full bg-signal px-5 text-[14px] font-bold text-on-signal hover:brightness-105">
            Nahrať ďalší pitch
          </Link>
        }
      />

      <section aria-label="Súhrn" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {metrics.map((key) => (
          <SummaryCard key={key} rows={rows} metric={key} />
        ))}
      </section>

      {rows.length > 1 ? (
        <section aria-label="Priebeh" className="mt-6 grid gap-4 md:grid-cols-2">
          {metrics.map((key) => (
            <LineChart
              key={key}
              title={METRICS[key].title}
              unit={METRICS[key].unit}
              digits={METRICS[key].digits}
              points={points(rows, key)}
              band={key === "tempo" ? { low: TEMPO_TARGET.min, high: TEMPO_TARGET.max, label: "cieľ" } : undefined}
            />
          ))}
        </section>
      ) : null}

      <section aria-labelledby="pokusy" className="dash-card mt-6 p-5">
        <h2 id="pokusy" className="text-[17px] font-bold text-paper">
          Všetky pitche
        </h2>
        <ul className="mt-3 divide-y divide-line/70">
          {[...rows].reverse().map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-paper">
                  {r.number}. pitch · {lengthLabel(r.targetSeconds)} · {r.languageLabel}
                </p>
                <p className="text-[13px] text-mute">
                  {formatDateTime(r.createdAt)}
                  {r.body !== null ? ` · reč tela ${fmt("body", r.body)}` : ""}
                  {r.content !== null ? ` · obsah ${fmt("content", r.content)}/10` : ""}
                  {r.fillers !== null ? ` · výplne ${fmt("fillers", r.fillers)}/min` : ""}
                  {r.outline !== null ? ` · osnova ${r.outline} %` : ""}
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
