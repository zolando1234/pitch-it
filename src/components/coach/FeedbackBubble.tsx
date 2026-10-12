import { useLocale } from "@/components/i18n/locale-provider";
import type { FeedbackState } from "@/lib/coach/pose/feedback";
import { STATUS_COLOR } from "@/lib/coach/pose/renderer";

const LABEL = {
  sk: { good: "Dobre", warn: "Pozor", bad: "Oprav", idle: "Čakám" },
  en: { good: "Good", warn: "Watch out", bad: "Fix", idle: "Waiting" },
} as const;
const ICON = { good: "✓", warn: "!", bad: "✕", idle: "…" } as const;

/** Veľká bublina, ktorá sa dá prečítať aj z 3 metrov. */
export default function FeedbackBubble({ fb }: { fb: FeedbackState }) {
  const locale = useLocale();
  const color = STATUS_COLOR[fb.status];
  return (
    <div
      key={fb.ruleId ?? fb.title}
      className="animate-pop flex items-center gap-5 rounded-3xl border-4 bg-black/85 px-6 py-5 backdrop-blur-md md:gap-7 md:px-8 md:py-6"
      style={{ borderColor: color, boxShadow: `0 0 80px -10px ${color}` }}
    >
      <span
        className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-4xl font-black text-black md:h-20 md:w-20 md:text-5xl"
        style={{ background: color }}
        aria-label={LABEL[locale][fb.status]}
      >
        {ICON[fb.status]}
      </span>
      <div className="min-w-0">
        <p className="text-4xl font-black leading-[1.05] text-white md:text-5xl xl:text-6xl">{fb.title}</p>
        <p className="mt-2 text-lg leading-snug text-white/90 md:text-xl xl:text-2xl">{fb.tip}</p>
      </div>
    </div>
  );
}
