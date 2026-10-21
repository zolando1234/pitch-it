"use client";

import { useActionState, useEffect, useId, useRef, useState, useTransition } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { buttonClasses } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Notice } from "@/components/ui/notice";
import { Spinner, SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast";
import type { FormState } from "@/lib/projects/actions";
import { createTeamAction, inviteMembersAction, renameTeamAction } from "@/lib/teams/actions";
import { INVITE_BATCH_MAX } from "@/lib/teams/core";

/*
  Formuláre stránky Tím: založenie tímu, premenovanie, pozvánky e-mailom
  a jednoduché tlačidlá (poslať znova, prijať pozvánku).
*/

const IDLE: FormState = { status: "idle" };

export function CreateTeamForm() {
  const [state, action] = useActionState(createTeamAction, IDLE);
  const id = useId();
  const en = useLocale() === "en";
  return (
    <form action={action} className="space-y-4" noValidate>
      {state.status === "error" && state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <Field id={`${id}-name`} label={en ? "Company or team name" : "Názov firmy alebo tímu"} error={state.fieldErrors?.name}>
        <Input id={`${id}-name`} name="name" maxLength={80} required placeholder={en ? "e.g. Acme Sales" : "napr. Acme obchod"} error={state.fieldErrors?.name} />
      </Field>
      <SubmitButton pendingLabel={en ? "Creating…" : "Zakladám…"}>{en ? "Create team" : "Založiť tím"}</SubmitButton>
    </form>
  );
}

export function RenameTeamForm({ name }: { name: string }) {
  const [state, action] = useActionState(renameTeamAction, IDLE);
  const toast = useToast();
  const id = useId();
  const en = useLocale() === "en";
  useEffect(() => {
    if (state.status === "success" && state.message) toast.show(state.message);
  }, [state, toast]);
  return (
    <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-end" noValidate>
      <Field id={`${id}-name`} label={en ? "Team name" : "Názov tímu"} error={state.status === "error" ? state.message : undefined} className="flex-1">
        <Input id={`${id}-name`} name="name" maxLength={80} defaultValue={name} required />
      </Field>
      <SubmitButton variant="secondary" pendingLabel={en ? "Saving…" : "Ukladám…"}>
        {en ? "Save" : "Uložiť"}
      </SubmitButton>
    </form>
  );
}

export function InviteForm({ seats, compact = false }: { seats: number; compact?: boolean }) {
  const [state, action] = useActionState(inviteMembersAction, IDLE);
  const toast = useToast();
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  const en = useLocale() === "en";
  useEffect(() => {
    if (state.status !== "success") return;
    if (state.message) toast.show(state.message);
    formRef.current?.reset();
  }, [state, toast]);

  if (compact) {
    return (
      <form ref={formRef} action={action} className="space-y-3" noValidate>
        {state.status === "error" && state.message ? <Notice tone="error">{state.message}</Notice> : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Input
            id={`${id}-emails`}
            name="emails"
            aria-label={en ? "Colleagues' emails" : "E-maily kolegov"}
            placeholder={en ? "email@company.com, another@company.com" : "email@firma.sk, ďalší@firma.sk"}
            error={state.fieldErrors?.emails}
            className="flex-1"
          />
          <SubmitButton pendingLabel={en ? "Sending…" : "Posielam…"} disabled={seats <= 0}>
            {en ? "Invite" : "Pozvať"}
          </SubmitButton>
        </div>
        {state.fieldErrors?.emails ? <p className="text-[13px] text-coral">{state.fieldErrors.emails}</p> : null}
      </form>
    );
  }
  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {state.status === "error" && state.message ? <Notice tone="error">{state.message}</Notice> : null}
      <Field
        id={`${id}-emails`}
        label={en ? "Colleagues' emails" : "E-maily kolegov"}
        hint={
          en
            ? `Separate with commas or new lines, at most ${INVITE_BATCH_MAX} at once. You can invite ${seats} more.`
            : `Oddeľ čiarkou alebo novým riadkom, naraz najviac ${INVITE_BATCH_MAX}. Pozvať môžeš ešte ${seats}.`
        }
        error={state.fieldErrors?.emails}
      >
        <Textarea id={`${id}-emails`} name="emails" rows={3} placeholder={en ? "jana@company.com, peter@company.com" : "jana@firma.sk, peter@firma.sk"} error={state.fieldErrors?.emails} />
      </Field>
      <SubmitButton pendingLabel={en ? "Sending…" : "Posielam…"} disabled={seats <= 0}>
        {en ? "Send invitations" : "Poslať pozvánky"}
      </SubmitButton>
    </form>
  );
}

/** Prijatie pozvánky na stránke pozvánky (mimo aplikácie, bez toastov): po úspechu akcia presmeruje. */
export function AcceptInviteButton({ action }: { action: () => Promise<FormState> }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const en = useLocale() === "en";
  return (
    <div className="flex flex-col items-stretch">
      <button
        type="button"
        disabled={pending}
        className={buttonClasses({ className: "min-h-12 w-full" })}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await action();
            if (result?.status === "error") setError(result.message ?? null);
          })
        }
      >
        {pending ? (
          <>
            <Spinner />
            {en ? "Accepting…" : "Prijímam…"}
          </>
        ) : en ? (
          "Accept invitation"
        ) : (
          "Prijať pozvánku"
        )}
      </button>
      {error ? <Notice tone="error" className="mt-4">{error}</Notice> : null}
    </div>
  );
}

/** Tlačidlo, ktoré zavolá akciu bez potvrdenia a výsledok ukáže v toaste. */
export function ActionButton({
  action,
  label,
  pendingLabel,
  variant = "ghost",
}: {
  action: () => Promise<FormState>;
  label: string;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "ghost";
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        disabled={pending}
        className={buttonClasses({ variant })}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await action();
            if (result?.status === "error") setError(result.message ?? null);
            else if (result?.status === "success" && result.message) toast.show(result.message);
          })
        }
      >
        {pending ? (
          <>
            <Spinner />
            {pendingLabel}
          </>
        ) : (
          label
        )}
      </button>
      {error ? (
        <span role="alert" className="mt-1 max-w-xs text-[13.5px] text-coral">
          {error}
        </span>
      ) : null}
    </span>
  );
}
