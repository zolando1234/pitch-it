"use client";

import { useState } from "react";

/*
  Malý čiarový graf jednej veličiny v čase (malé násobky: každý graf má vlastnú mierku).
  Pri prejdení myšou zvislá čiara, bod a popisok s dátumom a hodnotou.
*/

const W = 320;
const H = 120;
const PAD = { top: 10, right: 8, bottom: 18, left: 26 };

export function TrendChart({
  title,
  value,
  note,
  points,
  formatDate,
}: {
  title: string;
  value: number;
  note: string;
  points: Array<{ date: string; value: number }>;
  formatDate: (iso: string) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.value));
  // celé čísla: horná hranica osi zaokrúhlená nahor
  const top = max <= 4 ? max : Math.ceil(max / 4) * 4;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * innerW : innerW / 2);
  const y = (v: number) => PAD.top + innerH - (v / top) * innerH;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join("");
  const ticks = [0, top / 2, top].filter((v, i, a) => Number.isInteger(v) && a.indexOf(v) === i);
  const active = hover !== null ? points[hover] : null;

  const onMove = (event: React.PointerEvent<SVGRectElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const rel = ((event.clientX - rect.left) / rect.width) * innerW;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round((rel / innerW) * (points.length - 1)))));
  };

  return (
    <figure className="dash-card m-0 p-5">
      <figcaption className="flex items-baseline justify-between gap-3">
        <span className="text-[14px] font-semibold text-mute">{title}</span>
        <span className="text-[13px] text-faint">{active ? formatDate(active.date) : note}</span>
      </figcaption>
      <p className="mt-1 text-[32px] font-extrabold leading-none text-paper tabular-nums">{active ? active.value : value}</p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full overflow-visible" role="img" aria-label={`${title}: ${points.map((p) => `${formatDate(p.date)} ${p.value}`).join(", ")}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--color-faint)">
              {t}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 4} fontSize={10} fill="var(--color-faint)">
          {points.length ? formatDate(points[0].date) : ""}
        </text>
        <text x={W - PAD.right} y={H - 4} fontSize={10} fill="var(--color-faint)" textAnchor="end">
          {points.length ? formatDate(points[points.length - 1].date) : ""}
        </text>
        <path d={path} fill="none" stroke="var(--color-signal)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {active && hover !== null ? (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--color-mute)" strokeWidth={1} strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(active.value)} r={5} fill="var(--color-signal)" stroke="var(--color-panel)" strokeWidth={2} />
          </g>
        ) : null}
        <rect
          x={PAD.left}
          y={0}
          width={innerW}
          height={H}
          fill="transparent"
          onPointerMove={onMove}
          onPointerLeave={() => setHover(null)}
        />
      </svg>
    </figure>
  );
}
