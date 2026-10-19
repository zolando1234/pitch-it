import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart, type LinePoint } from "@/components/charts/line-chart";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getOwnedTeam, listMemberAttempts, listTeamMembers } from "@/lib/db/teams";
import { formatDate, formatDateTime, formatNumber, formatShortDate, plural } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { METRICS, metricText, progressRows, type MetricKey, type PitchProgressRow, type TrainingKind } from "@/lib/pitch/progress";
import { isUuid } from "@/lib/validation/ids";
import { summarizeMember } from "@/lib/teams/progress";

// Stránka závisí od dát používateľa: navigácia smie počkať na server.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Team member progress" : "Progres člena tímu", robots: { index: false } };
}

const ORDER: MetricKey[] = ["content", "qa", "body", "fillers", "outline"];
const KINDS: Record<"sk" | "en", Record<TrainingKind, string>> = {
  sk: { public: "Verejné vystúpenie", client: "Tréning s AI klientom", meeting: "Skutočné stretnutie" },
  en: { public: "Public speaking", client: "AI client practice", meeting: "Real meeting" },
};

const lengthLabel = (s: number) => (s >= 60 ? `${Math.round((s / 60) * 10) / 10} min` : `${s} s`);

function points(rows: PitchProgressRow[], key: MetricKey, en: boolean): LinePoint[] {
  return rows
    .filter((r) => r[key] !== null)
    .map((r) => ({
      key: r.id,
      xLabel: `${r.number}.`,
      value: r[key] as number,
      detail: en ? `Attempt ${r.number} · ${formatShortDate(r.createdAt)}` : `${r.number}. pokus · ${formatShortDate(r.createdAt)}`,
    }));
}

