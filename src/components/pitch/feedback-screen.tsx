"use client";

import "@/styles/screens/feedback.css";
import Link from "next/link";
import { Fragment, useEffect, useState, useTransition, type CSSProperties } from "react";
import { CoachFeedbackCard } from "@/components/coach/coach-feedback-card";
import { PI_BACKGROUND, PiTopbar } from "@/components/pitch/pi-topbar";
import { sharePitch } from "@/lib/pitch/actions";
import { SECTION_LABELS, SECTION_LABELS_EN, sectionOrder, type BodyTone, type FeedbackData, type OutlineFeedback, type ScoreTone } from "@/lib/pitch/feedback";
import { useLocale } from "@/components/i18n/locale-provider";

const FB = {
  sk: {
    toneLabel: { good: "Sebavedomo", warn: "Pozor", alert: "Upozornenie" },
    status: { covered: "Odprezentované", partial: "Len spomenuté", missing: "Chýbalo" },
    outlineMatch: "Zhoda s osnovou",
    yourTopic: "Tvoja téma, podľa ktorej sme hodnotili",
    noSpeechOutline: "V nahrávke sme nezachytili reč, preto sme pitch s osnovou nevedeli porovnať. Pri ďalšom pokuse hovor nahlas a bližšie k mikrofónu.",
    outlineCovered: "osnovy si odprezentoval",
    onTopicShare: "pitchu sa držalo témy",
    stayedOnTopic: "Držal si sa témy",
    ofPitch: (p: number) => `${p} % pitchu`,
    order: "Poradie",
    clarity: "Zrozumiteľnosť",
    takeaway: "Čo si poslucháč odnesie",
    clarityPoint: (c: number) => ` · zrozumiteľnosť ${c}/10`,
    digressions: "Odbočky mimo témy",
    nextTime: "Na ďalší pokus: ",
    byKeywords: "AI hodnotenie tentoraz nebolo dostupné, body sme porovnali len podľa kľúčových slov. Zrozumiteľnosť a odbočky preto chýbajú.",
    emphasis: "dôraz",
    hesitation: "zaváhanie",
    attempt: (n: number) => `Pokus ${n}`,
    ready: "Tvoj feedback je hotový.",
    orderChip: (label: string) => `Poradie podľa tvojej odpovede: ${label} najprv`,
    tryAgain: "Skús znova",
    sendMentor: "Pošli mentorovi",
    tempo: "Tempo",
    syllables: "slabiky za sekundu",
    you: "Ty",
    slow: "Pomaly",
    target: "V cieli",
    fast: "Rýchlo",
    tooShort: "Nahrávka bola na meranie tempa príliš krátka. Skús hovoriť aspoň pár viet.",
    pauses: "Pauzy",
    pauseNote: "Dlhá pauza nemusí byť chyba. Rozhoduje, kde je.",
    emphasisNote: "Po kľúčovej vete. Pôsobí sebavedomo.",
    hesitationNote: "Uprostred vety. Stojí za to pozrieť.",
    fillers: "Vypĺňacie slová",
    per60: "za 60 sekúnd",
    marked: "Prepis s označením",
    emptyTranscript: "Prepis je prázdny.",
    word: "slovo",
    fillerWord: "vypĺňacie slovo",
    content: "Obsahové skóre",
    rubric: (forInvestor: boolean) => `Hodnotenie podľa pitch rubriky pre ${forInvestor ? "investora" : "tím"}`,
    contentFailed: "Obsahové skóre sa tentoraz nepodarilo vyhodnotiť. Tempo a vypĺňacie slová platia, obsah skús pri ďalšom pokuse.",
    speechFailed: "Reč sa tentoraz nepodarilo vyhodnotiť, preto hodnotíme len reč tela. Pri ďalšom pokuse hovor nahlas a bližšie k mikrofónu.",
    body: "Reč tela",
    fromVideo: "Z videa pitchu",
    eyeContact: "očný kontakt",
    shareTitle: "Chceš výsledok zdieľať s mentorom?",
    shareText: "Tvoj pokus sa uložil do histórie. Ak ho chceš poslať mentorovi, doplň tri údaje. Dovtedy sme o teba nepotrebovali nič.",
    name: "Meno",
    namePh: "Tvoje meno",
    team: "Firma alebo tím",
    teamPh: "Názov tímu",
    saving: "Ukladám…",
    save: "Uložiť a zdieľať s mentorom",
    done: "Hotovo.",
    mentorSees: "Mentor teraz vidí tvoj pokus a ďalšie, ktoré spravíš.",
  },
  en: {
    toneLabel: { good: "Confident", warn: "Watch out", alert: "Warning" },
    status: { covered: "Covered", partial: "Only mentioned", missing: "Missing" },
    outlineMatch: "Outline match",
    yourTopic: "Your topic, which we scored against",
    noSpeechOutline: "We didn't catch any speech in the recording, so we couldn't compare the pitch with your outline. Next time speak up and get closer to the microphone.",
    outlineCovered: "of the outline covered",
    onTopicShare: "of the pitch stayed on topic",
    stayedOnTopic: "Stayed on topic",
    ofPitch: (p: number) => `${p} % of the pitch`,
    order: "Order",
    clarity: "Clarity",
    takeaway: "What the listener takes away",
    clarityPoint: (c: number) => ` · clarity ${c}/10`,
    digressions: "Off-topic detours",
    nextTime: "Next time: ",
    byKeywords: "AI scoring wasn't available this time, so we compared the points by keywords only. Clarity and detours are therefore missing.",
    emphasis: "emphasis",
    hesitation: "hesitation",
    attempt: (n: number) => `Attempt ${n}`,
    ready: "Your feedback is ready.",
    orderChip: (label: string) => `Order based on your answer: ${label} first`,
    tryAgain: "Try again",
    sendMentor: "Send to a mentor",
    tempo: "Pace",
    syllables: "syllables per second",
    you: "You",
    slow: "Slow",
    target: "On target",
    fast: "Fast",
    tooShort: "The recording was too short to measure the pace. Try to say at least a few sentences.",
    pauses: "Pauses",
    pauseNote: "A long pause isn't necessarily a mistake. What matters is where it is.",
    emphasisNote: "After a key sentence. Comes across as confident.",
    hesitationNote: "In the middle of a sentence. Worth a look.",
    fillers: "Filler words",
    per60: "per 60 seconds",
    marked: "Marked-up transcript",
    emptyTranscript: "The transcript is empty.",
    word: "word",
    fillerWord: "filler word",
    content: "Content score",
    rubric: (forInvestor: boolean) => `Scored with the pitch rubric for ${forInvestor ? "an investor" : "the audience"}`,
    contentFailed: "The content score couldn't be evaluated this time. Pace and filler words still apply, try content again next time.",
    speechFailed: "We couldn't evaluate the speech this time, so we only score body language. Next time speak up and get closer to the microphone.",
    body: "Body language",
    fromVideo: "From your pitch video",
    eyeContact: "eye contact",
    shareTitle: "Want to share the result with a mentor?",
    shareText: "Your attempt is saved in your history. To send it to a mentor, fill in three details. Until now we didn't need anything from you.",
    name: "Name",
    namePh: "Your name",
    team: "Company or team",
    teamPh: "Team name",
    saving: "Saving…",
    save: "Save and share with a mentor",
    done: "Done.",
    mentorSees: "Your mentor can now see this attempt and the ones you make next.",
  },
};
import type { PointStatus } from "@/lib/pitch/outline";
import type { QaResult } from "@/lib/pitch/qa";

