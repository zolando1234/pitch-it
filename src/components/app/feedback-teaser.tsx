"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/app/icons";
import { useLocale } from "@/components/i18n/locale-provider";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { FEEDBACK_ANSWER_MAX, FEEDBACK_BONUS_SECONDS, FEEDBACK_COMMENT_MAX, FEEDBACK_LABELS, FEEDBACK_QUESTIONS, FEEDBACK_USES, type FeedbackKey, type FeedbackUse } from "@/lib/feedback/survey";

/*
  Ponuka „5 minút gratis“ v karte plánu (nad zostatkom minút) pre ľudí, ktorí už nahrali pitch: po kliknutí
  krátky dotazník (hviezdičky, tri povinné otázky a jedna voľná) za 5 minút zadarmo. Po odoslaní sa obnoví serverový obsah (karta plánu ukáže nové minúty, ponuka zmizne).
*/

const BONUS_MIN = FEEDBACK_BONUS_SECONDS / 60;

const TX = {
  sk: {
    bonus: `${BONUS_MIN} minút gratis`,
    dialogTitle: "Krátky dotazník",
    dialogNote: `Pár hviezdičiek a tri krátke odpovede. Za vyplnenie ti pripíšeme ${BONUS_MIN} minút zadarmo.`,
    optional: "Nepovinné",
    pickAll: "môžeš vybrať viac",
    stars: (n: number) => `${n} z 5 hviezdičiek`,
    missing: "Vyplň prosím všetky povinné otázky (hviezdičky aj tri odpovede).",
    cancel: "Zrušiť",
    submit: `Odoslať a získať +${BONUS_MIN} min`,
    sending: "Odosielam…",
    done: `Ďakujeme! Pripísali sme ti ${BONUS_MIN} minút zadarmo.`,
    failed: "Odoslanie zlyhalo. Skús to znova.",
  },
  en: {
    bonus: `${BONUS_MIN} free minutes`,
    dialogTitle: "Short survey",
    dialogNote: `A few stars and three short answers. We'll add ${BONUS_MIN} free minutes for filling it in.`,
    optional: "Optional",
    pickAll: "pick any",
    stars: (n: number) => `${n} of 5 stars`,
    missing: "Please answer all required questions (the stars and the three answers).",
    cancel: "Cancel",
    submit: `Send and get +${BONUS_MIN} min`,
    sending: "Sending…",
    done: `Thank you! We've added ${BONUS_MIN} free minutes.`,
    failed: "Sending failed. Please try again.",
  },
};

function StarRow({ label, value, onChange, starLabel }: { label: string; value: number; onChange: (v: number) => void; starLabel: (n: number) => string }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <fieldset>
      <legend className="text-[14.5px] font-semibold text-paper">{label}</legend>
      <div className="mt-2 flex gap-1" role="radiogroup" aria-label={label} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={starLabel(n)}
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            className="rounded-md p-1 transition-transform duration-100 hover:scale-110"
          >
            <Icon name="star" className={`size-8 ${n <= shown ? "[&_path]:fill-current text-accent" : "text-faint"}`} strokeWidth={1.5} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function TextQuestion({ label, hint, value, onChange, max, rows }: { label: string; hint?: string; value: string; onChange: (v: string) => void; max: number; rows: number }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[14.5px] font-semibold text-paper">
        {label} {hint ? <span className="font-normal text-faint">({hint})</span> : null}
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={max}
        rows={rows}
        required={!hint}
        className="w-full resize-y rounded-xl border border-line-strong bg-ink-2 px-3.5 py-2.5 text-[15px] text-paper placeholder:text-faint focus:border-signal focus:outline-none"
      />
    </label>
  );
}

