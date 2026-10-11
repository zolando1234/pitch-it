import type { Drill, DrillProgress } from "@/lib/coach/modes";

/** Cieľ cvičenia a priebežný pokrok, dosť veľký na čítanie z diaľky. */
export default function DrillProgressCard({ drill, progress }: { drill: Drill; progress: DrillProgress }) {
  const color = progress.passed ? "#aaff00" : "#7d51fe";
  return (
    <div className="w-72 rounded-2xl border border-line bg-black/75 p-4 backdrop-blur-md md:w-80">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent">Cvičenie · {drill.title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-5xl font-black" style={{ color }}>
          {progress.text}
        </span>
        <span className="text-lg text-mute">/ {progress.targetText}</span>
        {progress.passed && <span className="ml-auto text-2xl font-black text-accent">✓</span>}
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-line">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{ width: `${progress.ratio * 100}%`, background: color }}
        />
      </div>
      <p className="mt-3 text-sm leading-snug text-mute">{drill.goal}</p>
    </div>
  );
}
