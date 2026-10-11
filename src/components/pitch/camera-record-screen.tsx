"use client";

import "@/styles/screens/record.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCoachPrefs, type CoachResult } from "@/components/coach/coach-live";
import { preloadCoachModels } from "@/components/coach/CameraStage";
import SessionSetup from "@/components/coach/SessionSetup";
import { LanguagePicker, usePitchLanguage } from "@/components/pitch/language-picker";
import { LengthPicker, usePitchLength } from "@/components/pitch/length-picker";
import { VideoSourcePicker } from "@/components/pitch/video-source-picker";
import { OutlineEditor, usePitchOutline } from "@/components/pitch/outline-editor";
import { PhoneMicPanel } from "@/components/pitch/phone-mic-panel";
import { PI_BACKGROUND, PiTopbar } from "@/components/pitch/pi-topbar";
import { balanceLabel, PitchPaywall, usePitchBalance } from "@/components/pitch/pitch-paywall";
import { PitchStudio } from "@/components/pitch/pitch-studio";
import { usePhoneMic } from "@/components/pitch/use-phone-mic";
import { uploadPitchWithRetry, usePitchRecorder, type RecorderSetup } from "@/components/pitch/use-recorder";
import { keepLocalSession } from "@/lib/coach/local-session";
import { ruleFilterFor, type TalkMode } from "@/lib/coach/modes";
import type { SessionSummary } from "@/lib/coach/pose/session";
import { toStoredCoach, type StoredCoach } from "@/lib/coach/stored";
import { AUDIENCE_LABELS, FOCUS_GOALS } from "@/lib/onboarding/plan";
import { canUseLength, PAID_LENGTH, type PitchBalance } from "@/lib/billing/pitch-pack";

/*
  Nahrávanie pitchu s kamerou: živý tréner reči tela (silueta, rady nad hlavou, teleprompter)
  beží počas nahrávania zvuku. Na server ide zvuk a súhrn reči tela, video zostáva v prehliadači.
*/

type Phase = "setup" | "live" | "analyze";

const STEPS = [
  ["Reč tela", "Gestá, pohľad, postoj a záznam chýb"],
  ["Prepis reči", "Whisper, vrátane časových značiek"],
  ["Tempo a vypĺňacie slová", "Slabiky za sekundu, pauzy, akože a ehm"],
  ["Obsahové skóre", "Problém, Riešenie, Trh, Traction a Ask"],
] as const;

const OUTLINE_STEP = ["Obsah a zhoda s osnovou", "Rubrika pitchu, pokryté body, odbočky a zrozumiteľnosť"] as const;

const FULLSCREEN_KEY = "pitchit-pitch-fullscreen";