/*
  Feedback 1:1 podľa dizajnu PitchIt („3 · Feedback“). Čísla nabehnú za 2,6 s (bez animácie
  pri prefers-reduced-motion), poradie sekcií určuje odpoveď z onboardingu.
*/

const DURATION = 2600;

const SCORE_COLOR: Record<ScoreTone, { text: string; bar: string }> = {
  good: { text: "var(--color-accent)", bar: "var(--color-signal)" },
  mid: { text: "var(--color-marker)", bar: "var(--color-marker)" },
  low: { text: "var(--color-coral)", bar: "var(--color-coral)" },
};

const BODY_TONE: Record<BodyTone, { fill: string; label: string; strip: string }> = {
  good: { fill: "var(--color-accent)", label: "Sebavedomo", strip: "var(--color-signal)" },
  warn: { fill: "var(--color-marker)", label: "Pozor", strip: "var(--color-marker)" },
  alert: { fill: "var(--color-coral)", label: "Upozornenie", strip: "var(--color-coral)" },
};

function useCountUp() {
  const [t, setT] = useState(0);
  useEffect(() => {
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    const t0 = Date.now();
    const timer = setInterval(() => {
      const next = reduce ? DURATION : Math.min(DURATION, Date.now() - t0);
      setT(next);
      if (next >= DURATION) clearInterval(timer);
    }, reduce ? 0 : 40);
    return () => clearInterval(timer);
  }, []);
  return (delay: number, dur: number) => {
    const x = Math.max(0, Math.min(1, (t - delay) / dur));
    return 1 - Math.pow(1 - x, 3);
  };
}

