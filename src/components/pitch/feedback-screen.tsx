"use client";

import "@/styles/screens/feedback.css";
import Link from "next/link";
import { Fragment, useEffect, useState, useTransition, type CSSProperties } from "react";
import { CoachFeedbackCard } from "@/components/coach/coach-feedback-card";
import { PI_BACKGROUND, PiTopbar } from "@/components/pitch/pi-topbar";
import { sharePitch } from "@/lib/pitch/actions";
import { SECTION_LABELS, sectionOrder, type BodyTone, type FeedbackData, type OutlineFeedback, type ScoreTone } from "@/lib/pitch/feedback";
import type { PointStatus } from "@/lib/pitch/outline";

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
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-label={POINT_STATUS[status].label} style={{ flex: "0 0 22px", marginTop: "2px" }}>
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
function OutlineCard({ outline, progress }: { outline: OutlineFeedback; progress: (delay: number, dur: number) => number }) {
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
          Zhoda s osnovou
        </h2>
      </div>
      {outline.topic ? (
        <div style={{ marginTop: "14px", padding: "16px 18px", borderRadius: "14px", background: "var(--color-panel)", border: "1px solid var(--color-line)" }}>
          <div className="muted" style={{ fontSize: "13px", fontWeight: 700 }}>
            Tvoja téma, podľa ktorej sme hodnotili
          </div>
          <p style={{ margin: "6px 0 0", fontSize: "16px", lineHeight: "1.55", whiteSpace: "pre-line" }}>{outline.topic}</p>
        </div>
      ) : null}

      {!m ? (
        <p className="muted" style={{ margin: "16px 0 0", fontSize: "15px", lineHeight: "1.55" }}>
          V nahrávke sme nezachytili reč, preto sme pitch s osnovou nevedeli porovnať. Pri ďalšom pokuse hovor nahlas a bližšie k mikrofónu.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", marginTop: "18px" }}>
            <div style={{ flex: "0 1 300px" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                <span className="big" style={{ color: SCORE_COLOR[m.tone].text, whiteSpace: "nowrap" }}>
                  {m.pct !== null ? `${Math.round(m.pct * q)} %` : "–"}
                </span>
                <span className="muted">{outline.points.length ? "osnovy si odprezentoval" : "pitchu sa držalo témy"}</span>
              </div>
              <div className="sc" style={{ margin: "14px 0 0" }}>
                <i style={{ width: `${Math.round((m.pct ?? 0) * q)}%`, background: SCORE_COLOR[m.tone].bar }} />
              </div>
            </div>
            <div style={{ flex: "1 1 420px", display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: "10px" }}>
              {m.onTopicPct !== null ? stat("Držal si sa témy", `${m.onTopicPct} % pitchu`, SCORE_COLOR[m.onTopicPct >= 70 ? "good" : m.onTopicPct >= 45 ? "mid" : "low"].text) : null}
              {m.order ? stat("Poradie", m.order.label, SCORE_COLOR[m.order.tone].text) : null}
              {m.clarity ? stat("Zrozumiteľnosť", `${m.clarity.score} / 10`, SCORE_COLOR[m.clarity.tone].text) : null}
            </div>
          </div>

          {m.takeaway ? (
            <div style={{ marginTop: "22px", padding: "18px 20px", borderRadius: "16px", background: "var(--pi-sel)", border: "1px solid var(--color-line)" }}>
              <div style={{ fontWeight: 700, marginBottom: "6px" }}>Čo si poslucháč odnesie</div>
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
                        {POINT_STATUS[point.status].label}
                        {point.clarity !== null && point.status !== "missing" ? ` · zrozumiteľnosť ${point.clarity}/10` : ""}
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
              <div style={{ fontWeight: 700, marginBottom: "8px" }}>Odbočky mimo témy</div>
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
              <b>Na ďalší pokus: </b>
              {m.advice}
            </p>
          ) : null}
          {m.byKeywords ? (
            <p className="muted" style={{ margin: "14px 0 0", fontSize: "13px" }}>
              AI hodnotenie tentoraz nebolo dostupné, body sme porovnali len podľa kľúčových slov. Zrozumiteľnosť a odbočky preto chýbajú.
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
          {s} s dôraz
        </span>
      ) : (
        <span key={i} className="pz pz-w">
          {s} s zaváhanie
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
            <div className="eyebrow">Pokus {data.number}</div>
            <h1 className="h" style={{ fontSize: "48px", margin: "10px 0 12px" }}>
              Tvoj feedback je hotový.
            </h1>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <span className="chip">{data.audienceLabel}</span>
              <span className="chip">{data.targetSeconds >= 60 ? `${data.targetSeconds / 60} min` : `${data.targetSeconds} s`}</span>
              <span className="chip">{data.languageLabel}</span>
              <span className="chip">Poradie podľa tvojej odpovede: {SECTION_LABELS[data.focus]} najprv</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <Link className="btn btn-p" href={data.retryHref}>
              Skús znova
            </Link>
            <a className="btn" href="#zdielat">
              Pošli mentorovi
            </a>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {data.outline ? <OutlineCard outline={data.outline} progress={p} /> : null}

          <section className="card rv" style={{ animationDelay: "100ms", order: o.tempo }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "32px" }}>
              <div style={{ flex: "1 1 440px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  Tempo
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "16px 0 18px" }}>
                  <span className="big">{data.tempo ? comma(data.tempo.value * a) : "–"}</span>
                  <span className="muted">slabiky za sekundu</span>
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
                      Ty
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
                    <span style={{ flex: "3" }}>Pomaly</span>
                    <span style={{ flex: "4", textAlign: "center", color: "var(--color-accent)" }}>V cieli</span>
                    <span style={{ flex: "3", textAlign: "right" }}>Rýchlo</span>
                  </div>
                </div>
                <p style={{ margin: "18px 0 0", fontSize: "15px", lineHeight: "1.55" }}>
                  {data.tempo ? data.tempo.advice : "Nahrávka bola na meranie tempa príliš krátka. Skús hovoriť aspoň pár viet."}
                </p>
              </div>
              <div style={{ flex: "1 1 360px", borderLeft: "1px solid var(--color-line)", paddingLeft: "32px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  Pauzy
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "16px 0 14px" }}>
                  <span className="big">{Math.round(data.pauses.count * b)}</span>
                  <span className="muted">{data.pauses.label}</span>
                </div>
                <p style={{ margin: "0 0 14px", fontSize: "15px", lineHeight: "1.55" }}>Dlhá pauza nemusí byť chyba. Rozhoduje, kde je.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", fontSize: "14px" }}>
                  <div>
                    <span className="pz pz-e">dôraz</span>
                    <span className="muted">Po kľúčovej vete. Pôsobí sebavedomo.</span>
                  </div>
                  <div>
                    <span className="pz pz-w">zaváhanie</span>
                    <span className="muted">Uprostred vety. Stojí za to pozrieť.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="card rv" style={{ animationDelay: "250ms", order: o.fillery }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "32px" }}>
              <div style={{ flex: "0 1 300px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  Vypĺňacie slová
                </h2>
                <div style={{ display: "flex", alignItems: "baseline", gap: "10px", margin: "16px 0 16px" }}>
                  <span className="big">{Math.round(data.fillers.per60s * c)}</span>
                  <span className="muted">za 60 sekúnd</span>
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
                <div style={{ fontWeight: 700, marginBottom: "12px" }}>Prepis s označením</div>
                <p style={{ margin: "0", fontSize: "17px", lineHeight: "2.1" }}>{tokenNodes.length ? tokenNodes : <span className="muted">Prepis je prázdny.</span>}</p>
                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginTop: "16px", fontSize: "13px" }} className="muted">
                  <span>
                    <span className="fill">slovo</span> vypĺňacie slovo
                  </span>
                  <span>
                    <span className="pz pz-e">dôraz</span>
                  </span>
                  <span>
                    <span className="pz pz-w">zaváhanie</span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="card rv" style={{ animationDelay: "400ms", order: o.obsah }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "12px" }}>
              <h2 className="h" style={{ fontSize: "26px" }}>
                Obsahové skóre
              </h2>
              <span className="muted">Hodnotenie podľa pitch rubriky pre {data.audience === "investor" ? "investora" : "tím"}</span>
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
                    ? "Obsahové skóre sa tentoraz nepodarilo vyhodnotiť. Tempo a vypĺňacie slová platia, obsah skús pri ďalšom pokuse."
                    : "Reč sa tentoraz nepodarilo vyhodnotiť, preto hodnotíme len reč tela. Pri ďalšom pokuse hovor nahlas a bližšie k mikrofónu."}
                </div>
              )}
            </div>
          </section>

          {data.coach ? (
            <CoachFeedbackCard attemptId={data.attemptId} coach={data.coach} />
          ) : data.body ? (
            <section className="card rv" style={{ animationDelay: "550ms", order: 3 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: "12px" }}>
                <h2 className="h" style={{ fontSize: "26px" }}>
                  Reč tela
                </h2>
                <span className="muted">Z videa pitchu</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "32px", marginTop: "20px" }}>
                <div style={{ flex: "0 1 320px" }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: "10px" }}>
                    <span className="big">{Math.round(data.body.eyeContactPct * d)} %</span>
                    <span className="muted">očný kontakt</span>
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
                        <div style={{ fontSize: "12px", fontWeight: 700, color: BODY_TONE[event.tone].fill }}>{BODY_TONE[event.tone].label}</div>
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
                Chceš výsledok zdieľať s mentorom?
              </h2>
              <p className="muted" style={{ margin: "0", fontSize: "15px", lineHeight: "1.55" }}>
                Tvoj pokus sa uložil do histórie. Ak ho chceš poslať mentorovi, doplň tri údaje. Dovtedy sme o teba nepotrebovali nič.
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
                    Meno
                  </label>
                  <input id="mn" type="text" placeholder="Tvoje meno" required autoComplete="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  <label className="l" htmlFor="mf">
                    Firma alebo tím
                  </label>
                  <input id="mf" type="text" placeholder="Názov tímu" required autoComplete="organization" value={form.team} onChange={(e) => setForm({ ...form, team: e.target.value })} />
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
                    {pending ? "Ukladám…" : "Uložiť a zdieľať s mentorom"}
                  </button>
                </form>
              ) : (
                <div style={{ padding: "24px", border: "1px solid var(--color-mint)", borderRadius: "16px", background: "var(--pi-sel)" }}>
                  <b style={{ fontSize: "18px" }}>Hotovo.</b>
                  <p className="muted" style={{ margin: "8px 0 16px" }}>
                    Mentor teraz vidí tvoj pokus a ďalšie, ktoré spravíš.
                  </p>
                  <Link className="btn" href={data.retryHref}>
                    Skús znova
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
