import "server-only";

import { getLlmProvider } from "@/lib/ai/llm/anthropic";
import { LlmError } from "@/lib/ai/llm/types";
import { TranscriptionError, transcribeWithWords } from "@/lib/ai/transcription";
import type { VisionSample } from "@/lib/analytics/vision/types";
import type { StoredCoach } from "@/lib/coach/stored";
import { canUseLength, FREE_PITCHES, PITCH_PACK, formatEur } from "@/lib/billing/pitch-pack";
import { getPitchContext } from "@/lib/db/pitch-context";
import { insertPitchAttempt, updatePitchAttempt } from "@/lib/db/pitch";
import type { PitchAttemptRow } from "@/lib/db/types";
import { consumePitch, getPitchBalance } from "@/lib/db/pitch-wallet";
import { recordUsage } from "@/lib/db/usage";
import { trackEvent } from "@/lib/events/track";
import { summarizeBody } from "@/lib/pitch/body";
import { contextForPrompt } from "@/lib/pitch/context";
import { LANGUAGE_INFO, type PitchLanguage, type SttProvider } from "@/lib/pitch/language";
import { mergeSegments, missingSegments } from "@/lib/pitch/segment-merge";
import { dropSegments, loadSegments } from "@/lib/pitch/segments";
import { buildMetrics } from "@/lib/pitch/metrics";
import { outlineByKeywords, TRANSCRIPT_PROMPT_MAX, type OutlineResult, type PitchOutline } from "@/lib/pitch/outline";
import { buildSpeechPrompt, contentScoreOf, outlineFromAnalysis, SPEECH_SYSTEM, speechAnalysisSchema, splitSentences, type StoredSpeechAnalysis } from "@/lib/pitch/speech-analysis";

const AUDIENCE_BRIEF: Record<PitchAttemptRow["audience"], string> = {
  investor: "investori",
  jury: "publikum alebo porota na verejnom vystúpení",
  customer: "zákazníci alebo partneri",
  team: "vlastný tím",
};

/** Vety do promptu najviac do limitu (aj dlhý prejav). */
function capSentences(sentences: string[]): string[] {
  const out: string[] = [];
  let length = 0;
  for (const sentence of sentences) {
    length += sentence.length + 8;
    if (length > TRANSCRIPT_PROMPT_MAX) break;
    out.push(sentence);
  }
  return out;
}

export class PitchServiceError extends Error {
  constructor(
    readonly code: "invalid" | "transcription_failed" | "limit_reached" | "segments_missing",
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "PitchServiceError";
  }
}

/** Rezerva nad 4 minúty audia (nahráva sa pri 64 kb/s, teda ~2 MB). */
export const MAX_PITCH_AUDIO_BYTES = 8 * 1024 * 1024;

export type PitchInput = {
  /** celá nahrávka naraz (staršie klienty); inak úseky prepísané počas prejavu (draft) */
  audio: Blob | null;
  fileName: string;
  /** koncept s priebežne prepísanými úsekmi */
  draft?: { id: string; segments: number } | null;
  durationMs: number;
  audience: PitchAttemptRow["audience"];
  targetSeconds: PitchAttemptRow["target_seconds"];
  focus: PitchAttemptRow["focus"];
  vision: VisionSample[] | null;
  coach?: StoredCoach | null;
  /** téma a osnova uložená pred nahrávaním */
  outline?: PitchOutline | null;
  /** jazyk, v ktorom founder pitchuje (výber modelu prepisu) */
  language?: PitchLanguage;
  /** jazyk rozhrania: v ňom sú chybové hlášky aj spätná väzba od AI */
  uiLocale?: "sk" | "en";
  /** typ tréningu: verejné vystúpenie alebo stretnutie s klientom */
  mode?: "public" | "client";
};

/**
 * Celá analýza pitchu: prepis so slovnými časmi → tempo, pauzy, vypĺňacie slová →
 * obsahové skóre (LLM) → reč tela. Nahrávka sa neukladá, pošle sa na prepis a zahodí sa.
 */