function Face({ tone }: { tone: BodyTone }) {
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="21" fill={BODY_TONE[tone].fill} />
      <circle cx="15.5" cy="19" r="2.5" fill="#141414" />
      <circle cx="28.5" cy="19" r="2.5" fill="#141414" />
      <path d={tone === "warn" ? "M12 14L18 16M32 14L26 16" : "M0 0"} fill="none" stroke="#141414" strokeWidth="2" strokeLinecap="round" />
      {tone === "good" ? (
        <path d="M14 27Q22 35 30 27" fill="none" stroke="#141414" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : tone === "warn" ? (
        <path d="M14 31Q22 24 30 31" fill="none" stroke="#141414" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <path d="M19 30a3.4 3.4 0 106.8 0a3.4 3.4 0 10-6.8 0Z" fill="#141414" stroke="#141414" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

const POINT_STATUS: Record<PointStatus, { label: string; color: string }> = {
  covered: { label: "Odprezentované", color: "var(--color-accent)" },
  partial: { label: "Len spomenuté", color: "var(--color-marker)" },
  missing: { label: "Chýbalo", color: "var(--color-coral)" },
};

function StatusIcon({ status }: { status: PointStatus }) {
  const color = POINT_STATUS[status].color;
  const tx = FB[useLocale()];
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-label={tx.status[status]} style={{ flex: "0 0 22px", marginTop: "2px" }}>
      {status === "covered" ? (
        <>
          <circle cx="11" cy="11" r="11" fill={color} />
          <path d="M6 11.5L9.5 15L16 8" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : status === "partial" ? (
        <>
          <circle cx="11" cy="11" r="9.8" fill="none" stroke={color} strokeWidth="2.4" />
          <path d="M11 1.2A9.8 9.8 0 0 1 11 20.8Z" fill={color} />
        </>
      ) : (
        <>
          <circle cx="11" cy="11" r="9.8" fill="none" stroke={color} strokeWidth="2.4" />
          <path d="M7.5 7.5L14.5 14.5M14.5 7.5L7.5 14.5" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

/** Zhoda s témou a osnovou, ktorú si founder uložil pred nahrávaním. */
const QA_TX = {
  sk: {
    title: "Q&A",
    sub: "Odpovede na otázky po prejave",
    avg: "priemer odpovedí",
    answer: "Tvoja odpoveď",
    none: "Bez odpovede.",
    seconds: (s: number) => `${s} s`,
    fillers: (n: number) => `${n} ${n === 1 ? "vypĺňacie slovo" : n >= 2 && n <= 4 ? "vypĺňacie slová" : "vypĺňacích slov"}`,
    improve: "Ako lepšie",
  },
  en: {
    title: "Q&A",
    sub: "Your answers to the questions after the talk",
    avg: "average of answers",
    answer: "Your answer",
    none: "No answer.",
    seconds: (s: number) => `${s} s`,
    fillers: (n: number) => `${n} filler ${n === 1 ? "word" : "words"}`,
    improve: "Do better",
  },
};

function QaCard({ qa }: { qa: QaResult }) {
  const locale = useLocale();
  const tx = QA_TX[locale];
  return (
    <section className="card rv" style={{ animationDelay: "450ms", order: 4 }} aria-labelledby="qa-nadpis">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "12px" }}>
        <h2 id="qa-nadpis" className="h" style={{ fontSize: "26px" }}>
          {tx.title}
        </h2>
        <span className="muted">{tx.sub}</span>
      </div>
      {qa.score !== null ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: "10px", marginTop: "16px" }}>
          <span className="big">{locale === "en" ? qa.score.toFixed(1) : qa.score.toFixed(1).replace(".", ",")}</span>
          <span className="muted">/ 10 · {tx.avg}</span>
        </div>
      ) : null}
      {qa.summary ? <p style={{ margin: "10px 0 0", fontSize: "15px", lineHeight: "1.55" }}>{qa.summary}</p> : null}
      <div style={{ marginTop: "12px" }}>
        {qa.answers.map((a, i) => {
          const tone = a.score === null ? null : a.score >= 7 ? "good" : a.score >= 4 ? "mid" : "low";
          const color = tone ? SCORE_COLOR[tone] : null;
          return (
            <div key={i} style={{ padding: "18px 0", borderTop: "1px solid var(--color-line)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
                <b style={{ fontSize: "16px", lineHeight: "1.4" }}>{a.question}</b>
                {a.score !== null && color ? (
                  <span className="h" style={{ fontSize: "24px", color: color.text, whiteSpace: "nowrap" }}>
                    {a.score}
                    <span className="muted" style={{ fontSize: "14px" }}>
                      {" "}
                      / 10
                    </span>
                  </span>
                ) : null}
              </div>
              <p className="muted" style={{ margin: "8px 0 0", fontSize: "13px" }}>
                {tx.answer} · {tx.seconds(Math.round(a.durationMs / 1000))}
                {a.fillers ? ` · ${tx.fillers(a.fillers)}` : ""}
              </p>
              <p style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.55", fontStyle: "italic" }}>{a.transcript.trim() ? `„${a.transcript.trim()}“` : tx.none}</p>
              {a.strength ? <p style={{ margin: "10px 0 0", fontSize: "14px", lineHeight: "1.55", color: "var(--color-mint)" }}>{a.strength}</p> : null}
              {a.improve ? (
                <p className="muted" style={{ margin: "6px 0 0", fontSize: "14px", lineHeight: "1.55" }}>
                  <b>{tx.improve}:</b> {a.improve}
                </p>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OutlineCard({ outline, progress }: { outline: OutlineFeedback; progress: (delay: number, dur: number) => number }) {
  const tx = FB[useLocale()];
  const m = outline.match;
  const q = progress(200, 1500);
  const stat = (label: string, value: string, color?: string) => (
    <div style={{ padding: "14px 16px", borderRadius: "14px", background: "var(--color-panel)", border: "1px solid var(--color-line)" }}>
      <div className="muted" style={{ fontSize: "13px" }}>
        {label}
      </div>
      <div className="h" style={{ fontSize: "20px", marginTop: "4px", color }}>
        {value}
      </div>
    </div>
  );
  return (
    <section className="card rv" style={{ animationDelay: "50ms", order: -1 }} aria-labelledby="osnova-zhoda">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "12px" }}>
        <h2 id="osnova-zhoda" className="h" style={{ fontSize: "26px" }}>
          {tx.outlineMatch}
        </h2>
      </div>
      {outline.topic ? (
        <div style={{ marginTop: "14px", padding: "16px 18px", borderRadius: "14px", background: "var(--color-panel)", border: "1px solid var(--color-line)" }}>
          <div className="muted" style={{ fontSize: "13px", fontWeight: 700 }}>
            {tx.yourTopic}
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "16px", lineHeight: "1.55", whiteSpace: "pre-line" }}>{outline.topic}</p>
        </div>
      ) : null}

      {!m ? (
        <p className="muted" style={{ margin: "16px 0 0", fontSize: "15px", lineHeight: "1.55" }}>
          {tx.noSpeechOutline}
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", marginTop: "18px" }}>
            <div style={{ flex: "0 1 300px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span className="big" style={{ color: SCORE_COLOR[m.tone].text, whiteSpace: "nowrap" }}>
                  {m.pct !== null ? `${Math.round(m.pct * q)} %` : "–"}
                </span>
                <span className="muted">{outline.points.length ? tx.outlineCovered : tx.onTopicShare}</span>
              </div>
              <div className="sc" style={{ margin: "14px 0 0" }}>
                <i style={{ width: `${Math.round((m.pct ?? 0) * q)}%`, background: SCORE_COLOR[m.tone].bar }} />
              </div>
            </div>
            <div style={{ flex: "1 1 420px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
              {m.onTopicPct !== null ? stat(tx.stayedOnTopic, tx.ofPitch(m.onTopicPct), SCORE_COLOR[m.onTopicPct >= 70 ? "good" : m.onTopicPct >= 45 ? "mid" : "low"].text) : null}
              {m.order ? stat(tx.order, m.order.label, SCORE_COLOR[m.order.tone].text) : null}
              {m.clarity ? stat(tx.clarity, `${m.clarity.score} / 10`, SCORE_COLOR[m.clarity.tone].text) : null}
            </div>
          </div>

          {m.takeaway ? (
            <div style={{ marginTop: "22px", padding: "18px 20px", borderRadius: "16px", background: "var(--pi-sel)", border: "1px solid var(--color-line)" }}>
              <div style={{ fontWeight: 700, marginBottom: "6px" }}>{tx.takeaway}</div>
              <p style={{ margin: "0", fontSize: "16px", lineHeight: "1.55" }}>{m.takeaway}</p>
            </div>
          ) : null}

          {m.points.length ? (
            <div style={{ marginTop: "18px" }}>
              {m.points.map((point, i) => (
                <div key={i} style={{ display: "flex", gap: "14px", padding: "16px 0", borderTop: "1px solid var(--color-line)" }}>
                  <StatusIcon status={point.status} />
                  <div style={{ flex: "1", minWidth: "0" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", flexWrap: "wrap" }}>
                      <b style={{ fontSize: "16px" }}>{point.text}</b>
                      <span style={{ fontSize: "13px", fontWeight: 700, color: POINT_STATUS[point.status].color }}>
                        {tx.status[point.status]}
                        {point.clarity !== null && point.status !== "missing" ? tx.clarityPoint(point.clarity) : ""}
                      </span>
                    </div>
                    {point.note ? (
                      <div className="muted" style={{ fontSize: "14px", lineHeight: "1.55", marginTop: "4px" }}>
                        {point.note}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {m.digressions.length ? (
            <div style={{ marginTop: "16px" }}>
              <div style={{ fontWeight: 700, marginBottom: "8px" }}>{tx.digressions}</div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                {m.digressions.map((d) => (
                  <span key={d} className="chip">
                    {d}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {m.advice ? (
            <p style={{ margin: "18px 0 0", fontSize: "15px", lineHeight: "1.55" }}>
              <b>{tx.nextTime}</b>
              {m.advice}
            </p>
          ) : null}
          {m.byKeywords ? (
            <p className="muted" style={{ margin: "14px 0 0", fontSize: "13px" }}>
              {tx.byKeywords}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

const comma = (value: number, digits = 1) => value.toFixed(digits).replace(".", ",");

export function FeedbackScreen({ data, preview = false }: { data: FeedbackData; preview?: boolean }) {
  const p = useCountUp();
  const locale = useLocale();
  const tx = FB[locale];
  const [shared, setShared] = useState(data.shared);
  const [form, setForm] = useState(data.shareDefaults);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const a = p(300, 1500);
  const b = p(550, 1500);
  const c = p(800, 1500);
  const d = p(1000, 1500);
  const o = sectionOrder(data.focus);

  const share = () => {
    if (preview) {
      setShared(true);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await sharePitch({ attemptId: data.attemptId, ...form });
      if (result.status === "ok") setShared(true);
      else setError(result.message);
    });
  };

  const tokenNodes = data.tokens.map((token, i) => {
    const next = data.tokens[i + 1];
    const gap = next && next.type === "word" && token.type === "word" ? " " : "";
    if (token.type === "pause") {
      const s = comma(token.ms / 1000);
      return token.kind === "emphasis" ? (
        <span key={i} className="pz pz-e">
          {s} s {tx.emphasis}
        </span>
      ) : (
        <span key={i} className="pz pz-w">
          {s} s {tx.hesitation}
        </span>
      );
    }
    return (
      <Fragment key={i}>
        {token.filler ? <span className="fill">{token.text}</span> : token.text}
        {gap}
      </Fragment>
    );
  });

  return (
    <div
      className="pi-fb"
      style={{ background: PI_BACKGROUND, color: "var(--color-paper)", fontFamily: "var(--font-dm-sans),sans-serif", minHeight: "100dvh" }}
    >
      <PiTopbar href={preview ? "/ukazka" : "/app"} />
      <main id="obsah" className="wrap" style={{ paddingTop: "40px", paddingBottom: "64px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px", marginBottom: "28px" }}>
          <div>
            <div className="eyebrow">{tx.attempt(data.number)}</div>
            <h1 className="h" style={{ fontSize: "48px", margin: "10px 0 12px" }}>
              {tx.ready}
            </h1>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span className="chip">{data.audienceLabel}</span>
              <span className="chip">{data.targetSeconds >= 60 ? `${data.targetSeconds / 60} min` : `${data.targetSeconds} s`}</span>
              <span className="chip">{data.languageLabel}</span>
              <span className="chip">{tx.orderChip((locale === "en" ? SECTION_LABELS_EN : SECTION_LABELS)[data.focus])}</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link className="btn btn-p" href={data.retryHref}>
              {tx.tryAgain}
            </Link>
            <a className="btn" href="#zdielat">
              {tx.sendMentor}
            </a>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {data.outline ? <OutlineCard outline={data.outline} progress={p} /> : null}

          <section className="card rv" style={{ animationDelay: "100ms", order: o.tempo }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "32px" }}>
              <div style={{ flex: "1 1 440px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  {tx.tempo}
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "16px 0 18px" }}>
                  <span className="big">{data.tempo ? comma(data.tempo.value * a) : "–"}</span>
                  <span className="muted">{tx.syllables}</span>
                </div>
                <div style={{ position: "relative", paddingTop: "26px" }}>
                  {data.tempo ? (
                    <div
                      style={{
                        position: "absolute",
                        left: `${Math.round(data.tempo.position * a)}%`,
                        top: "0",
                        transform: "translateX(-50%)",
                        fontSize: "12px",
                        fontWeight: 700,
                        color: "var(--color-accent)",
                      }}
                    >
                      {tx.you}
                    </div>
                  ) : null}
                  <div style={{ display: "flex", height: "16px", borderRadius: "8px", overflow: "hidden", gap: "3px" }}>
                    <div style={{ flex: "3", background: "var(--color-line)" }} />
                    <div style={{ flex: "4", background: "linear-gradient(90deg,#7AB800,var(--color-signal))" }} />
                    <div style={{ flex: "3", background: "var(--color-line)" }} />
                  </div>
                  {data.tempo ? (
                    <div
                      style={{
                        position: "absolute",
                        left: `${Math.round(data.tempo.position * a)}%`,
                        top: "20px",
                        width: "4px",
                        height: "28px",
                        marginLeft: "-2px",
                        borderRadius: "2px",
                        background: "var(--color-paper)",
                      }}
                    />
                  ) : null}
                  <div style={{ display: "flex", marginTop: "8px", fontSize: "13px" }} className="muted">
                    <span style={{ flex: "3" }}>{tx.slow}</span>
                    <span style={{ flex: "4", textAlign: "center", color: "var(--color-accent)" }}>{tx.target}</span>
                    <span style={{ flex: "3", textAlign: "right" }}>{tx.fast}</span>
                  </div>
                </div>
                <p style={{ margin: "18px 0 0", fontSize: "15px", lineHeight: "1.55" }}>
                  {data.tempo ? data.tempo.advice : tx.tooShort}
                </p>
              </div>
              <div style={{ flex: "1 1 360px", borderLeft: "1px solid var(--color-line)", paddingLeft: "32px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  {tx.pauses}
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "16px 0 14px" }}>
                  <span className="big">{Math.round(data.pauses.count * b)}</span>
                  <span className="muted">{data.pauses.label}</span>
                </div>
                <p style={{ margin: "0 0 14px", fontSize: "15px", lineHeight: "1.55" }}>{tx.pauseNote}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
                  <div>
                    <span className="pz pz-e">{tx.emphasis}</span>
                    <span className="muted">{tx.emphasisNote}</span>
                  </div>
                  <div>
                    <span className="pz pz-w">{tx.hesitation}</span>
                    <span className="muted">{tx.hesitationNote}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card rv" style={{ animationDelay: "250ms", order: o.fillery }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "32px" }}>
              <div style={{ flex: "0 1 300px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  {tx.fillers}
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "16px 0 16px" }}>
                  <span className="big">{Math.round(data.fillers.per60s * c)}</span>
                  <span className="muted">{tx.per60}</span>
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {data.fillers.chips.map((chip) => (
                    <span key={chip.phrase} className="chip">
                      {chip.phrase} ×{chip.count}
                    </span>
                  ))}
                </div>
              </div>
              <div style={{ flex: "1 1 480px" }}>
                <div style={{ fontWeight: 700, marginBottom: "12px" }}>{tx.marked}</div>
                <p style={{ margin: "0", fontSize: "17px", lineHeight: "2.1" }}>{tokenNodes.length ? tokenNodes : <span className="muted">{tx.emptyTranscript}</span>}</p>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "16px", fontSize: "13px" }} className="muted">
                  <span>
                    <span className="fill">{tx.word}</span> {tx.fillerWord}
                  </span>
                  <span>
                    <span className="pz pz-e">{tx.emphasis}</span>
                  </span>
                  <span>
                    <span className="pz pz-w">{tx.hesitation}</span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="card rv" style={{ animationDelay: "400ms", order: o.obsah }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "12px" }}>
              <h2 className="h" style={{ fontSize: "26px" }}>
                {tx.content}
              </h2>
              <span className="muted">{tx.rubric(data.audience === "investor")}</span>
            </div>
            <div style={{ marginTop: "12px" }}>
              {data.content ? (
                data.content.map((row, i) => {
                  const q = p(900 + i * 180, 1100);
                  const color = SCORE_COLOR[row.tone];
                  return (
                    <div key={row.label} style={{ padding: "18px 0", borderTop: "1px solid var(--color-line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
                        <b style={{ fontSize: "16px" }}>{row.label}</b>
                        <span className="h" style={{ fontSize: "24px", color: color.text }}>
                          {Math.round(row.score * q)}
                          <span className="muted" style={{ fontSize: "14px" }}>
                            {" "}
                            / 10
                          </span>
                        </span>
                      </div>
                      <div className="sc" style={{ margin: "10px 0 10px" }}>
                        <i style={{ width: `${Math.round(row.score * 10 * q)}%`, background: color.bar }} />
                      </div>
                      <div className="muted" style={{ fontSize: "14px", lineHeight: "1.55" }}>
                        {row.advice}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="muted" style={{ padding: "18px 0", borderTop: "1px solid var(--color-line)", fontSize: "14px", lineHeight: "1.55" }}>
                  {data.tempo
                    ? tx.contentFailed
                    : tx.speechFailed}
                </div>
              )}
            </div>
          </section>

          {data.qa ? <QaCard qa={data.qa} /> : null}

          {data.coach ? (
            <CoachFeedbackCard attemptId={data.attemptId} coach={data.coach} />
          ) : data.body ? (
            <section className="card rv" style={{ animationDelay: "550ms", order: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "12px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  {tx.body}
                </h2>
                <span className="muted">{tx.fromVideo}</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", marginTop: "20px" }}>
                <div style={{ flex: "0 1 320px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                    <span className="big">{Math.round(data.body.eyeContactPct * d)} %</span>
                    <span className="muted">{tx.eyeContact}</span>
                  </div>
                  <div className="sc" style={{ margin: "14px 0 18px" }}>
                    <i style={{ width: `${Math.round(data.body.eyeContactPct * d)}%`, background: "var(--color-signal)" }} />
                  </div>
                  <p style={{ margin: "0", fontSize: "15px", lineHeight: "1.55" }}>{data.body.narrative}</p>
                </div>
                <div style={{ flex: "1 1 420px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {data.body.events.map((event) => (
                    <div
                      key={`${event.at}-${event.label}`}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "14px",
                        padding: "12px 16px",
                        borderRadius: "14px",
                        background: "var(--color-panel)",
                        border: "1px solid var(--color-line)",
                      }}
                    >
                      <span className="muted" style={{ flex: "0 0 40px", fontSize: "13px" }}>
                        {event.at}
                      </span>
                      <Face tone={event.tone} />
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "15px" }}>{event.label}</div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: BODY_TONE[event.tone].fill }}>{tx.toneLabel[event.tone]}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: "4px", marginTop: "22px", height: "10px" }}>
                {data.body.strip.map((segment, i) => (
                  <span
                    key={i}
                    style={{ flex: String(segment.flex), background: segment.tone ? BODY_TONE[segment.tone].strip : "var(--pi-sel)", borderRadius: "5px" } as CSSProperties}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="card" id="zdielat" style={{ marginTop: "20px", padding: "28px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", alignItems: "flex-start" }}>
            <div style={{ flex: "1 1 320px" }}>
              <h2 className="h" style={{ fontSize: "28px", marginBottom: "10px" }}>
                {tx.shareTitle}
              </h2>
              <p className="muted" style={{ margin: "0", fontSize: "15px", lineHeight: "1.55" }}>
                {tx.shareText}
              </p>
            </div>
            <div style={{ flex: "1 1 420px" }}>
              {!shared ? (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    share();
                  }}
                >
                  <label className="l" htmlFor="mn" style={{ marginTop: "0" }}>
                    {tx.name}
                  </label>
                  <input id="mn" type="text" placeholder={tx.namePh} required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <label className="l" htmlFor="mf">
                    {tx.team}
                  </label>
                  <input id="mf" type="text" placeholder={tx.teamPh} required autoComplete="organization" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
                  <label className="l" htmlFor="me">
                    E-mail
                  </label>
                  <input id="me" type="email" placeholder="ty@startup.sk" required autoComplete="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  {error ? (
                    <p role="alert" style={{ margin: "12px 0 0", fontSize: "14px", color: "var(--color-coral)" }}>
                      {error}
                    </p>
                  ) : null}
                  <button className="btn btn-p" type="submit" disabled={pending} style={{ marginTop: "20px", width: "100%", opacity: pending ? 0.7 : 1 }}>
                    {pending ? tx.saving : tx.save}
                  </button>
                </form>
              ) : (
                <div style={{ padding: "24px", border: "1px solid var(--color-mint)", borderRadius: "16px", background: "var(--pi-sel)" }}>
                  <b style={{ fontSize: "18px" }}>{tx.done}</b>
                  <p className="muted" style={{ margin: "8px 0 16px" }}>
                    {tx.mentorSees}
                  </p>
                  <Link className="btn" href={data.retryHref}>
                    {tx.tryAgain}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
