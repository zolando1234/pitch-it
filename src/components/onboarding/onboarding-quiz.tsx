"use client";

import "@/styles/screens/onboarding.css";
import { useEffect, useRef, useState, useTransition } from "react";
import { PI_BACKGROUND, PiTopbar } from "@/components/pitch/pi-topbar";
import { submitOnboarding } from "@/lib/onboarding/actions";
import { NOTES_MAX, planSummary, questionsFor, type OnboardingAnswers } from "@/lib/onboarding/plan";
import { useLocale } from "@/components/i18n/locale-provider";
import type { Locale } from "@/lib/i18n/locale";

/*
  Onboarding 1:1 podľa dizajnu PitchIt („1 · Onboarding“): tri otázky, karta „Tvoj plán“
  a voliteľné poznámky k pitchu. Potom krátka obrazovka „Personalizujeme…“ (beží popri
  uložení odpovedí) a plynulý prechod na prehľad, odkiaľ sa začína nahrávať.
*/

const NEXT_HREF = "/app";
// Najkratšia dĺžka personalizácie, aby jednotlivé kroky stihli naskočiť.
const PERSONALIZE_MS = 3600;
const PERSONALIZE_MS_REDUCED = 1200;
const FADE_MS = 420;

const AUDIENCE_STEP: Record<Locale, Record<OnboardingAnswers["audience"], string>> = {
  sk: {
    investor: "Ladíme hodnotenie pre investorov",
    jury: "Ladíme hodnotenie pre porotu",
    customer: "Ladíme hodnotenie pre zákazníkov",
    team: "Ladíme hodnotenie pre tím",
  },
  en: {
    investor: "Tuning the scoring for investors",
    jury: "Tuning the scoring for a jury",
    customer: "Tuning the scoring for customers",
    team: "Tuning the scoring for your team",
  },
};
const FOCUS_STEP: Record<Locale, Record<OnboardingAnswers["focus"], string>> = {
  sk: {
    tempo: "Pripravujeme cvičenia na tempo a pauzy",
    fillery: "Pripravujeme cvičenia proti vypĺňacím slovám",
    obsah: "Pripravujeme cvičenia na štruktúru pitchu",
  },
  en: {
    tempo: "Preparing exercises for pace and pauses",
    fillery: "Preparing exercises against filler words",
    obsah: "Preparing exercises for pitch structure",
  },
};

function personalizeSteps(answers: OnboardingAnswers, locale: Locale) {
  const length = answers.lengthSeconds === 180 ? "3 min" : `${answers.lengthSeconds} s`;
  return [
    locale === "en" ? `Setting the timer to ${length}` : `Nastavujeme časovač na ${length}`,
    AUDIENCE_STEP[locale][answers.audience],
    FOCUS_STEP[locale][answers.focus],
    locale === "en" ? "Building your overview" : "Zostavujeme tvoj prehľad",
  ];
}

const ERRORS_EN: Record<string, string> = {
  "Relácia vypršala. Prihlás sa znova.": "Your session expired. Sign in again.",
  "Niektorá odpoveď chýba. Vráť sa a doplň ju.": "An answer is missing. Go back and fill it in.",
  "Plán sa nepodarilo uložiť. Skús to znova.": "The plan couldn't be saved. Try again.",
};