export default async function MemberProgressPage({ params }: PageProps<"/app/tim/clen/[id]">) {
  const user = await requireUser("/app/tim");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [team, locale] = await Promise.all([getOwnedTeam(user.id), getLocale()]);
  if (!team) notFound();
  const member = (await listTeamMembers(team.id)).find((m) => m.userId === id);
  if (!member) notFound();

  const en = locale === "en";
  const L = (sk: string, enText: string) => (en ? enText : sk);
  const attempts = await listMemberAttempts(team.id, id);
  const rows = progressRows(attempts);
  const durations = new Map(attempts.map((a) => [a.id, Math.round((a.duration_ms ?? a.target_seconds * 1000) / 1000)]));
  const summary = summarizeMember(rows, durations);
  const who = member.name || member.email || L("Člen tímu", "Team member");
  const fmt = (key: MetricKey, value: number) => (en ? value.toFixed(METRICS[key].digits) : formatNumber(value, METRICS[key].digits));
  const scored = ORDER.filter((key) => rows.some((r) => r[key] !== null));

  return (
    <>
      <PageHeader
        back={
          <Link href="/app/tim" className="text-[14px] font-semibold text-accent hover:underline">
            ← {L("Späť na tím", "Back to the team")}
          </Link>
        }
        title={who}
        description={
          member.email && member.name
            ? `${member.email} · ${L(`v tíme od ${formatDate(member.joinedAt)}`, `in the team since ${formatDate(member.joinedAt)}`)}`
            : L(`V tíme od ${formatDate(member.joinedAt)}`, `In the team since ${formatDate(member.joinedAt)}`)
        }
      />

      <p className="mb-6 max-w-[42rem] text-[13.5px] leading-relaxed text-faint">
        {L(
          "Vidíš počet pokusov, dĺžku, tému a skóre. Prepisy, nahrávky ani podrobný report člena sa ti nezobrazujú.",
          "You see the number of attempts, length, topic and scores. The member's transcripts, recordings and detailed reports are not shown to you.",
        )}
      </p>

      <section aria-label={L("Súhrn", "Summary")} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={L("Pokusov spolu", "Attempts in total")} value={String(summary.attempts)} />
        <Stat label={L("Tento týždeň", "This week")} value={String(summary.thisWeek)} note={L(`${summary.thisMonth} tento mesiac`, `${summary.thisMonth} this month`)} />
        <Stat label={L("Nahraté minúty", "Recorded minutes")} value={String(summary.minutes)} />
        <Stat
          label={L("Posledný pokus", "Last attempt")}
          value={summary.lastAt ? formatShortDate(summary.lastAt) : "–"}
          note={summary.daysSince === null ? L("zatiaľ žiadny", "none yet") : summary.daysSince === 0 ? L("dnes", "today") : L(`pred ${summary.daysSince} ${plural(summary.daysSince, "dňom", "dňami", "dňami")}`, `${summary.daysSince} days ago`)}
        />
      </section>

      {rows.length === 0 ? (
        <p className="dash-card mt-6 p-5 text-[15px] text-mute">{L("Tento člen ešte nevyskúšal žiadny tréning.", "This member hasn't tried any training yet.")}</p>
      ) : (
        <>
          <section aria-label={L("Priebeh skóre", "Score progress")} className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(["content", "qa", "body"] as const).map((key) => {
              const r = summary[key];
              if (!r) return null;
              const info = metricText(key, locale);
              const arrow = r.last > r.first ? "↑" : r.last < r.first ? "↓" : "→";
              return (
                <div key={key} className="dash-card p-5">
                  <p className="text-[13px] font-semibold text-mute">{info.title}</p>
                  <p className="mt-2 text-[28px] font-extrabold leading-none text-paper">
                    {fmt(key, r.last)} <span className="text-[14px] font-semibold text-mute">{info.unit}</span>
                  </p>
                  <p className="mt-2 text-[13px] font-semibold text-mute">
                    {r.count > 1 ? `${arrow} ${L(`z ${fmt(key, r.first)} na začiatku, priemer ${fmt(key, r.avg)}`, `from ${fmt(key, r.first)} at the start, average ${fmt(key, r.avg)}`)}` : L("Zatiaľ jeden pokus", "Just one attempt so far")}
                  </p>
                </div>
              );
            })}
          </section>

          <section aria-label={L("Typy tréningu", "Training types")} className="dash-card mt-6 p-5">
            <h2 className="text-[17px] font-bold text-paper">{L("Čo trénuje", "What they practise")}</h2>
            <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[14.5px] text-paper/90">
              {(Object.keys(summary.byKind) as TrainingKind[])
                .filter((k) => summary.byKind[k] > 0)
                .map((k) => (
                  <li key={k}>
                    {KINDS[locale][k]}: <b>{summary.byKind[k]}×</b>
                  </li>
                ))}
            </ul>
          </section>

          {rows.length > 1 && scored.length ? (
            <section aria-label={L("Priebeh v čase", "Progress over time")} className="mt-6 grid gap-4 md:grid-cols-2">
              {scored.map((key) => (
                <LineChart key={key} title={metricText(key, locale).title} unit={metricText(key, locale).unit} digits={METRICS[key].digits} points={points(rows, key, en)} />
              ))}
            </section>
          ) : null}

          <section aria-labelledby="pokusy" className="dash-card mt-6 p-5">
            <h2 id="pokusy" className="text-[17px] font-bold text-paper">
              {L("Všetky pokusy", "All attempts")}
            </h2>
            <ul className="mt-3 divide-y divide-line/70">
              {[...rows].reverse().map((r) => (
                <li key={r.id} className="py-3">
                  <p className="text-[15px] font-semibold text-paper">
                    {L(`${r.number}. pokus`, `Attempt ${r.number}`)} · {KINDS[locale][r.mode]} · {lengthLabel(durations.get(r.id) ?? r.targetSeconds)}
                  </p>
                  <p className="truncate text-[13px] text-paper/80">{r.topic || L("Bez témy", "Without a topic")}</p>
                  <p className="text-[13px] text-mute">
                    {formatDateTime(r.createdAt)}
                    {r.content !== null ? ` · ${L("obsah", "content")} ${fmt("content", r.content)}/10` : ""}
                    {r.qa !== null ? ` · ${L("odpovede", "answers")} ${fmt("qa", r.qa)}/10` : ""}
                    {r.body !== null ? ` · ${L("reč tela", "body language")} ${fmt("body", r.body)}` : ""}
                    {r.fillers !== null ? ` · ${L("výplne", "fillers")} ${fmt("fillers", r.fillers)}/min` : ""}
                    {r.outline !== null ? ` · ${L("osnova", "outline")} ${r.outline} %` : ""}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="dash-card p-5">
      <p className="text-[13px] font-semibold text-mute">{label}</p>
      <p className="mt-2 text-[28px] font-extrabold leading-none text-paper">{value}</p>
      {note ? <p className="mt-2 text-[13px] text-mute">{note}</p> : null}
    </div>
  );
}