export async function analyzePitch(userId: string, input: PitchInput): Promise<PitchAttemptRow> {
  const language = input.language ?? "sk";
  const ui = input.uiLocale ?? "sk";
  const L = (sk: string, en: string) => (ui === "en" ? en : sk);
  const hasBody = Boolean(input.vision?.length || input.coach);
  const audioSize = input.audio?.size ?? 0;
  const hasSpeech = audioSize > 0 || (input.draft?.segments ?? 0) > 0;
  // pokus s kamerou má reč tela aj bez zvuku, prázdny zvuk ho preto nezastaví
  if ((!hasSpeech && !hasBody) || audioSize > MAX_PITCH_AUDIO_BYTES) {
    throw new PitchServiceError("invalid", L("Nahrávka je prázdna alebo príliš veľká.", "The recording is empty or too large."));
  }
  // úseky prepísané počas prejavu; chýbajúce pošle prehliadač znova
  const segments = input.draft ? await loadSegments(userId, input.draft.id, input.draft.segments) : [];
  if (input.draft) {
    const missing = missingSegments(segments.map((x) => x.index), input.draft.segments);
    if (missing.length) {
      throw new PitchServiceError("segments_missing", L("Časť nahrávky ešte nie je prepísaná. Skús to znova.", "Part of the recording isn't transcribed yet. Try again."), 409);
    }
  }
  const balance = await getPitchBalance(userId);
  if (!canUseLength(input.targetSeconds, balance)) {
    throw new PitchServiceError(
      "limit_reached",
      L("4-minútový pitch je v platenej verzii. Kúp si balík pitchov alebo nahraj kratší pitch.", "A 4-minute pitch is in the paid version. Buy a pitch pack or record a shorter pitch."),
      402,
    );
  }
  if (!balance.canPitch) {
    throw new PitchServiceError(
      "limit_reached",
      L(
        `Využil si ${FREE_PITCHES} pitche zadarmo. Kúp si balík ${PITCH_PACK.credits} pitchov za ${formatEur(PITCH_PACK.priceCents)} a trénuj ďalej.`,
        `You've used your ${FREE_PITCHES} free pitches. Buy a pack of ${PITCH_PACK.credits} pitches for ${formatEur(PITCH_PACK.priceCents, "en")} and keep training.`,
      ),
      402,
    );
  }

  const attempt = await insertPitchAttempt({
    user_id: userId,
    audience: input.audience,
    target_seconds: input.targetSeconds,
    focus: input.focus,
    with_camera: Boolean(input.vision?.length || input.coach),
    mode: input.mode ?? "public",
    duration_ms: input.durationMs,
  });

  try {
    const body = input.vision?.length || input.coach ? { ...summarizeBody(input.vision ?? []), coach: input.coach ?? null } : null;

    let transcript: Awaited<ReturnType<typeof transcribeWithWords>> | null = null;
    try {
      if (input.draft) {
        const merged = mergeSegments(segments);
        transcript = { text: merged.text, words: merged.words, provider: (merged.provider as SttProvider | null) ?? "elevenlabs" };
      } else if (input.audio && input.audio.size > 0) transcript = await transcribeWithWords(input.audio, input.fileName, language);
    } catch (error) {
      const notConfigured = error instanceof TranscriptionError && error.code === "not_configured";
      if (!body) {
        await updatePitchAttempt(attempt.id, { status: "failed" });
        const message = notConfigured
          ? L("Prepis reči nie je nakonfigurovaný.", "Speech transcription is not configured.")
          : L("Nahrávku sa nepodarilo prepísať. Skús to znova.", "The recording could not be transcribed. Try again.");
        throw new PitchServiceError("transcription_failed", message, 503);
      }
      // pokus s kamerou sa dokončí aj bez prepisu: skóre z reči tela
      console.warn("[pitch] prepis zlyhal, vyhodnocujem len reč tela:", error instanceof TranscriptionError ? error.code : error);
    }
    if (transcript && !transcript.text.trim()) {
      if (!body) {
        await updatePitchAttempt(attempt.id, { status: "failed" });
        throw new PitchServiceError(
          "transcription_failed",
          L("V nahrávke sme nezachytili reč. Skús to znova bližšie k mikrofónu.", "We didn't catch any speech in the recording. Try again closer to the microphone."),
        );
      }
      // s kamerou dáme aspoň spätnú väzbu k reči tela
      console.warn("[pitch] v nahrávke nie je reč, vyhodnocujem len reč tela");
      transcript = null;
    }
    if (transcript) await recordUsage(userId, "transcription_seconds", Math.ceil(input.durationMs / 1000), null);

    const metrics = transcript ? buildMetrics({ text: transcript.text, words: transcript.words, durationMs: input.durationMs, language }) : null;

    let content: StoredSpeechAnalysis | null = null;
    let score: number | null = null;
    let model: string | null = null;
    const llm = getLlmProvider();
    const outline = input.outline ?? null;
    // bez prepisu sa osnova porovnať nedá, uložíme ju aspoň na zobrazenie
    let outlineResult: OutlineResult | null = outline ? { version: 1, ...outline, check: null } : null;

    // jeden rozbor AI (téma, osnova, zrozumiteľnosť, vety, obsah podľa osnovy) namiesto viacerých volaní
    const analysisTask = async () => {
      if (!transcript) return;
      // bez AI aspoň zhoda kľúčových slov s osnovou
      if (outline) outlineResult = outlineByKeywords(outline, transcript.text);
      if (!llm) return;
      try {
        const context = await getPitchContext(userId);
        const sentences = capSentences(splitSentences(transcript.text));
        const result = await llm.generateStructured({
          purpose: "pitch_content",
          system: SPEECH_SYSTEM,
          messages: [
            {
              role: "user",
              content: buildSpeechPrompt({
                sentences,
                audience: input.mode === "client" ? "klient na obchodnom stretnutí za stolom (rečník mu vysvetľuje ponuku; klient ho priebežne prerušuje otázkami)" : AUDIENCE_BRIEF[input.audience],
                targetSeconds: input.targetSeconds,
                durationMs: input.durationMs,
                language: LANGUAGE_INFO[language].english,
                feedbackLocale: ui,
                outline,
                context: contextForPrompt(context),
              }),
            },
          ],
          schema: speechAnalysisSchema,
          effort: "low",
          maxTokens: 5_000,
          speed: "interactive",
        });
        // obsahové skóre len z bodov osnovy, ktorú si rečník zadal
        const points = outline?.points.length ? result.data.points.filter((p) => p.index < outline.points.length) : [];
        const analysis = { ...result.data, points };
        const stored: StoredSpeechAnalysis = { version: 2, analysis, derivedPoints: false, sentences };
        content = stored;
        score = contentScoreOf(analysis);
        model = result.model;
        if (outline) outlineResult = outlineFromAnalysis(outline, analysis);
        await recordUsage(userId, "exercise_evaluation", 1, null);
      } catch (error) {
        console.error("[pitch] rozbor prejavu zlyhal:", error instanceof LlmError ? error.code : error);
      }
    };

    await analysisTask();

    const patch = {
      status: "ready" as const,
      transcript: transcript ? transcript.text.slice(0, 20_000) : null,
      metrics,
      content: content as Record<string, unknown> | null,
      content_score: score,
      body,
      outline: outlineResult as Record<string, unknown> | null,
      language,
      stt_model: transcript?.provider ?? null,
      model,
    };
    await updatePitchAttempt(attempt.id, patch);
    // pitch sa započíta až po hotovej analýze
    await consumePitch(userId);
    if (input.draft) await dropSegments(userId, input.draft.id, input.draft.segments).catch(() => {});
    await trackEvent(userId, "pitch_analyzed", {
      audience: input.audience,
      target: input.targetSeconds,
      camera: Boolean(body),
      content: Boolean(content),
      outline: Boolean(outline),
    });
    return { ...attempt, ...patch } as PitchAttemptRow;
  } catch (error) {
    // pokus nesmie zostať visieť ako rozpracovaný
    if (!(error instanceof PitchServiceError)) await updatePitchAttempt(attempt.id, { status: "failed" }).catch(() => {});
    throw error;
  }
}