function Personalizing({ steps, done, leaving }: { steps: string[]; done: number; leaving: boolean }) {
  const percent = Math.round((done / steps.length) * 100);
  const en = useLocale() === "en";
  return (
    <div className={`prs${leaving ? " out" : ""}`} role="status" aria-live="polite">
      <div className="prs-ring" style={{ "--p": percent } as React.CSSProperties}>
        <span>{percent}%</span>
      </div>
      <div className="eyebrow">{en ? "Your plan" : "Tvoj plán"}</div>
      <h1 className="h" style={{ fontSize: "40px", margin: "12px 0 28px", textAlign: "center" }}>
        {en ? "Personalising your training…" : "Personalizujeme tvoj tréning…"}
      </h1>
      <ul className="prs-list">
        {steps.map((label, index) => (
          <li key={label} className={index < done ? "ok" : index === done ? "now" : ""}>
            <i aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 12 12">
                <path d="M2.5 6.2l2.3 2.3 4.7-4.9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </i>
            {label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={useLocale() === "en" ? "Close and start from the first question" : "Zavrieť a začať od prvej otázky"}
      style={{
        position: "absolute",
        top: "14px",
        right: "14px",
        width: "44px",
        height: "44px",
        borderRadius: "50%",
        border: "1px solid var(--color-line-strong)",
        background: "transparent",
        color: "var(--color-paper)",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </button>
  );
}

function Overlay({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="ov"
      style={{
        position: "fixed",
        inset: "0",
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background: "var(--pi-overlay)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
      }}
    >
      {children}
    </div>
  );
}

export function OnboardingQuiz({ preview = false, previewHref }: { preview?: boolean; previewHref?: string }) {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Array<string | number | null>>([null, null, null]);
  const [stage, setStage] = useState<"intro" | "quiz" | "plan" | "notes" | "personalize">("intro");
  const [done, setDone] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDivElement>(null);

  const locale = useLocale();
  const en = locale === "en";
  const QUESTIONS = questionsFor(locale);
  const question = QUESTIONS[step];
  const current = answers[step];
  const isLast = step === QUESTIONS.length - 1;
  const filled = answers.every((answer) => answer !== null);
  const parsed: OnboardingAnswers | null = filled
    ? { audience: answers[0] as OnboardingAnswers["audience"], lengthSeconds: answers[1] as OnboardingAnswers["lengthSeconds"], focus: answers[2] as OnboardingAnswers["focus"] }
    : null;
  const summary = parsed ? planSummary(parsed, locale) : null;

  const restart = () => {
    setStage("quiz");
    setStep(0);
    setAnswers([null, null, null]);
    setNotes("");
    setError(null);
  };

  useEffect(() => {
    if (stage === "intro" || stage === "quiz" || stage === "personalize") return;
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") restart();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [stage]);

  const finish = (withNotes: boolean) => {
    if (!parsed) return;
    setError(null);
    setDone(0);
    setLeaving(false);
    setStage("personalize");
    startTransition(async () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const total = reduced ? PERSONALIZE_MS_REDUCED : PERSONALIZE_MS;
      const count = personalizeSteps(parsed, locale).length;
      const ticks = Array.from({ length: count }, (_, index) =>
        window.setTimeout(() => setDone(index + 1), ((index + 1) * total) / (count + 0.5)),
      );
      const [result] = await Promise.all([
        preview ? Promise.resolve({ status: "ok" as const }) : submitOnboarding({ ...parsed, notes: withNotes ? notes : "" }),
        new Promise((resolve) => window.setTimeout(resolve, total)),
      ]);
      if (result.status !== "ok") {
        ticks.forEach(window.clearTimeout);
        setError(en ? (ERRORS_EN[result.message] ?? result.message) : result.message);
        setStage("notes");
        return;
      }
      setDone(count);
      setLeaving(true);
      await new Promise((resolve) => window.setTimeout(resolve, reduced ? 0 : FADE_MS));
      // Plné načítanie: klientsky router si pamätá starú odpoveď /app (presmerovanie na kvíz)
      // a po uložení by nás vrátil späť sem. Prechod zakryje fade-out a vstupná animácia prehľadu.
      window.location.assign(preview ? (previewHref ?? "/ukazka") : NEXT_HREF);
    });
  };

  return (
    <div
      className="pi-onb"
      style={{ background: PI_BACKGROUND, color: "var(--color-paper)", minHeight: "100dvh", position: "relative" }}
    >
      <PiTopbar />
      {stage === "personalize" && parsed ? (
        <main id="obsah" style={{ display: "flex", justifyContent: "center", padding: "48px 24px" }}>
          <Personalizing steps={personalizeSteps(parsed, locale)} done={done} leaving={leaving} />
        </main>
      ) : stage === "intro" ? (
        <main id="obsah" style={{ display: "flex", justifyContent: "center", padding: "72px 24px" }}>
          <div style={{ maxWidth: "620px", textAlign: "center" }}>
            <div className="eyebrow">{en ? "Quick questionnaire" : "Krátky dotazník"}</div>
            <h1 className="h" style={{ fontSize: "44px", lineHeight: "1.1", margin: "12px 0 16px" }}>
              {en ? "Give us 20 seconds, we'll give you tailored feedback" : "Daj nám 20 sekúnd, dáme ti feedback na mieru"}
            </h1>
            <p className="muted" style={{ fontSize: "17px", lineHeight: "1.6", margin: "0 0 32px" }}>
              {en
                ? "Every pitch is different: your goal, your audience, your biggest fear. Answer a few quick questions and everything we show you afterwards will be tailored to your situation, not generic textbook advice."
                : "Každý pitch je iný: tvoj cieľ, tvoje publikum, tvoj najväčší strach. Zodpovedz pár rýchlych otázok a všetko, čo ti ukážeme potom, bude ušité presne na tvoju situáciu, nie generická rada z učebnice."}
            </p>
            <button className="btn btn-p" type="button" onClick={() => setStage("quiz")} style={{ minWidth: "220px", minHeight: "52px" }}>
              {en ? "Start" : "Začať"}
            </button>
          </div>
        </main>
      ) : (
      <main
        id="obsah"
        style={{ display: "flex", flexWrap: "wrap", gap: "48px", justifyContent: "center", alignItems: "flex-start", padding: "48px 32px" }}
      >
        <div style={{ flex: "1 1 520px", maxWidth: "700px", minWidth: "0" }}>
          <div className="bar" role="progressbar" aria-label="Priebeh" aria-valuemin={1} aria-valuemax={3} aria-valuenow={step + 1}>
            <i className="on" />
            <i className={step >= 1 ? "on" : ""} />
            <i className={step >= 2 ? "on" : ""} />
          </div>
          <div className="eyebrow">{en ? `Question ${step + 1} of 3` : `Otázka ${step + 1} zo 3`}</div>
          <h1 className="h" style={{ fontSize: "44px", margin: "12px 0" }}>
            {question.title}
          </h1>
          <p className="muted" style={{ margin: "0 0 28px", fontSize: "17px" }}>
            {question.subtitle}
          </p>
          <div className={`grid2${question.options.length === 4 ? " g4" : ""}`}>
            {question.options.map((option) => (
              <button
                key={String(option.value)}
                className="opt"
                type="button"
                aria-pressed={current === option.value}
                onClick={() => setAnswers((previous) => previous.map((answer, index) => (index === step ? option.value : answer)))}
              >
                {option.label}
                <small>{option.detail}</small>
              </button>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", marginTop: "40px", flexWrap: "wrap" }}>
            <button
              className="btn"
              type="button"
              onClick={() => setStep((value) => Math.max(0, value - 1))}
              disabled={step === 0}
              style={{ minWidth: "130px", opacity: step === 0 ? 0.35 : 1 }}
            >
              {en ? "Back" : "Späť"}
            </button>
            <button
              className="btn btn-p"
              type="button"
              onClick={() => (isLast ? setStage("plan") : setStep((value) => value + 1))}
              disabled={current === null}
              style={{ minWidth: "220px", opacity: current === null ? 0.45 : 1 }}
            >
              {isLast ? (en ? "Confirm" : "Potvrdiť") : en ? "Continue" : "Pokračovať"}
            </button>
          </div>
        </div>
      </main>
      )}

      {stage === "plan" && summary ? (
        <Overlay>
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="card mdl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="pt"
            style={{ position: "relative", width: "100%", maxWidth: "480px", padding: "36px", boxShadow: "var(--pi-hero-shadow)", outline: "none" }}
          >
            <CloseButton onClick={restart} />
            <div className="eyebrow">{en ? "Thanks for the information" : "Ďakujeme za informácie"}</div>
            <h2 id="pt" className="h" style={{ fontSize: "30px", margin: "12px 0 22px" }}>
              {en ? "We're ready. Are you?" : "Sme pripravení. A ty?"}
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "14px", fontSize: "15px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span className="muted">{en ? "Pitching to" : "Pitchuješ"}</span>
                <b>{summary.audience}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span className="muted">{en ? "Length" : "Dĺžka"}</span>
                <b>{summary.length}</b>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <span className="muted">{en ? "First we'll show" : "Najprv ukážeme"}</span>
                <b>{summary.first}</b>
              </div>
            </div>
            <div
              className="muted"
              style={{ marginTop: "22px", paddingTop: "18px", borderTop: "1px solid var(--color-line)", fontSize: "14px", lineHeight: "1.55" }}
            >
              {en
                ? "We set the timer and target pace from the length. The audience changes the weight of categories in the content score."
                : "Podľa dĺžky nastavíme časovač a cieľové tempo. Podľa publika zmeníme váhu kategórií v obsahovom skóre."}
            </div>
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "28px" }}>
              <button type="button" className="btn btn-p" onClick={() => setStage("notes")} style={{ flex: "1 1 100%", minHeight: "52px" }}>
                {en ? "Continue" : "Pokračovať"}
              </button>
            </div>
          </div>
        </Overlay>
      ) : null}

      {stage === "notes" ? (
        <Overlay>
          <div
            ref={dialogRef}
            tabIndex={-1}
            className="card mdl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="nt"
            style={{ position: "relative", width: "100%", maxWidth: "560px", padding: "36px", boxShadow: "var(--pi-hero-shadow)", outline: "none" }}
          >
            <CloseButton onClick={restart} />
            <div className="eyebrow">{en ? "Pitch notes" : "Poznámky k pitchu"}</div>
            <h2 id="nt" className="h" style={{ fontSize: "30px", margin: "12px 0 10px" }}>
              {en ? "Paste your script or outline." : "Vlož si text alebo osnovu."}
            </h2>
            <p className="muted" style={{ margin: "0 0 18px", fontSize: "15px", lineHeight: "1.55" }}>
              {en
                ? "Optional. Your notes sit above the camera while you record so you don't lose the thread. The analysis compares them with what you actually said. You can change them later when recording."
                : "Voliteľné. Poznámky ti budú nad kamerou počas nahrávania, aby si nestratila niť. Analýza ich použije na porovnanie, čo si naozaj povedala. Neskôr ich zmeníš pri nahrávaní."}
            </p>
            <label htmlFor="nta" style={{ display: "block", fontSize: "14px", fontWeight: 700, marginBottom: "8px" }}>
              {en ? "Your notes" : "Tvoje poznámky"}
            </label>
            <textarea
              id="nta"
              value={notes}
              maxLength={NOTES_MAX}
              onChange={(event) => setNotes(event.target.value)}
              placeholder={en ? "E.g. Problem: …\nSolution: …\nMarket: …\nTraction: …\nAsk: …" : "Napr. Problém: …\nRiešenie: …\nTrh: …\nTraction: …\nAsk: …"}
            />
            {error ? (
              <p role="alert" style={{ margin: "12px 0 0", fontSize: "14px", color: "var(--color-coral)" }}>
                {error}
              </p>
            ) : null}
            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginTop: "24px" }}>
              <button type="button" className="btn" disabled={pending} onClick={() => finish(false)} style={{ flex: "1 1 150px", minHeight: "52px" }}>
                {en ? "Skip" : "Preskočiť"}
              </button>
              <button
                type="button"
                className="btn btn-p"
                disabled={pending}
                onClick={() => finish(true)}
                style={{ flex: "2 1 240px", minHeight: "52px", opacity: pending ? 0.7 : 1 }}
              >
                {en ? "Save and continue" : "Uložiť a pokračovať"}
              </button>
            </div>
            <div className="muted" style={{ marginTop: "14px", fontSize: "13px", textAlign: "center" }}>
              {en ? "We'll tailor your training and open your overview." : "Prispôsobíme tréning a otvoríme tvoj prehľad."}
            </div>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}
