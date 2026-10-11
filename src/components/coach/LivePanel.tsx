import type { FeedbackState } from "@/lib/coach/pose/feedback";
import type { Metrics, Side } from "@/lib/coach/pose/metrics";
import { STATUS_COLOR } from "@/lib/coach/pose/renderer";
import { CONFIG } from "@/lib/coach/pose/config";
import { GROUPS, RULES } from "@/lib/coach/pose/rules";

export function ScoreRing({ score, color, size = 140 }: { score: number; color: string; size?: number }) {
  const r = size / 2 - 10;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} stroke="#262626" strokeWidth="10" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="10"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - score / 100)}
        style={{ transition: "stroke-dashoffset 0.4s, stroke 0.4s" }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="rotate-90 fill-white font-black"
        style={{ fontSize: size * 0.3, transformOrigin: "center" }}
      >
        {score}
      </text>
    </svg>
  );
}

function Meter({ label, value, ok, hint }: { label: string; value: number; ok: boolean; hint: string }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs uppercase tracking-wider text-mute">
        <span>{label}</span>
        <span className={ok ? "text-accent" : "text-marker"}>{hint}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${Math.round(Math.min(1, value) * 100)}%`, background: ok ? "#aaff00" : "#ffc94d" }}
        />
      </div>
    </div>
  );
}

/** Tri dieliky ľavo / stred / vpravo, výška = podiel času. */
export function SideShare({ label, share }: { label: string; share: Record<Side, number> }) {
  const sides: [Side, string][] = [
    ["left", "Ľ"],
    ["center", "S"],
    ["right", "P"],
  ];
  return (
    <div>
      <p className="mb-1 text-xs uppercase tracking-wider text-mute">{label}</p>
      <div className="flex h-10 items-end gap-1">
        {sides.map(([id, short]) => (
          <div key={id} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex h-7 w-full items-end overflow-hidden rounded bg-line">
              <div
                className="w-full rounded bg-signal transition-all duration-300"
                style={{ height: `${Math.max(4, share[id] * 100)}%`, opacity: 0.4 + share[id] * 0.6 }}
              />
            </div>
            <span className="text-[10px] text-faint">{short}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LivePanel({ fb, m }: { fb: FeedbackState; m: Metrics | null }) {
  const color = STATUS_COLOR[fb.status];
  const activity = m?.activity3s ?? 0;
  const zone = m && m.visibleWrists ? m.wristsInZone / m.visibleWrists : 0;
  const spread = m?.spread ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-5">
        <ScoreRing score={fb.score} color={color} />
        <div>
          <p className="text-xs uppercase tracking-widest text-faint">Živé skóre</p>
          <p className="text-sm text-mute">posledné sekundy · výsledné skóre je prísnejšie</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <Meter
          label="Aktivita rúk"
          value={activity / 3}
          ok={activity > 0.18 && activity < 2.8}
          hint={activity < 0.18 ? "nízka" : activity > 2.8 ? "vysoká" : "ok"}
        />
        <Meter label="V power zóne" value={zone} ok={zone >= 0.5} hint={`${Math.round(zone * 100)} %`} />
        <Meter
          label="Otvorenosť"
          value={spread / 2}
          ok={spread >= 0.55}
          hint={spread >= 0.55 ? "otvorené" : "uzavreté"}
        />
        <Meter
          label="Gestá za minútu"
          value={(m?.gesturesPerMin ?? 0) / 30}
          ok={(m?.gesturesPerMin ?? 0) >= CONFIG.fewGesturesPerMin}
          hint={m?.gesturesPerMin == null ? "meriam…" : `${Math.round(m.gesturesPerMin)} / min`}
        />
        {m && <SideShare label="Rozloženie pohľadu (20 s)" share={m.gazeShare} />}
      </div>

      <div className="flex flex-col gap-4">
        {GROUPS.map((g) => {
          const rules = RULES.filter((r) => r.group === g.id);
          const hit = rules.filter((r) => fb.activeIds.includes(r.id));
          const sev = hit.some((r) => r.severity === "bad") ? "bad" : hit.length ? "warn" : "good";
          const live = fb.status !== "idle";
          return (
            <div key={g.id}>
              <div className="flex items-center gap-3 text-sm">
                <span
                  className="h-3 w-3 rounded-full transition-colors"
                  style={{ background: live ? STATUS_COLOR[sev] : "#404040" }}
                />
                <span className="font-semibold text-paper">{g.title}</span>
              </div>
              {live && hit.length > 0 && (
                <ul className="mt-1 ml-6 text-xs text-mute">
                  {hit.map((r) => (
                    <li key={r.id}>{r.title}</li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