const fmtTarget = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function CameraRecordScreen({
  setup,
  feedbackHref,
  homeHref = "/app",
  setupHref = "/app/vitaj",
  preview = false,
  balance: initialBalance = null,
  paid = false,
}: {
  setup: RecorderSetup;
  /** zostatok pitchov (paywall); null = bez paywallu (ukážka) */
  balance?: PitchBalance | null;
  /** návrat zo Stripe po platbe */
  paid?: boolean;
  /** Návrat na prehľad. */
  homeHref?: string;
  /** Kvíz, kde sa mení publikum, dĺžka a cieľ. */
  setupHref?: string;
  /** Kam viesť po analýze; `{id}` sa nahradí id pokusu. */
  feedbackHref: string;
  preview?: boolean;
}) {
  const prefs = useCoachPrefs();
  const wallet = usePitchBalance(initialBalance, paid);
  const blocked = !!wallet.balance && !wallet.balance.canPitch;
  const outlineState = usePitchOutline();
  const languageState = usePitchLanguage();
  const lengthState = usePitchLength(setup.targetSeconds);
  // 4 minúty len s kúpenými pitchami; inak sa nahráva najdlhšia dostupná dĺžka
  const targetSeconds = canUseLength(lengthState.length, wallet.balance) ? lengthState.length : 180;
  const pitchSetup = useMemo(
    () => ({ ...setup, targetSeconds, language: languageState.language }),
    [setup, targetSeconds, languageState.language],
  );
  const { outline } = outlineState;
  // nahraté video namiesto kamery; analyzuje sa najviac do limitu plánu (4 min len s kúpenými pitchami)
  const [videoMode, setVideoMode] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const maxVideoSeconds = canUseLength(PAID_LENGTH, wallet.balance) ? PAID_LENGTH : 180;
  const recorder = usePitchRecorder();
  const { open, attach, release } = recorder;
  const phone = usePhoneMic();
  const phoneStream = phone.stream;
  const stopPhone = phone.stop;
  const usingPhone = useRef(false);
  const [phase, setPhase] = useState<Phase>("setup");
  const [error, setError] = useState<string | null>(null);
  const [k, setK] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const audioStarted = useRef(false);
  const [take, setTake] = useState(0);
  const [fullscreen, setFullscreen] = useState(true);
  useEffect(() => {
    try {
      setFullscreen(localStorage.getItem(FULLSCREEN_KEY) !== "0"); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage je len na klientovi
    } catch {
      // predvolene na celú obrazovku
    }
  }, []);
  const toggleFullscreen = () => {
    setFullscreen((on) => {
      try {
        localStorage.setItem(FULLSCREEN_KEY, on ? "0" : "1");
      } catch {
        // voľbu si len nezapamätáme
      }
      return !on;
    });
  };

  const mode: TalkMode = useMemo(
    () => ({
      kind: "talk",
      id: "pitch",
      title: `Pitch · ${targetSeconds} s`,
      subtitle: AUDIENCE_LABELS[setup.audience],
      // video sa analyzuje celé (do limitu plánu), živé nahrávanie končí cieľovou dĺžkou
      durationMs: (videoFile ? maxVideoSeconds : targetSeconds) * 1000,
    }),
    [targetSeconds, setup.audience, videoFile, maxVideoSeconds],
  );
  const ruleFilter = useMemo(() => ruleFilterFor(mode, !!prefs.prompterText), [mode, prefs.prompterText]);

  useEffect(() => {
    if (!preview) void open();
  }, [open, preview]);

  // zvuk z mobilu nahradí mikrofón počítača; po odpojení mobilu sa vrátime k mikrofónu počítača
  useEffect(() => {
    if (preview) return;
    if (phoneStream) {
      usingPhone.current = true;
      attach(phoneStream);
    } else if (usingPhone.current) {
      usingPhone.current = false;
      void open();
    }
  }, [phoneStream, attach, open, preview]);

  // modely sťahujeme už počas nastavenia, aby štart nahrávania nečakal
  useEffect(() => preloadCoachModels(prefs.quality), [prefs.quality]);

  // kroky analýzy postupujú, posledný sa uzavrie až po odpovedi servera
  useEffect(() => {
    if (phase !== "analyze" || error) return;
    const timer = setInterval(() => setK((v) => (preview ? Math.min(4, v + 1) : attemptId ? 4 : Math.min(3, v + 1))), 1000);
    return () => clearInterval(timer);
  }, [phase, error, attemptId, preview]);

  const phoneSelected = phone.state !== "idle";
  // pri nahratom videe sa mikrofón nepoužíva, zvuk je z videa
  const micReady = preview || videoMode || (phoneSelected ? phone.state === "connected" : recorder.media === "ready");
  const sourceReady = !videoMode || !!videoFile;
  const micText =
    preview || micReady
      ? null
      : phoneSelected
        ? "Najprv pripoj mobil cez odkaz vyššie, alebo prepni na mikrofón počítača."
        : recorder.media === "denied"
        ? "Prístup k mikrofónu je zamietnutý. Povoľ ho v nastaveniach prehliadača a obnov stránku."
        : recorder.media === "unsupported"
          ? "Tento prehliadač nevie nahrávať. Skús Chrome, Edge alebo Safari."
          : "Zapínam mikrofón…";

  const start = () => {
    if (!micReady || !sourceReady) return;
    // celú obrazovku smie prehliadač zapnúť len priamo po kliknutí
    if (fullscreen && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    setError(null);
    audioStarted.current = false;
    setPhase("live");
  };

  const onLive = (sourceAudio: MediaStream | null) => {
    if (preview) return;
    // nahraté video: nahráva sa zvuk videa namiesto mikrofónu
    if (videoFile && sourceAudio) attach(sourceAudio);
    audioStarted.current = recorder.start();
  };

  // posledná nahrávka čaká v pamäti, kým ju server neprijme (dá sa poslať znova bez nového nahrávania)
  const pending = useRef<{
    audio: { audio: Blob; durationMs: number };
    coach: StoredCoach;
    summary: SessionSummary;
    videoUrl: string | null;
    outline: typeof outline;
  } | null>(null);
  const [canResend, setCanResend] = useState(false);
  const router = useRouter();

  // Next.js stránku pri odchode neodpojí, len skryje. Po návrate (napr. „Skús znova“) má čakať nové nahrávanie,
  // nie hotová analýza minulého pokusu.
  useLayoutEffect(
    () => () => {
      pending.current = null;
      setPhase("setup");
      setK(0);
      setAttemptId(null);
      setError(null);
      setCanResend(false);
      // spojenie s mobilom sa pri skrytí zavrie, po návrate sa pripája nanovo
      stopPhone();
    },
    [stopPhone],
  );

  const send = async () => {
    const p = pending.current;
    if (!p) return;
    setError(null);
    setCanResend(false);
    setK(1);
    const uploaded = await uploadPitchWithRetry(p.audio, pitchSetup, null, p.coach, p.outline);
    if (uploaded.ok) {
      pending.current = null;
      keepLocalSession(uploaded.attemptId, { summary: p.summary, videoUrl: p.videoUrl });
      setAttemptId(uploaded.attemptId);
      setK(4);
      // report hneď po analýze
      router.push(feedbackHref.replace("{id}", uploaded.attemptId));
    } else {
      setError(uploaded.message);
      setCanResend(uploaded.retryable);
    }
  };

  const onFinish = async (result: CoachResult) => {
    setPhase("analyze");
    setK(1);
    const coach = toStoredCoach(result.summary, { teleprompter: !!prefs.prompterText, micMode: prefs.micMode });
    if (preview) {
      keepLocalSession("ukazka", { summary: result.summary, videoUrl: result.recording?.url ?? null });
      router.push(feedbackHref.replace("{id}", "ukazka"));
      return;
    }
    const recording = audioStarted.current ? await recorder.stop().catch(() => null) : null;
    release();
    // bez zvuku pošleme aspoň reč tela, server z nej spraví spätnú väzbu
    const audio = recording ?? { audio: new Blob([], { type: "audio/webm" }), durationMs: result.summary.durationMs };
    pending.current = { audio, coach, summary: result.summary, videoUrl: result.recording?.url ?? null, outline };
    await send();
  };

  const onError = (message: string) => {
    if (audioStarted.current) void recorder.stop();
    audioStarted.current = false;
    setError(message);
    setPhase("setup");
  };

  const retry = () => {
    if (pending.current?.videoUrl) URL.revokeObjectURL(pending.current.videoUrl);
    pending.current = null;
    setCanResend(false);
    setError(null);
    setAttemptId(null);
    setK(0);
    setPhase("setup");
    void wallet.reload();
    if (!preview) {
      if (phoneStream) attach(phoneStream);
      else void open();
    }
  };

  // zahodí rozbehnutý zvuk; video zahodí CameraStage pri odpojení
  const discardAudio = () => {
    if (audioStarted.current) void recorder.stop();
    audioStarted.current = false;
  };

  if (phase === "live") {
    return (
      <PitchStudio
        key={take}
        mode={mode}
        title={videoFile ? "Analýza videa" : "Tréning pitchu"}
        subtitle={`Pitch ${AUDIENCE_LABELS[setup.audience].toLowerCase()} · cieľ ${fmtTarget(targetSeconds)}`}
        prefs={prefs}
        outline={outline}
        startFull={fullscreen}
        file={videoFile}
        language={languageState.language}
        ruleFilter={ruleFilter}
        onLive={onLive}
        onPause={recorder.pause}
        onResume={recorder.resume}
        onFinish={(r) => void onFinish(r)}
        onError={onError}
        onBack={() => {
          discardAudio();
          setPhase("setup");
        }}
        onRestart={() => {
          discardAudio();
          setTake((t) => t + 1);
        }}
      />
    );
  }

  const done = k >= 4 && (preview || attemptId);

  return (
    <div className="pi-rec" style={{ background: PI_BACKGROUND, color: "var(--color-paper)", minHeight: "100dvh" }}>
      <PiTopbar href={homeHref} />
      {phase === "setup" && (blocked || wallet.confirming) ? (
        <main id="obsah" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 md:px-8">
          <h1 className="h text-4xl leading-tight md:text-6xl">Pitch pred kamerou</h1>
          <PitchPaywall paymentsEnabled={wallet.paymentsEnabled} confirming={wallet.confirming} />
        </main>
      ) : phase === "setup" ? (
        <main id="obsah">
          <SessionSetup
            heading="Pitch pred kamerou"
            lead={`${targetSeconds >= 60 ? `${targetSeconds / 60} min` : `${targetSeconds} s`} pitch ${AUDIENCE_LABELS[setup.audience].toLowerCase()}. ${FOCUS_GOALS[setup.focus]} Tréner ti počas pitchu radí, na konci dostaneš spätnú väzbu.`}
            backHref={homeHref}
            backLabel="Prehľad"
            modes={null}
            mode={mode}
            onMode={() => {}}
            {...prefs}
            onMic={(on) => {
              prefs.onMic(on);
              if (!on) phone.stop();
            }}
            error={error}
            startLabel={videoMode ? "Analyzovať video" : "Spustiť nahrávanie"}
            canStart={micReady && sourceReady}
            finePrint="Spustením súhlasíš, že nahrávku vyhodnotí AI. Video zostáva v tvojom prehliadači."
            onStart={start}
            micSource={<PhoneMicPanel phone={phone} level={recorder.level} />}
            top={<VideoSourcePicker file={videoFile} onFile={setVideoFile} useVideo={videoMode} onUseVideo={setVideoMode} maxSeconds={maxVideoSeconds} />}
          >
            {wallet.balance ? <p className="text-sm font-bold text-accent">{balanceLabel(wallet.balance)}</p> : null}
            <LengthPicker {...lengthState} length={targetSeconds} balance={wallet.balance} buyHref={preview ? setupHref : "/app/nastavenia#plan"} />
            <LanguagePicker {...languageState} />
            <OutlineEditor {...outlineState} />
            <button
              type="button"
              role="switch"
              aria-checked={fullscreen}
              onClick={toggleFullscreen}
              className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition md:p-6 ${fullscreen ? "border-signal bg-signal/10" : "border-line hover:border-faint"}`}
            >
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-accent">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
              <span className="min-w-0 flex-1">
                <span className="block text-lg font-bold">Spustiť na celú obrazovku</span>
                <span className="block text-sm leading-snug text-mute">Veľký záber, ktorý uvidíš aj z diaľky. Na obrazovke bude len tlačidlo Zastaviť.</span>
              </span>
              <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${fullscreen ? "bg-signal" : "bg-line"}`} aria-hidden="true">
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${fullscreen ? "left-6" : "left-1"}`} />
              </span>
            </button>
            <p className="text-sm text-mute">
              <Link href={setupHref} className="font-bold text-accent">
                Zmeniť publikum
              </Link>
            </p>
            {micText ? (
              <p className="text-sm text-marker" role="status">
                {micText}
              </p>
            ) : null}
          </SessionSetup>
        </main>
      ) : (
        <main id="obsah" style={{ display: "flex", justifyContent: "center", padding: "40px 32px" }}>
          <div className="card" style={{ flex: "1 1 640px", maxWidth: "860px", minWidth: "0", padding: "32px" }}>
            <h1 className="h" style={{ fontSize: "36px", margin: "8px 0 8px" }}>
              Analyzujem tvoj pitch.
            </h1>
            <p className="muted" style={{ margin: "0 0 24px", fontSize: "16px" }}>
              Výsledok bude hotový približne za 15 sekúnd.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} aria-live="polite">
              {(outline ? [...STEPS.slice(0, 3), OUTLINE_STEP] : STEPS).map(([title, detail], i) => (
                <div
                  key={title}
                  className="stp"
                  style={k > i ? { borderColor: "var(--color-mint)", background: "var(--pi-sel)" } : k === i ? { borderColor: "var(--color-violet)" } : undefined}
                >
                  <span style={{ display: "inline-flex", width: "24px", height: "24px" }}>
                    {k > i ? (
                      <svg width="24" height="24" viewBox="0 0 22 22" aria-label="Hotovo">
                        <circle cx="11" cy="11" r="11" fill="var(--color-signal)" />
                        <path d="M6 11.5L9.5 15L16 8" fill="none" stroke="#141414" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg width="24" height="24" viewBox="0 0 22 22" aria-hidden="true">
                        <circle cx="11" cy="11" r="10" fill="none" stroke="var(--color-line-strong)" strokeWidth="2" />
                      </svg>
                    )}
                  </span>
                  <span style={{ flex: "1" }}>
                    <b style={{ display: "block", fontSize: "15px" }}>{title}</b>
                    <span className="muted" style={{ fontSize: "13px" }}>
                      {detail}
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {error ? (
              <div style={{ marginTop: "24px" }}>
                <p role="alert" style={{ margin: "0 0 14px", fontSize: "15px", color: "var(--color-coral)" }}>
                  {error}
                </p>
                {canResend ? (
                  <button type="button" className="btn btn-p" onClick={() => void send()} style={{ width: "100%", minHeight: "54px", marginBottom: "10px" }}>
                    Odoslať nahrávku znova
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={retry} style={{ width: "100%", minHeight: "54px" }}>
                  {canResend ? "Nahrať odznova" : "Skús znova"}
                </button>
              </div>
            ) : null}
            {done ? (
              <div style={{ marginTop: "24px" }}>
                <Link
                  className="btn btn-p"
                  href={feedbackHref.replace("{id}", attemptId ?? "")}
                  style={{ width: "100%", boxSizing: "border-box", minHeight: "54px" }}
                >
                  Zobraziť feedback
                </Link>
              </div>
            ) : null}
          </div>
        </main>
      )}
    </div>
  );
}
