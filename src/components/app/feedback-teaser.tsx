"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/app/icons";
import { useLocale } from "@/components/i18n/locale-provider";
import { buttonClasses } from "@/components/ui/button";
import { Spinner } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { FEEDBACK_BONUS_SECONDS, FEEDBACK_COMMENT_MAX, FEEDBACK_QUESTIONS, type FeedbackKey } from "@/lib/feedback/survey";

/*
  Ponuka v karte plánu (nad zostatkom minút) pre ľudí, ktorí už nahrali pitch: krátky dotazník (hviezdičky + komentár)
  za 5 minút zadarmo. Po odoslaní sa obnoví serverový obsah (karta plánu ukáže nové minúty, ponuka zmizne).
*/

const BONUS_MIN = FEEDBACK_BONUS_SECONDS / 60;

const TX = {
  sk: {
    bonus: `+${BONUS_MIN} min zadarmo`,
    open: "za vyplnenie krátkeho dotazníka",
    dialogTitle: "Krátky dotazník",
    dialogNote: `Tri hviezdičkové otázky a pár slov, ak chceš. Za vyplnenie ti pripíšeme ${BONUS_MIN} minút zadarmo.`,
    comment: "Čo by si zlepšil/a alebo čo sa ti páčilo?",
    commentHint: "Nepovinné",
    stars: (n: number) => `${n} z 5 hviezdičiek`,
    missing: "Ohodnoť prosím všetky tri otázky.",
    cancel: "Zrušiť",
    submit: `Odoslať a získať +${BONUS_MIN} min`,
    sending: "Odosielam…",
    done: `Ďakujeme! Pripísali sme ti ${BONUS_MIN} minút zadarmo.`,
    failed: "Odoslanie zlyhalo. Skús to znova.",
  },
  en: {
    bonus: `+${BONUS_MIN} free min`,
    open: "for a short survey",
    dialogTitle: "Short survey",
    dialogNote: `Three star questions and a few words if you like. We'll add ${BONUS_MIN} free minutes for filling it in.`,
    comment: "What would you improve, or what did you like?",
    commentHint: "Optional",
    stars: (n: number) => `${n} of 5 stars`,
    missing: "Please rate all three questions.",
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

export function FeedbackTeaser() {
  const locale = useLocale();
  const tx = TX[locale];
  const router = useRouter();
  const toast = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [ratings, setRatings] = useState<Partial<Record<FeedbackKey, number>>>({});
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  if (sent) return null;

  const submit = () => {
    if (FEEDBACK_QUESTIONS.some((q) => !ratings[q.key])) {
      setError(tx.missing);
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/hodnotenie", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ratings, comment }),
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
        <span className="min-w-0">
          <span className="block text-[14px] font-bold text-accent">{tx.bonus}</span>
          <span className="block text-[12.5px] text-mute">{tx.open}</span>
        </span>
      </button>

      <dialog
        ref={dialogRef}
        aria-labelledby="dotaznik-nadpis"
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[16px] border border-line-strong bg-panel p-0 text-paper backdrop:bg-ink/80"
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
            <label className="flex flex-col gap-2">
              <span className="text-[14.5px] font-semibold text-paper">
                {tx.comment} <span className="font-normal text-faint">({tx.commentHint})</span>
              </span>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                maxLength={FEEDBACK_COMMENT_MAX}
                rows={4}
                className="w-full resize-y rounded-xl border border-line-strong bg-ink-2 px-3.5 py-2.5 text-[15px] text-paper placeholder:text-faint focus:border-signal focus:outline-none"
              />
            </label>
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
