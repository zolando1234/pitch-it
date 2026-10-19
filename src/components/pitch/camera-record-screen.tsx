"use client";

import "@/styles/screens/record.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCoachPrefs, type CoachResult } from "@/components/coach/coach-live";
import { preloadCoachModels, type TrackingQuality } from "@/components/coach/CameraStage";
import { useLocale } from "@/components/i18n/locale-provider";
import { LanguagePicker, usePitchLanguage } from "@/components/pitch/language-picker";
import { LengthPicker, usePitchLength } from "@/components/pitch/length-picker";
import { OutlineEditor, usePitchOutline } from "@/components/pitch/outline-editor";
import { PhoneMicPanel } from "@/components/pitch/phone-mic-panel";
import { PI_BACKGROUND, PiTopbar } from "@/components/pitch/pi-topbar";
import { balanceLabel, PitchPaywall, usePitchBalance } from "@/components/pitch/pitch-paywall";
import { PitchStudio } from "@/components/pitch/pitch-studio";
import { VoiceStudio } from "@/components/pitch/voice-studio";
import { QaSession, type QaAnswerRecording } from "@/components/pitch/qa-session";
import { QaSettings, useQaPrefs } from "@/components/pitch/qa-settings";
import { primeAudio, SegmentUploader, segmentsFromFile } from "@/components/pitch/speech-capture";
import { usePhoneMic } from "@/components/pitch/use-phone-mic";
import { hasLiveAudio, uploadPitchWithRetry, usePitchRecorder, type Recording, type RecorderSetup } from "@/components/pitch/use-recorder";
import { VideoSourcePicker, type VideoAnalysis } from "@/components/pitch/video-source-picker";
import { CUSTOM_MAX_SECONDS, fitLength, type PitchBalance } from "@/lib/billing/pitch-pack";
import { keepLocalSession } from "@/lib/coach/local-session";
import { ruleFilterFor, type TalkMode } from "@/lib/coach/modes";
import { toStoredCoach } from "@/lib/coach/stored";
import { maxQuestionsFor } from "@/lib/pitch/meeting";
import { CLIENT_MAX_QUESTIONS } from "@/lib/pitch/qa";

/*
  Tréning: najprv typ (verejné vystúpenie, stretnutie s klientom, online prezentácia), potom
  nastavenie a nahrávanie s živým trénerom reči tela. Zvuk ide na prepis po úsekoch už počas
  prejavu. Po prejave voliteľne Q&A (otázky nahlas, odpovede sa hodnotia zvlášť), potom report.
*/

type Phase = "mode" | "setup" | "live" | "qa" | "analyze";
type TrainingMode = "public" | "client" | "online";

