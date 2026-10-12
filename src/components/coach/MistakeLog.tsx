"use client";

import { useMemo, useState } from "react";
import type { Mistake } from "@/lib/coach/pose/session";
import { STATUS_COLOR } from "@/lib/coach/pose/renderer";
import { RULE_BY_ID } from "@/lib/coach/pose/rules";
import { ruleCopy } from "@/lib/coach/pose/copy";
import { useLocale } from "@/components/i18n/locale-provider";
import MistakeClip from "./MistakeClip";

const fmt = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const severityColor = (id: string) => STATUS_COLOR[RULE_BY_ID[id]?.severity ?? "warn"];

/** Kde a kedy nastali chyby: značky na časovej osi + karty s fotkou z momentu chyby. */
export default function MistakeLog({
  mistakes,
  durationMs,
  videoUrl,
}: {
  mistakes: Mistake[];
  durationMs: number;
  /** nahrávka tréningu; bez nej sa zobrazia len fotky */
  videoUrl: string | null;
}) {
  const [filter, setFilter] = useState<string | null>(null);

  const kinds = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of mistakes) counts.set(m.id, (counts.get(m.id) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [mistakes]);

  const shown = filter ? mistakes.filter((m) => m.id === filter) : mistakes;
  const locale = useLocale();
  const en = locale === "en";
  const title = (id: string) => ruleCopy(id, locale).title;
  const total = Math.max(durationMs, 1);

  if (!mistakes.length) {
    return (
      <section>
        <h2 className="mb-3 text-sm uppercase tracking-widest text-faint">{en ? "Mistake log" : "Záznam chýb"}</h2>
        <p className="text-lg text-mute">{en ? "No mistakes recorded during the recording. Excellent!" : "Počas nahrávania sme nezaznamenali žiadnu chybu. Výborne!"}</p>
      </section>
    );
  }

  return (
    <section>
      <h2 className="mb-1 text-sm uppercase tracking-widest text-faint">{en ? "Mistake log" : "Záznam chýb"}</h2>
      <p className="mb-4 text-mute">
        {en
          ? `${mistakes.length} ${mistakes.length === 1 ? "mistake" : "mistakes"} during the recording. Click a marker on the timeline and play the clip to see exactly what you did.`
          : `${mistakes.length} ${mistakes.length === 1 ? "chyba" : mistakes.length < 5 ? "chyby" : "chýb"} počas nahrávania. Klikni na značku na časovej osi a prehraj si klip, aby si videl, čo presne si urobil.`}
      </p>

      {/* časová os so značkami */}
      <div className="relative h-14 w-full rounded-lg bg-panel">
        {[0.25, 0.5, 0.75].map((f) => (
          <div key={f} className="absolute top-0 h-full w-px bg-line" style={{ left: `${f * 100}%` }} />
        ))}
        {shown.map((m) => {
          const i = mistakes.indexOf(m);
          return (
            <a
              key={i}
              href={`#mistake-${i}`}
              title={`${fmt(m.start)} · ${title(m.id)}`}
              className="absolute top-2 h-10 min-w-1.5 rounded-sm opacity-85 transition hover:opacity-100 hover:ring-2 hover:ring-white"
              style={{
                left: `${(m.start / total) * 100}%`,
                width: `${Math.max(((m.end - m.start) / total) * 100, 0.6)}%`,
                background: severityColor(m.id),
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-xs text-faint">
        <span>0:00</span>
        <span>{fmt(durationMs)}</span>
      </div>

      {/* filter podľa typu chyby */}
      <div className="mt-5 flex flex-wrap gap-2">
        <button
          onClick={() => setFilter(null)}
          className={`rounded-full px-4 py-1.5 text-sm font-semibold ${!filter ? "bg-paper text-ink" : "bg-panel text-mute"}`}
        >
          {en ? "All" : "Všetky"} ({mistakes.length})
        </button>
        {kinds.map(([id, n]) => (
          <button
            key={id}
            onClick={() => setFilter(filter === id ? null : id)}
            className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${
              filter === id ? "bg-paper text-ink" : "bg-panel text-mute"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: severityColor(id) }} />
            {title(id)} ({n})
          </button>
        ))}
      </div>

      <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((m) => {
          const i = mistakes.indexOf(m);
          const rule = RULE_BY_ID[m.id] ? ruleCopy(m.id, locale) : null;
          const secs = Math.max(1, Math.round((m.end - m.start) / 1000));
          return (
            <li
              key={i}
              id={`mistake-${i}`}
              className="scroll-mt-6 overflow-hidden rounded-2xl border-2 bg-ink target:ring-4 target:ring-white"
              style={{ borderColor: severityColor(m.id) }}
            >
              <div className="relative aspect-video bg-panel">
                {videoUrl ? (
                  <MistakeClip
                    src={videoUrl}
                    snapshot={m.snapshot}
                    startMs={m.start}
                    endMs={m.end}
                    alt={`${en ? "Mistake moment" : "Moment chyby"}: ${rule?.title}`}
                  />
                ) : m.snapshot ? (
                  // eslint-disable-next-line @next/next/no-img-element -- lokálny data URL z kamery
                  <img src={m.snapshot} alt={`${en ? "Mistake moment" : "Moment chyby"}: ${rule?.title}`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-faint">{en ? "no photo" : "bez fotky"}</div>
                )}
                <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/80 px-2 py-1 font-mono text-sm font-bold">
                  {fmt(m.start)}
                </span>
              </div>
              <div className="p-4">
                <p className="text-lg font-bold">{rule?.title ?? m.id}</p>
                <p className="text-xs uppercase tracking-wider text-faint">{en ? `lasted ${secs} s` : `trvalo ${secs} s`}</p>
                <p className="mt-2 text-sm text-mute">{rule?.tip}</p>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
