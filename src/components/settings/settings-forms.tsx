"use client";

import { useActionState, useEffect, useId, useState, useTransition } from "react";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Spinner, SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import { COACH_FOCUS_LABELS, COACH_FOCUS_OPTIONS, TRAINING_MODES, TRAINING_MODE_LABELS } from "@/lib/domain/labels";
import type { ConsentKind } from "@/lib/db/profile";
import type { FormState } from "@/lib/projects/actions";
import { saveSettingsAction, setConsentAction } from "@/lib/privacy/settings-actions";
import { LanguageSwitch, useLocale } from "@/components/i18n/locale-provider";

const MODE_EN: Record<string, string> = { coach: "Training with hints", simulation: "Realistic simulation", delivery: "Full pitch delivery" };
const FOCUS_EN: Record<string, string> = {
  pace: "Speaking pace",
  answer_length: "Answer length",
  fillers: "Filler words",
  camera_gaze: "Looking at the camera",
  framing: "Position in frame",
};

export function SettingsForm({
  initial,
}: {
  initial: { displayName: string; defaultMode: string; coachFocus: string[]; retention: string };
}) {
  const [state, action] = useActionState(saveSettingsAction, { status: "idle" } as FormState);
  const toast = useToast();
  const id = useId();
  const en = useLocale() === "en";
  useEffect(() => {
    if (state.status === "success" && state.message) toast.show(state.message);
  }, [state, toast]);

  return (
    <form action={action} className="space-y-6" noValidate>
      {state.status === "error" && state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id={`${id}-name`} label={en ? "What should we call you" : "Ako ťa máme oslovovať"} optional error={state.fieldErrors?.display_name}>
          <Input id={`${id}-name`} name="display_name" maxLength={80} defaultValue={initial.displayName} />
        </Field>
        <div>
          <p className="text-sm font-medium text-paper">{en ? "App language" : "Jazyk aplikácie"}</p>
          <LanguageSwitch className="mt-2" />
          <p className="mt-2 text-[13px] text-faint">
            {en ? "Applies to the whole app, including the AI feedback." : "Platí pre celú aplikáciu vrátane spätnej väzby od AI."}
          </p>
        </div>
        <Field id={`${id}-mode`} label={en ? "Default training mode" : "Predvolený režim tréningu"}>
          <Select id={`${id}-mode`} name="default_mode" defaultValue={initial.defaultMode}>
            {TRAINING_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {en ? MODE_EN[mode] : TRAINING_MODE_LABELS[mode]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id={`${id}-retention`}
          label={en ? "How long to keep sessions" : "Ako dlho uchovávať tréningy"}
          hint={en ? "Older sessions (transcripts, measurements, reports) are deleted automatically." : "Staršie tréningy (prepisy, merania, reporty) sa automaticky zmažú."}
        >
          <Select id={`${id}-retention`} name="data_retention_days" defaultValue={initial.retention}>
            <option value="forever">{en ? "Until I delete them" : "Kým ich nezmažem"}</option>
            <option value="30">{en ? "30 days" : "30 dní"}</option>
            <option value="90">{en ? "90 days" : "90 dní"}</option>
            <option value="365">{en ? "1 year" : "1 rok"}</option>
          </Select>
        </Field>
      </div>
      <fieldset>
        <legend className="text-sm font-medium text-paper">{en ? "Default training alerts" : "Predvolené upozornenia v tréningu"}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {COACH_FOCUS_OPTIONS.map((focus) => (
            <label
              key={focus}
              className="cursor-pointer rounded-full border border-line-strong px-4 py-2 text-sm text-mute has-[:checked]:border-signal has-[:checked]:bg-signal/10 has-[:checked]:text-paper has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-signal-soft"
            >
              <input type="checkbox" name="coach_focus" value={focus} defaultChecked={initial.coachFocus.includes(focus)} className="sr-only" />
              {en ? FOCUS_EN[focus] : COACH_FOCUS_LABELS[focus]}
            </label>
          ))}
        </div>
      </fieldset>
      <SubmitButton pendingLabel={en ? "Saving…" : "Ukladám…"}>{en ? "Save settings" : "Uložiť nastavenia"}</SubmitButton>
    </form>
  );
}

export function ConsentToggle({ kind, label, description, granted }: { kind: ConsentKind; label: string; description: string; granted: boolean }) {
  const [pending, startTransition] = useTransition();
  const toast = useToast();
  const en = useLocale() === "en";
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-medium text-paper">{label}</p>
        <p className="mt-0.5 text-[14px] leading-relaxed text-mute">{description}</p>
        <p className={`mt-1 text-[13px] ${granted ? "text-mint" : "text-faint"}`}>{granted ? (en ? "Consent given" : "Súhlas udelený") : en ? "Consent not given" : "Súhlas neudelený"}</p>
      </div>
      <button
        type="button"
        disabled={pending}
        className={buttonClasses({ variant: "secondary", className: "shrink-0" })}
        onClick={() =>
          startTransition(async () => {
            const result = await setConsentAction(kind, !granted);
            toast.show(result.message ?? "", result.status === "error" ? "error" : "success");
          })
        }
      >
        {pending ? <Spinner /> : null}
        {granted ? (en ? "Withdraw" : "Odvolať") : en ? "Give" : "Udeliť"}
      </button>
    </div>
  );
}

export function UpgradeButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        className={buttonClasses()}
        onClick={async () => {
          setPending(true);
          setError(null);
          const response = await fetch("/api/billing/checkout", { method: "POST" });
          const body = (await response.json().catch(() => null)) as { url?: string; error?: { message?: string } } | null;
          if (response.ok && body?.url) {
            window.location.assign(body.url);
            return;
          }
          setPending(false);
          setError(body?.error?.message ?? "Platbu sa nepodarilo otvoriť.");
        }}
      >
        {pending ? <Spinner /> : null}
        {label}
      </button>
      {error ? <p className="mt-2 text-[14px] text-coral">{error}</p> : null}
    </div>
  );
}

export function ForgetDevicesButton() {
  const toast = useToast();
  const en = useLocale() === "en";
  return (
    <button
      type="button"
      className={buttonClasses({ variant: "ghost" })}
      onClick={() => {
        try {
          localStorage.removeItem("pitch-it:devices");
        } catch {
          // úložisko nedostupné
        }
        toast.show(en ? "Microphone and camera choice forgotten." : "Výber mikrofónu a kamery je zabudnutý.");
      }}
    >
      {en ? "Forget device choice" : "Zabudnúť výber zariadení"}
    </button>
  );
}