const TX = {
  sk: {
    modesTitle: "Aký tréning chceš?",
    modesLead: "Každý typ hodnotí niečo iné. Začni verejným vystúpením, ďalšie pribudnú čoskoro.",
    modes: {
      public: ["Verejné vystúpenie pred publikom", "Pitch, prednáška či prejav na pódiu. Reč tela, hlas, obsah a voliteľne otázky z publika."],
      client: ["Stretnutie s klientom", "Vysvetľuješ ponuku pri stole a klient ťa priebežne preruší otázkami."],
      online: ["Online prezentácia", "Prezentácia cez kameru a zdieľanú obrazovku. Čoskoro."],
    },
    soon: "Čoskoro",
    heading: "Verejné vystúpenie",
    lead: "Nastav si tréning. Všetko sa pamätá, nabudúce môžeš rovno začať.",
    clientHeading: "Stretnutie s klientom",
    clientLead: "Vysvetľuješ klientovi svoju ponuku, len hlasom, bez kamery. Klient ťa v náhodných chvíľach preruší otázkou k tomu, čo si práve povedal. Odpovieš a pokračuješ ďalej.",
    clientQuestions: "Otázky klienta počas výkladu",
    clientQuestionsNote: (max: number) =>
      max ? `Klient sa ozve v prirodzenej pauze, najskôr po chvíli výkladu. Na túto dĺžku stretnutia najviac ${max}, na viac otázok zvoľ dlhšie stretnutie.` : "Stretnutie je na otázky príliš krátke. Zvoľ aspoň 1 minútu.",
    clientBefore: ["Stačí mikrofón, kamera sa pri stretnutí nepoužíva.", "Hovor tak, ako keby oproti sedel klient.", "Keď sa klient spýta, odpovedz a pokračuj vo výklade."],
    clientTitle: "Stretnutie s klientom",
    kindAi: ["Tréning s AI klientom", "Len hlas. AI klient ťa počas výkladu preruší otázkami."],
    kindReal: ["Skutočné stretnutie", "Len hlas. Nahráš reálny rozhovor s klientom, oddelíme tvoju reč od klienta a vyhodnotíme stretnutie aj tvoje reakcie."],
    realLead: "Nahraj skutočné stretnutie, len hlas. Rozpoznáme, kedy hovoríš ty a kedy klient, a vyhodnotíme tvoju reč, držanie sa témy aj to, ako si reagoval na klienta.",
    realBefore: ["Mikrofón (alebo mobil) daj medzi seba a klienta, aby bolo počuť oboch.", "Pred nahrávaním sa klienta spýtaj, či súhlasí.", "Stretnutie môžeš nahrať aj diktafónom v mobile a nahrávku pridať neskôr."],
    realSource: "Nahrávka stretnutia",
    realLive: ["Nahrávať teraz", "Spustíš nahrávanie a položíš počítač alebo mobil na stôl."],
    realFile: ["Nahrať hotovú nahrávku", "Zvuk alebo video z mobilu či diktafónu. Netreba ho prehrávať, vyhodnotí sa hneď."],
    realFileNote: (min: number) => `MP3, M4A, WAV alebo video. Vyhodnotíme prvých ${min} min, z videa len zvuk.`,
    changeMode: "Iný typ tréningu",
    back: "Prehľad",
    howSpeak: "Mikrofón",
    noMic: ["Bez mikrofónu", "Obe ruky voľné. Sledujeme gestá oboch rúk."],
    withMic: ["S mikrofónom v ruke", "Ruku s mikrofónom rozpoznáme automaticky a sledujeme, či ho držíš pri ústach."],
    quality: "Kvalita sledovania",
    qualities: {
      fast: ["Rýchla", "staršie notebooky", "Najľahší model. Plynulý aj na pomalom počítači, menej presný."],
      balanced: ["Vyvážená", "odporúčame", "Dobrá presnosť. Ak počítač nestíha, prepne sa na rýchlu."],
      precise: ["Presná", "výkonný počítač", "Najpresnejšie sledovanie tela, najlepšie keď stojíš ďalej. Potrebuje silnú grafiku."],
    },
    before: ["Postav sa 2 až 3 m od kamery.", "Kamera vidí trup, ideálne po kolená.", "Odpočet beží, až keď ťa kamera vidí."],
    fullscreen: "Spustiť na celú obrazovku",
    fullscreenNote: "Veľký záber, ktorý uvidíš aj z diaľky. Na obrazovke bude len tlačidlo Zastaviť.",
    phoneFirst: "Najprv pripoj mobil cez odkaz vyššie, alebo prepni na mikrofón počítača.",
    micDenied: "Prístup k mikrofónu je zamietnutý. Povoľ ho v nastaveniach prehliadača a obnov stránku.",
    noRecorder: "Tento prehliadač nevie nahrávať. Skús Chrome, Edge alebo Safari.",
    micStarting: "Zapínam mikrofón…",
    micMissing: "Nie je pripojený žiadny mikrofón. Pripoj mikrofón (alebo mobil ako mikrofón) a nahrávanie sa dá spustiť.",
    noMicQa: "Na odpovede v Q&A treba mikrofón. Pripoj ho, alebo Q&A vypni.",
    micLost: "Mikrofón sa odpojil, nahrávanie sme zastavili. Pripoj mikrofón a spusti nahrávanie znova.",
    pickVideo: "Vyber video.",
    startRecording: "Spustiť nahrávanie",
    analyzeVideo: "Analyzovať video",
    analyzeRecording: "Vyhodnotiť nahrávku",
    consent: "Spustením súhlasíš, že prejav vyhodnotí AI. Video zostáva v tvojom prehliadači, na server ide len zvuk na prepis.",
    videoTitle: "Analýza videa",
    liveTitle: "Verejné vystúpenie",
    subtitle: (target: string) => `Cieľ ${target}`,
    analyzing: "Vyhodnocujem tvoj prejav.",
    eta: "Prepis prebiehal už počas prejavu, výsledok bude hotový o pár sekúnd.",
    steps: [
      ["Reč tela", "Gestá, pohľad, postoj a záznam chýb"],
      ["Prepis reči", "Úseky prepísané počas prejavu sa spoja"],
      ["Tempo a vypĺňacie slová", "Slabiky za sekundu, pauzy, ehm a akože"],
      ["Obsah", "Hodnotenie obsahu, podklady a zhoda s osnovou"],
    ],
    qaStep: ["Q&A", "Hodnotenie odpovedí na otázky"],
    done: "Hotovo",
    resend: "Skúsiť znova",
    recordAgain: "Nahrať odznova",
    showFeedback: "Zobraziť feedback",
    noVideoAudio: "Zvuk z tohto videa sa nepodarilo prečítať. Vyhodnotíme aspoň reč tela.",
  },
  en: {
    modesTitle: "What do you want to train?",
    modesLead: "Each type scores something different. Start with public speaking, more are coming soon.",
    modes: {
      public: ["Public speaking", "A pitch, lecture or talk on stage. Body language, voice, content and optional audience questions."],
      client: ["Client meeting", "You explain your offer at the table and the client interrupts you with questions."],
      online: ["Online presentation", "Presenting on camera with a shared screen. Coming soon."],
    },
    soon: "Coming soon",
    heading: "Public speaking",
    lead: "Set up your training. Everything is remembered, next time you can start right away.",
    clientHeading: "Client meeting",
    clientLead: "You explain your offer to a client, voice only, no camera. At random moments the client interrupts with a question about what you just said. You answer and carry on.",
    clientQuestions: "Client questions during the talk",
    clientQuestionsNote: (max: number) =>
      max ? `The client speaks up in a natural pause, after a while of talking. For this meeting length at most ${max}; for more questions pick a longer meeting.` : "The meeting is too short for questions. Pick at least 1 minute.",
    clientBefore: ["A microphone is all you need, the camera isn't used in a meeting.", "Talk as if the client sat opposite you.", "When the client asks, answer and carry on with your explanation."],
    clientTitle: "Client meeting",
    kindAi: ["Practice with an AI client", "Voice only. The AI client interrupts you with questions while you talk."],
    kindReal: ["Real meeting", "Voice only. Record a real conversation with a client; we separate your speech from the client's and evaluate the meeting and your reactions."],
    realLead: "Record a real meeting, voice only. We detect when you speak and when the client does, and evaluate your speech, staying on topic and how you reacted to the client.",
    realBefore: ["Put the microphone (or phone) between you and the client so both can be heard.", "Ask the client for consent before recording.", "You can also record the meeting with your phone's voice recorder and upload it later."],
    realSource: "Meeting recording",
    realLive: ["Record now", "Start recording and put the computer or phone on the table."],
    realFile: ["Upload a recording", "Audio or video from a phone or recorder. No need to play it, it's evaluated right away."],
    realFileNote: (min: number) => `MP3, M4A, WAV or video. We evaluate the first ${min} min; from a video only the sound.`,
    changeMode: "Another training type",
    back: "Overview",
    howSpeak: "Microphone",
    noMic: ["No microphone", "Both hands free. We track gestures of both hands."],
    withMic: ["Handheld microphone", "We detect the hand holding the mic automatically and check that you keep it at your mouth."],
    quality: "Tracking quality",
    qualities: {
      fast: ["Fast", "older laptops", "The lightest model. Smooth even on a slow computer, less accurate."],
      balanced: ["Balanced", "recommended", "Good accuracy. If the computer can't keep up, it switches to fast."],
      precise: ["Precise", "powerful computer", "The most accurate body tracking, best when you stand further away. Needs a strong GPU."],
    },
    before: ["Stand 2 to 3 m from the camera.", "The camera sees your torso, ideally down to the knees.", "The countdown runs only once the camera sees you."],
    fullscreen: "Start in full screen",
    fullscreenNote: "A big view you can see from a distance. Only the Stop button stays on screen.",
    phoneFirst: "Connect your phone using the link above first, or switch to the computer microphone.",
    micDenied: "Microphone access is denied. Allow it in your browser settings and reload the page.",
    noRecorder: "This browser can't record. Try Chrome, Edge or Safari.",
    micStarting: "Starting the microphone…",
    micMissing: "No microphone is connected. Connect a microphone (or use your phone as one) to start recording.",
    noMicQa: "Q&A answers need a microphone. Connect one or turn Q&A off.",
    micLost: "The microphone disconnected, so we stopped the recording. Connect it and start again.",
    pickVideo: "Choose a video.",
    startRecording: "Start recording",
    analyzeVideo: "Analyze video",
    analyzeRecording: "Evaluate the recording",
    consent: "By starting you agree that your talk is evaluated by AI. The video stays in your browser, only the sound goes to the server for transcription.",
    videoTitle: "Video analysis",
    liveTitle: "Public speaking",
    subtitle: (target: string) => `Target ${target}`,
    analyzing: "Evaluating your talk.",
    eta: "The transcription ran during your talk, the result will be ready in a few seconds.",
    steps: [
      ["Body language", "Gestures, gaze, posture and mistake log"],
      ["Transcript", "Parts transcribed during the talk are joined"],
      ["Pace and filler words", "Syllables per second, pauses, um and like"],
      ["Content", "Content score, your documents and outline match"],
    ],
    qaStep: ["Q&A", "Scoring your answers to the questions"],
    done: "Done",
    resend: "Try again",
    recordAgain: "Record again",
    showFeedback: "Show feedback",
    noVideoAudio: "The sound of this video couldn't be read. We'll score the body language at least.",
  },
};