export function FeedbackTeaser() {
  const locale = useLocale();
  const tx = TX[locale];
  const router = useRouter();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ratings, setRatings] = useState<Partial<Record<FeedbackKey, number>>>({});
  const [experience, setExperience] = useState("");
  const [usedFor, setUsedFor] = useState<FeedbackUse[]>([]);
  const [missing, setMissing] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) return null;

  const submit = () => {
    if (FEEDBACK_QUESTIONS.some((q) => !ratings[q.key]) || experience.trim().length < 2 || !usedFor.length || missing.trim().length < 2) {
      setError(tx.missing);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/hodnotenie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings, experience, usedFor, missing, comment }),
        });
        const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        if (!response.ok) {
          setError(data?.error?.message ?? tx.failed);
          return;
        }
        dialogRef.current?.close();
        setSent(true);
        toast.show(tx.done, "success");
        router.refresh();
      } catch {
        setError(tx.failed);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="mb-3.5 flex w-full items-center gap-2.5 rounded-xl border border-line-strong px-3 py-2 text-left leading-tight transition-colors duration-150 hover:bg-panel-2"
      >
        <Icon name="star" className="size-5 shrink-0 [&_path]:fill-current text-accent" strokeWidth={1.5} />
        <span className="text-[14px] font-bold text-accent">{tx.bonus}</span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="dotaznik-nadpis"
        className="m-auto max-h-[calc(100dvh-2rem)] w-[min(34rem,calc(100vw-2rem))] overflow-y-auto rounded-[16px] border border-line-strong bg-panel p-0 text-paper backdrop:bg-ink/80"
      >
        <div className="p-6">
          <h2 id="dotaznik-nadpis" className="type-heading text-[1.35rem]">
            {tx.dialogTitle}
          </h2>
          <p className="mt-2 text-[14.5px] leading-relaxed text-mute">{tx.dialogNote}</p>

          <div className="mt-5 flex flex-col gap-4">
            {FEEDBACK_QUESTIONS.map((q) => (
              <StarRow
                key={q.key}
                label={q[locale]}
                value={ratings[q.key] ?? 0}
                onChange={(v) => {
                  setRatings((r) => ({ ...r, [q.key]: v }));
                  setError(null);
                }}
                starLabel={tx.stars}
              />
            ))}
            <TextQuestion label={FEEDBACK_LABELS.experience[locale]} value={experience} onChange={setExperience} max={FEEDBACK_ANSWER_MAX} rows={3} />
            <fieldset>
              <legend className="text-[14.5px] font-semibold text-paper">
                {FEEDBACK_LABELS.usedFor[locale]} <span className="font-normal text-faint">({tx.pickAll})</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {FEEDBACK_USES.map((u) => {
                  const on = usedFor.includes(u.key);
                  return (
                    <button
                      key={u.key}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setUsedFor((list) => (on ? list.filter((k) => k !== u.key) : [...list, u.key]));
                        setError(null);
                      }}
                      className={`rounded-full border px-3.5 py-1.5 text-[14px] font-semibold transition-colors duration-150 ${
                        on ? "border-signal bg-signal text-on-signal" : "border-line-strong text-paper hover:bg-panel-2"
                      }`}
                    >
                      {u[locale]}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <TextQuestion label={FEEDBACK_LABELS.missing[locale]} value={missing} onChange={setMissing} max={FEEDBACK_ANSWER_MAX} rows={3} />
            <TextQuestion label={FEEDBACK_LABELS.comment[locale]} hint={tx.optional} value={comment} onChange={setComment} max={FEEDBACK_COMMENT_MAX} rows={3} />
          </div>

          {error ? (
            <p role="alert" className="mt-4 text-[14.5px] text-coral">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <button type="button" className={buttonClasses({ variant: "secondary" })} onClick={() => dialogRef.current?.close()} disabled={pending}>
              {tx.cancel}
            </button>
            <button type="button" onClick={submit} disabled={pending} className={buttonClasses()}>
              {pending ? (
                <>
                  <Spinner />
                  {tx.sending}
                </>
              ) : (
                tx.submit
              )}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