const FULLSCREEN_KEY = "pitchit-pitch-fullscreen";
const ANALYSIS_KEY = "pitchit-video-analysis";
const CLIENT_COUNT_KEY = "pitchit-client-questions";
const CLIENT_KIND_KEY = "pitchit-client-kind";

const fmtTarget = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

function readPref(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writePref(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // voľbu si len nezapamätáme
  }
}

function Choice({ active, onClick, title, meta, text, disabled = false }: { active: boolean; onClick: () => void; title: string; meta?: string; text: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`flex min-w-0 flex-col rounded-2xl border-2 p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "border-signal bg-signal/10" : "border-line hover:border-faint"
      }`}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-lg font-bold">{title}</span>
        {meta ? <span className="shrink-0 font-mono text-xs text-mute">{meta}</span> : null}
      </span>
      <span className="mt-1 text-sm leading-snug text-mute">{text}</span>
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-widest text-mute">{title}</h2>
      {children}
    </section>
  );
}

export function CameraRecordScreen({
  setup,
  feedbackHref,
  homeHref = "/app",
  balance: initialBalance = null,
  paid = false,
}: {
  setup: RecorderSetup;
  /** zostatok pitchov (paywall) */
  balance?: PitchBalance | null;
  /** návrat zo Stripe po platbe */
  paid?: boolean;
  homeHref?: string;
  /** Kam viesť po analýze; `{id}` sa nahradí id pokusu. */
  feedbackHref: string;
}) {
  const prefs = useCoachPrefs();
  const locale = useLocale();
  const tx = TX[locale];
  const router = useRouter();
  const wallet = usePitchBalance(initialBalance, paid);
  const blocked = !!wallet.balance && !wallet.balance.canPitch;
  const outlineState = usePitchOutline();
  const languageState = usePitchLanguage();
  const lengthState = usePitchLength(setup.targetSeconds);
  const qa = useQaPrefs();
  const language = languageState.language;
  // dlhšie ako 3 minúty len s kúpenými pitchami; inak najdlhšia bezplatná dĺžka
  // dlhší prejav, než dovoľuje zostatok minút, sa skráti na najdlhší možný
  const targetSeconds = fitLength(lengthState.length, wallet.balance);
  const [trainingMode, setTrainingMode] = useState<TrainingMode | null>(null);
  const [clientKind, setClientKind] = useState<"ai" | "real">("ai");
  useEffect(() => {
    if (readPref(CLIENT_KIND_KEY) === "real") setClientKind("real"); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage je len na klientovi
  }, []);
  const chooseClientKind = (kind: "ai" | "real") => {
    writePref(CLIENT_KIND_KEY, kind);
    setClientKind(kind);
  };
  const pitchSetup = useMemo(
    () => ({ ...setup, targetSeconds, language, uiLocale: locale, mode: trainingMode === "client" ? (clientKind === "real" ? ("meeting" as const) : ("client" as const)) : ("public" as const) }),
    [setup, targetSeconds, language, locale, trainingMode, clientKind],
  );
  const { outline } = outlineState;

  const client = trainingMode === "client";
  /** stretnutie s AI klientom (len hlas, otázky) alebo nahrávka skutočného stretnutia */
  const aiMeeting = client && clientKind === "ai";
  const realMeeting = client && clientKind === "real";
  const [clientCount, setClientCount] = useState(3);
  useEffect(() => {
    const saved = Number(readPref(CLIENT_COUNT_KEY));
    if (saved >= 1 && saved <= CLIENT_MAX_QUESTIONS) setClientCount(saved); // eslint-disable-line react-hooks/set-state-in-effect -- localStorage je len na klientovi
  }, []);
  const chooseClientCount = (n: number) => {
    writePref(CLIENT_COUNT_KEY, String(n));
    setClientCount(n);
  };
  /** odpovede klientovi počas stretnutia (vyhodnotia sa ako Q&A) */
  const meetingAnswers = useRef<QaAnswerRecording[]>([]);
  const [videoMode, setVideoMode] = useState(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<VideoAnalysis>("quick");
  const maxVideoSeconds = wallet.balance ? wallet.balance.maxSeconds : CUSTOM_MAX_SECONDS;

  const recorder = usePitchRecorder();
  const { open, attach, release } = recorder;
  const phone = usePhoneMic();
  const phoneStream = phone.stream;
  const stopPhone = phone.stop;
  const usingPhone = useRef(false);
  const [phase, setPhase] = useState<Phase>("mode");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [k, setK] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [take, setTake] = useState(0);
  const [fullscreen, setFullscreen] = useState(true);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [questionsFailed, setQuestionsFailed] = useState(false);
  const audioStarted = useRef<Promise<boolean> | null>(null);
  /** zvuk nahratého videa: dekóduje a odošle sa hneď po štarte */
  const videoAudio = useRef<Promise<Recording | null> | null>(null);
  const [canResend, setCanResend] = useState(false);
  const pending = useRef<{ recording: Recording; coach: ReturnType<typeof toStoredCoach> | null; summary: CoachResult["summary"] | null; videoUrl: string | null } | null>(null);
  const analysisRun = useRef<Promise<{ ok: true; attemptId: string } | { ok: false; message: string; retryable: boolean }> | null>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- localStorage je len na klientovi */
    setFullscreen(readPref(FULLSCREEN_KEY) !== "0");
    setAnalysis(readPref(ANALYSIS_KEY) === "live" ? "live" : "quick");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);
  const toggleFullscreen = () => {
    writePref(FULLSCREEN_KEY, fullscreen ? "0" : "1");
    setFullscreen(!fullscreen);
  };
  const chooseAnalysis = (value: VideoAnalysis) => {
    writePref(ANALYSIS_KEY, value);
    setAnalysis(value);
  };

  const mode: TalkMode = useMemo(
    () => ({
      kind: "talk",
      id: "pitch",
      title: tx.liveTitle,
      subtitle: "",
      // video sa analyzuje celé (do limitu plánu), živé nahrávanie končí cieľovou dĺžkou
      durationMs: (videoFile ? maxVideoSeconds : targetSeconds) * 1000,
    }),
    [targetSeconds, videoFile, maxVideoSeconds, tx.liveTitle],
  );
  // skutočné stretnutie za stolom: bez pravidiel pódia a nôh
  const ruleFilter = useMemo(() => ruleFilterFor(mode, false), [mode]);
  const maxClientQuestions = maxQuestionsFor(targetSeconds * 1000);

  // mikrofón: na nahrávanie aj na odpovede v Q&A (aj pri nahratom videe)
  useEffect(() => {
    void open();
  }, [open]);

  // zvuk z mobilu nahradí mikrofón počítača; po odpojení mobilu sa vrátime k mikrofónu počítača
  useEffect(() => {
    if (phoneStream) {
      usingPhone.current = true;
      attach(phoneStream);
    } else if (usingPhone.current) {
      usingPhone.current = false;
      void open();
    }
  }, [phoneStream, attach, open]);

  // modely na sledovanie tela sa načítajú na pozadí už na výbere tréningu.
  // Spracovanie knižnice trvá chvíľu: hneď po kliknutí by zasekla prechod na nastavenie.
  useEffect(() => {
    // chvíľu po zobrazení výberu tréningu, kým človek číta (nie až po kliknutí)
    const id = setTimeout(() => preloadCoachModels(prefs.quality), 600);
    return () => clearTimeout(id);
  }, [prefs.quality]);

  // kroky analýzy postupujú, posledný sa uzavrie až po odpovedi servera
  useEffect(() => {
    if (phase !== "analyze" || error) return;
    const timer = setInterval(() => setK((v) => (attemptId ? 5 : Math.min(3, v + 1))), 1000);
    return () => clearInterval(timer);
  }, [phase, error, attemptId]);

  // Next.js stránku pri odchode neodpojí, len skryje. Po návrate má čakať nové nahrávanie.
  useLayoutEffect(
    () => () => {
      pending.current = null;
      analysisRun.current = null;
      setPhase("mode");
      setK(0);
      setAttemptId(null);
      setError(null);
      stopPhone();
    },
    [stopPhone],
  );

  const phoneSelected = phone.state !== "idle";
  // mikrofón musí byť pripojený: pri nahrávaní vždy, pri nahratom videe len kvôli odpovediam v Q&A
  const micConnected = phoneSelected ? phone.state === "connected" && hasLiveAudio(recorder.stream) : recorder.media === "ready";
  // nahratý súbor: pri tréningu s AI klientom sa nepoužíva (len živý hlas)
  const fileMode = videoMode && !aiMeeting;
  const micNeeded = !fileMode || (qa.enabled && !client);
  const micReady = !micNeeded || micConnected;
  const sourceReady = !fileMode || !!videoFile;
  const hint = !sourceReady
    ? tx.pickVideo
    : micReady
      ? null
      : phoneSelected
        ? tx.phoneFirst
        : recorder.media === "denied"
          ? tx.micDenied
          : recorder.media === "unsupported"
            ? tx.noRecorder
            : recorder.media === "missing" || recorder.media === "lost"
              ? fileMode
                ? tx.noMicQa
                : tx.micMissing
              : tx.micStarting;

  const start = () => {
    if (!sourceReady) return;
    // posledná kontrola tesne pred štartom: mikrofón mohol medzitým vypadnúť
    if (micNeeded && !recorder.micLive()) {
      setError(fileMode ? tx.noMicQa : tx.micMissing);
      return;
    }
    // celú obrazovku smie prehliadač zapnúť len priamo po kliknutí (pri „Len analyzovať“ netreba)
    const quiet = videoMode && analysis === "quick";
    if (fullscreen && !quiet && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    // zvuk sa odomkne priamo kliknutím (Safari inak nahrávanie aj odpovede v Q&A nespustí)
    primeAudio();
    meetingAnswers.current = [];
    setError(null);
    setNotice(null);
    audioStarted.current = null;
    videoAudio.current = null;
    // stretnutie s klientom je len hlasové: nahrávanie začne hneď (z kliknutia), kamera sa nezapína
    if (client) {
      // hotová nahrávka skutočného stretnutia: rovno prepis a vyhodnotenie, netreba ju prehrávať
      if (realMeeting && fileMode && videoFile) {
        void analyzeMeetingFile(videoFile);
        return;
      }
      // skutočné stretnutie: rozlíšiť rečníkov (ty a klient)
      audioStarted.current = recorder.start(language, { diarize: realMeeting }).then((ok) => {
        if (!ok) abortForMic();
        return ok;
      });
    }
    setPhase("live");
  };

  const onLive = () => {
    if (videoFile) {
      // zvuk videa sa dekóduje zo súboru a ide na prepis hneď, kým beží analýza reči tela
      videoAudio.current = segmentsFromFile(videoFile, maxVideoSeconds)
        .then(async ({ segments, durationMs }) => {
          const uploader = new SegmentUploader(crypto.randomUUID(), language);
          segments.forEach((segment) => uploader.add(segment));
          await uploader.finish();
          return { draftId: uploader.draftId, segments: uploader.count, durationMs };
        })
        .catch(() => null);
      return;
    }
    audioStarted.current = recorder.start(language).then((ok) => {
      // bez zvuku nemá nahrávanie zmysel: zastavíme ho a vrátime sa na nastavenie
      if (!ok) abortForMic();
      return ok;
    });
  };

  /** Mikrofón nie je alebo vypadol: nahrávanie sa zastaví a ukáže sa, čo urobiť. */
  const abortForMic = () => {
    recorder.discard();
    audioStarted.current = null;
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    setError(tx.micLost);
    setPhase("setup");
  };

  // odpojený mikrofón počas nahrávania (kábel, slúchadlá, mobil) zastaví nahrávanie
  useEffect(() => {
    if (phase !== "live" || videoFile) return;
    if (recorder.media === "lost" || recorder.media === "missing") abortForMic();
  });

  /** Otázky do Q&A po prejave (z podkladov, témy a prepisu). */
  const loadQuestions = async (recording: Recording | null) => {
    setQuestions(null);
    setQuestionsFailed(false);
    try {
      const response = await fetch("/api/pitch/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count: qa.count,
          language,
          draftId: recording?.draftId ?? null,
          segments: recording?.segments ?? 0,
          topic: outline?.topic || null,
          outline: outline?.points ?? null,
        }),
      });
      const data = (await response.json().catch(() => null)) as { questions?: string[] } | null;
      if (response.ok && data?.questions?.length) setQuestions(data.questions);
      else setQuestionsFailed(true);
    } catch {
      setQuestionsFailed(true);
    }
  };

  const openReport = (id: string) => {
    setAttemptId(id);
    setK(5);
    router.push(feedbackHref.replace("{id}", id));
  };

  /** Spustí (alebo zopakuje) analýzu prejavu na serveri. */
  const runAnalysis = () => {
    const p = pending.current;
    if (!p) return null;
    const run = uploadPitchWithRetry(p.recording, pitchSetup, p.coach, outline).then((result) => {
      if (result.ok) {
        if (p.summary) keepLocalSession(result.attemptId, { summary: p.summary, videoUrl: p.videoUrl });
        void wallet.reload();
      }
      return result;
    });
    analysisRun.current = run;
    return run;
  };

  const showResult = async () => {
    const result = await analysisRun.current;
    if (!result) return;
    if (result.ok) {
      pending.current = null;
      setCanResend(false);
      openReport(result.attemptId);
    } else {
      setCanResend(result.retryable && !!pending.current);
      setError(result.message);
    }
  };

  const onFinish = async (result: CoachResult) => {
    const coach = toStoredCoach(result.summary, { teleprompter: false, micMode: prefs.micMode });
    const withQa = !client && qa.enabled && (recorder.media === "ready" || !!phoneStream);
    setPhase(withQa ? "qa" : "analyze");
    setK(1);
    if (withQa) setQuestions(null);

    let recording: Recording | null = null;
    if (videoFile) {
      recording = (await videoAudio.current) ?? null;
      if (!recording) setNotice(tx.noVideoAudio);
    } else if (audioStarted.current && (await audioStarted.current)) {
      recording = await recorder.stop();
    }
    // bez zvuku pošleme aspoň reč tela, server z nej spraví spätnú väzbu
    const final: Recording = recording ?? { draftId: crypto.randomUUID(), segments: 0, durationMs: result.summary.durationMs };
    pending.current = { recording: final, coach, summary: result.summary, videoUrl: result.recording?.url ?? null };
    runAnalysis();
    if (withQa) void loadQuestions(recording);
    else {
      release();
      await showResult();
    }
  };

  /** Hotová nahrávka skutočného stretnutia: zvuk sa dekóduje, prepíše s rečníkmi a vyhodnotí. */
  const analyzeMeetingFile = async (file: File) => {
    setPhase("analyze");
    setK(1);
    let recording: Recording | null = null;
    try {
      const { segments, durationMs } = await segmentsFromFile(file, maxVideoSeconds);
      const uploader = new SegmentUploader(crypto.randomUUID(), language, null, true);
      segments.forEach((segment) => uploader.add(segment));
      await uploader.finish();
      recording = { draftId: uploader.draftId, segments: uploader.count, durationMs };
    } catch {
      recording = null;
    }
    if (!recording || !recording.segments) {
      setError(tx.noVideoAudio);
      setPhase("setup");
      return;
    }
    pending.current = { recording, coach: null, summary: null, videoUrl: null };
    runAnalysis();
    await showResult();
  };

  /** Koniec hlasového stretnutia s klientom: bez reči tela, odpovede klientovi idú ako Q&A. */
  const onVoiceFinish = async (elapsedMs: number) => {
    setPhase("analyze");
    setK(1);
    const recording = audioStarted.current && (await audioStarted.current) ? await recorder.stop() : null;
    const final: Recording = recording ?? { draftId: crypto.randomUUID(), segments: 0, durationMs: elapsedMs };
    pending.current = { recording: final, coach: null, summary: null, videoUrl: null };
    runAnalysis();
    if (meetingAnswers.current.length) void onQaDone(meetingAnswers.current);
    else {
      release();
      await showResult();
    }
  };

  /** Q&A hotové: počká na analýzu prejavu, odošle odpovede a otvorí report. */
  const onQaDone = async (answers: QaAnswerRecording[]) => {
    setPhase("analyze");
    const stream = recorder.stream;
    const result = await analysisRun.current;
    release();
    if (!stream && !answers.length) return showResult();
    if (!result || !result.ok) return showResult();
    if (answers.length) {
      try {
        const uploaded = await Promise.all(
          answers.map(async (a) => {
            if (!a.segments.length) return { question: a.question, draftId: null, segments: 0, durationMs: a.durationMs };
            const uploader = new SegmentUploader(crypto.randomUUID(), language, result.attemptId);
            a.segments.forEach((segment) => uploader.add(segment));
            await uploader.finish();
            return { question: a.question, draftId: uploader.draftId, segments: uploader.count, durationMs: a.durationMs };
          }),
        );
        await fetch(`/api/pitch/${result.attemptId}/qa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ uiLocale: locale, answers: uploaded }),
        });
      } catch {
        // Q&A je doplnok: report prejavu sa otvorí aj bez neho
      }
    }
    pending.current = null;
    openReport(result.attemptId);
  };

  const onError = (message: string) => {
    recorder.discard();
    audioStarted.current = null;
    setError(message);
    setPhase("setup");
  };

  const retry = () => {
    if (pending.current?.videoUrl) URL.revokeObjectURL(pending.current.videoUrl);
    pending.current = null;
    analysisRun.current = null;
    setError(null);
    setAttemptId(null);
    setK(0);
    setPhase("setup");
    void wallet.reload();
    if (phoneStream) attach(phoneStream);
    else void open();
  };

  const resend = () => {
    setError(null);
    setK(1);
    runAnalysis();
    void showResult();
  };

  if (phase === "live" && client) {
    return (
      <VoiceStudio
        key={take}
        title={tx.clientTitle}
        durationMs={targetSeconds * 1000}
        language={language}
        level={recorder.level}
        outline={outline}
        meeting={
          realMeeting
            ? null
            : {
          questions: clientCount,
          language,
          stream: recorder.stream,
          level: recorder.level,
          topic: outline?.topic || null,
          outline: outline?.points ?? null,
          transcript: recorder.draft,
          onAnswers: (answers) => {
            meetingAnswers.current = answers;
          },
        }
        }
        onPause={recorder.pause}
        onResume={recorder.resume}
        onFinish={(ms) => void onVoiceFinish(ms)}
        onBack={() => {
          recorder.discard();
          setPhase("setup");
        }}
      />
    );
  }

  if (phase === "live") {
    return (
      <PitchStudio
        key={take}
        mode={mode}
        title={videoFile ? tx.videoTitle : tx.liveTitle}
        subtitle={tx.subtitle(fmtTarget(targetSeconds))}
        prefs={prefs}
        outline={outline}

        startFull={fullscreen && !(videoFile && analysis === "quick")}
        file={videoFile}
        quiet={!!videoFile && analysis === "quick"}
        language={language}
        level={recorder.level}
        ruleFilter={ruleFilter}
        onLive={onLive}
        onPause={recorder.pause}
        onResume={recorder.resume}
        onFinish={(r) => void onFinish(r)}
        onError={onError}
        onBack={() => {
          recorder.discard();
          setPhase("setup");
        }}
        onRestart={() => {
          recorder.discard();
          setTake((t) => t + 1);
        }}
      />
    );
  }

  if (phase === "qa") {
    return <QaSession questions={questions} failed={questionsFailed} language={language} stream={recorder.stream} homeHref={homeHref} onDone={(a) => void onQaDone(a)} />;
  }

  const done = k >= 5 && !!attemptId;
  const steps = qa.enabled ? [...tx.steps, tx.qaStep] : tx.steps;

  return (
    <div className="pi-rec" style={{ background: PI_BACKGROUND, color: "var(--color-paper)", minHeight: "100dvh" }}>
      <PiTopbar href={homeHref} />
      {phase === "mode" ? (
        <main id="obsah" className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-10 md:px-8">
          <div className="flex flex-col gap-3">
            <Link href={homeHref} className="text-sm font-bold uppercase tracking-[0.3em] text-accent">
              ← {tx.back}
            </Link>
            <h1 className="h text-4xl leading-tight md:text-6xl">{tx.modesTitle}</h1>
            <p className="max-w-2xl text-lg text-mute">{tx.modesLead}</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {(["public", "client", "online"] as const).map((m) => {
              const available = m === "public" || m === "client";
              return (
                <button
                  key={m}
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    setTrainingMode(m);
                    setPhase("setup");
                  }}
                  className={`flex min-h-48 flex-col justify-between rounded-3xl border-2 p-6 text-left transition ${
                    available ? "border-signal/60 hover:border-signal hover:bg-signal/5" : "cursor-not-allowed border-line opacity-60"
                  }`}
                >
                  <span className="text-2xl font-bold leading-tight">{tx.modes[m][0]}</span>
                  <span className="mt-3 text-sm leading-snug text-mute">{tx.modes[m][1]}</span>
                  {available ? (
                    <span className="mt-5 text-sm font-bold text-accent">→</span>
                  ) : (
                    <span className="mt-5 w-fit rounded-full bg-violet/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-violet">{tx.soon}</span>
                  )}
                </button>
              );
            })}
          </div>
        </main>
      ) : phase === "setup" && (blocked || wallet.confirming) ? (
        <main id="obsah" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 md:px-8">
          <h1 className="h text-4xl leading-tight md:text-6xl">{tx.heading}</h1>
          <PitchPaywall paymentsEnabled={wallet.paymentsEnabled} confirming={wallet.confirming} team={wallet.team} balance={wallet.balance} />
        </main>
      ) : phase === "setup" && (trainingMode === "public" || trainingMode === "client") ? (
        <main id="obsah" className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10 md:px-8">
          <div className="flex flex-col gap-3">
            <button type="button" onClick={() => setPhase("mode")} className="w-fit text-sm font-bold uppercase tracking-[0.3em] text-accent">
              ← {tx.changeMode}
            </button>
            <h1 className="h text-4xl leading-tight md:text-6xl">{client ? tx.clientHeading : tx.heading}</h1>
            <p className="max-w-2xl text-lg text-mute">{aiMeeting ? tx.clientLead : realMeeting ? tx.realLead : tx.lead}</p>
            {wallet.balance ? <p className="text-sm font-bold text-accent">{balanceLabel(wallet.balance, locale)}</p> : null}
          </div>

          {client ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice active={aiMeeting} onClick={() => chooseClientKind("ai")} title={tx.kindAi[0]} text={tx.kindAi[1]} />
              <Choice active={realMeeting} onClick={() => chooseClientKind("real")} title={tx.kindReal[0]} text={tx.kindReal[1]} />
            </div>
          ) : null}

          {realMeeting ? (
            <Section title={tx.realSource}>
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={!videoMode} onClick={() => { setVideoMode(false); setVideoFile(null); }} title={tx.realLive[0]} text={tx.realLive[1]} />
                <Choice active={videoMode} onClick={() => setVideoMode(true)} title={tx.realFile[0]} text={tx.realFile[1]} />
              </div>
              {videoMode ? (
                <div className="mt-4">
                  <input
                    type="file"
                    accept="audio/*,video/*,.m4a,.mp3,.wav,.mp4,.mov,.webm"
                    onChange={(e) => setVideoFile(e.target.files?.[0] ?? null)}
                    className="block w-full text-sm text-mute file:mr-4 file:rounded-full file:border-0 file:bg-signal file:px-5 file:py-2.5 file:font-bold file:text-on-signal hover:file:bg-signal-hover"
                  />
                  <p className="mt-2 text-xs text-faint">{tx.realFileNote(Math.round(maxVideoSeconds / 60))}</p>
                </div>
              ) : null}
            </Section>
          ) : null}

          {!client ? (
          <VideoSourcePicker
            file={videoFile}
            onFile={setVideoFile}
            useVideo={videoMode}
            onUseVideo={setVideoMode}
            maxSeconds={maxVideoSeconds}
            analysis={analysis}
            onAnalysis={chooseAnalysis}
          />
          ) : null}

          <Section title={tx.howSpeak}>
            {!client ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <Choice active={!prefs.micMode} onClick={() => prefs.onMic(false)} title={tx.noMic[0]} text={tx.noMic[1]} />
                <Choice active={prefs.micMode} onClick={() => prefs.onMic(true)} title={tx.withMic[0]} text={tx.withMic[1]} />
              </div>
            ) : null}
            {!fileMode ? (
              <div className={client ? "" : "mt-6"}>
                <PhoneMicPanel phone={phone} level={recorder.level} mic={recorder.media === "ready" ? "ready" : recorder.media === "missing" || recorder.media === "lost" ? "missing" : "other"} />
              </div>
            ) : null}
          </Section>

          {!client ? (
          <Section title={tx.quality}>
            <div className="grid gap-3 sm:grid-cols-3">
              {(["fast", "balanced", "precise"] as TrackingQuality[]).map((q) => (
                <Choice key={q} active={prefs.quality === q} onClick={() => prefs.onQuality(q)} title={tx.qualities[q][0]} meta={tx.qualities[q][1]} text={tx.qualities[q][2]} />
              ))}
            </div>
          </Section>
          ) : null}

          {!fileMode ? <LengthPicker {...lengthState} length={targetSeconds} balance={wallet.balance} plansHref="/app/nastavenia#plan" /> : null}
          <LanguagePicker {...languageState} />
          <OutlineEditor {...outlineState} />
          {aiMeeting ? (
            <Section title={tx.clientQuestions}>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={tx.clientQuestions}>
                {Array.from({ length: CLIENT_MAX_QUESTIONS }, (_, i) => i + 1).map((n) => {
                  const allowed = n <= maxClientQuestions;
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={clientCount === n}
                      disabled={!allowed}
                      onClick={() => chooseClientCount(n)}
                      className={`h-11 w-11 rounded-full border-2 text-sm font-bold transition disabled:cursor-not-allowed disabled:border-dashed disabled:opacity-40 ${
                        clientCount === n && allowed ? "border-signal bg-signal/10 text-paper" : "border-line text-mute hover:border-faint"
                      }`}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-sm text-mute">{tx.clientQuestionsNote(maxClientQuestions)}</p>
            </Section>
          ) : !client ? (
            <QaSettings {...qa} />
          ) : null}

          {!fileMode ? (
            <>
              <section className="rounded-3xl border border-line p-5 md:p-6">
                <ul className="grid gap-2 text-mute sm:grid-cols-3">
                  {(aiMeeting ? tx.clientBefore : realMeeting ? tx.realBefore : tx.before).map((tip) => (
                    <li key={tip}>• {tip}</li>
                  ))}
                </ul>
              </section>
              {!client ? (
              <button
                type="button"
                role="switch"
                aria-checked={fullscreen}
                onClick={toggleFullscreen}
                className={`flex w-full items-center gap-4 rounded-3xl border-2 p-5 text-left transition md:p-6 ${fullscreen ? "border-signal bg-signal/10" : "border-line hover:border-faint"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-lg font-bold">{tx.fullscreen}</span>
                  <span className="block text-sm leading-snug text-mute">{tx.fullscreenNote}</span>
                </span>
                <span className={`relative h-7 w-12 shrink-0 rounded-full transition ${fullscreen ? "bg-signal" : "bg-line"}`} aria-hidden="true">
                  <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-all ${fullscreen ? "left-6" : "left-1"}`} />
                </span>
              </button>
              ) : null}
            </>
          ) : null}

          <div className="flex flex-col items-start gap-3">
            {error ? <p className="rounded-xl bg-danger/15 p-4 text-coral">{error}</p> : null}
            {hint ? (
              <p className="text-sm text-marker" role="status">
                {hint}
              </p>
            ) : null}
            <button
              type="button"
              onClick={start}
              disabled={!micReady || !sourceReady}
              className="rounded-full bg-signal px-10 py-5 text-xl font-bold text-on-signal transition hover:bg-signal-hover disabled:opacity-40"
            >
              {fileMode ? (realMeeting ? tx.analyzeRecording : tx.analyzeVideo) : tx.startRecording} →
            </button>
            <p className="text-sm text-faint">{tx.consent}</p>
          </div>
        </main>
      ) : (
        <main id="obsah" style={{ display: "flex", justifyContent: "center", padding: "40px 32px" }}>
          <div className="card" style={{ flex: "1 1 640px", maxWidth: "860px", minWidth: "0", padding: "32px" }}>
            <h1 className="h" style={{ fontSize: "36px", margin: "8px 0 8px" }}>
              {tx.analyzing}
            </h1>
            <p className="muted" style={{ margin: "0 0 24px", fontSize: "16px" }}>
              {tx.eta}
            </p>
            {notice ? <p className="mb-4 text-sm text-marker">{notice}</p> : null}
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }} aria-live="polite">
              {steps.map(([title, detail], i) => (
                <div
                  key={title}
                  className="stp"
                  style={k > i ? { borderColor: "var(--color-mint)", background: "var(--pi-sel)" } : k === i ? { borderColor: "var(--color-violet)" } : undefined}
                >
                  <span style={{ display: "inline-flex", width: "24px", height: "24px" }}>
                    {k > i ? (
                      <svg width="24" height="24" viewBox="0 0 22 22" aria-label={tx.done}>
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
                  <button type="button" className="btn btn-p" onClick={resend} style={{ width: "100%", minHeight: "54px", marginBottom: "10px" }}>
                    {tx.resend}
                  </button>
                ) : null}
                <button type="button" className="btn" onClick={retry} style={{ width: "100%", minHeight: "54px" }}>
                  {tx.recordAgain}
                </button>
              </div>
            ) : null}
            {done ? (
              <div style={{ marginTop: "24px" }}>
                <Link className="btn btn-p" href={feedbackHref.replace("{id}", attemptId ?? "")} style={{ width: "100%", boxSizing: "border-box", minHeight: "54px" }}>
                  {tx.showFeedback}
                </Link>
              </div>
            ) : null}
          </div>
        </main>
      )}
    </div>
  );
}
