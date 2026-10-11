import "server-only";

import { getLlmProvider } from "@/lib/ai/llm/anthropic";
import { LlmError } from "@/lib/ai/llm/types";
import { TranscriptionError, transcribeWithWords } from "@/lib/ai/transcription";
import type { VisionSample } from "@/lib/analytics/vision/types";
import type { StoredCoach } from "@/lib/coach/stored";
import { canUseLength, FREE_PITCHES, PITCH_PACK, formatEur } from "@/lib/billing/pitch-pack";
import { getProfile } from "@/lib/db/profile";
import { insertPitchAttempt, updatePitchAttempt } from "@/lib/db/pitch";
import type { PitchAttemptRow } from "@/lib/db/types";
import { consumePitch, getPitchBalance } from "@/lib/db/pitch-wallet";
import { recordUsage } from "@/lib/db/usage";
import { trackEvent } from "@/lib/events/track";
import { summarizeBody } from "@/lib/pitch/body";
import { buildContentPrompt, CONTENT_SYSTEM, contentScoreSchema, overallScore } from "@/lib/pitch/content";
import { LANGUAGE_INFO, type PitchLanguage } from "@/lib/pitch/language";
import { buildMetrics } from "@/lib/pitch/metrics";
import { buildOutlinePrompt, OUTLINE_SYSTEM, outlineByKeywords, outlineCheckSchema, outlineFromCheck, type OutlineResult, type PitchOutline } from "@/lib/pitch/outline";

export class PitchServiceError extends Error {
  constructor(
    readonly code: "invalid" | "transcription_failed" | "limit_reached",
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
  audio: Blob;
  fileName: string;
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
};

/**
 * Celá analýza pitchu: prepis so slovnými časmi → tempo, pauzy, vypĺňacie slová →
 * obsahové skóre (LLM) → reč tela. Nahrávka sa neukladá, pošle sa na prepis a zahodí sa.
 */
export async function analyzePitch(userId: string, input: PitchInput): Promise<PitchAttemptRow> {
  const language = input.language ?? "sk";
  const hasBody = Boolean(input.vision?.length || input.coach);
  // pokus s kamerou má reč tela aj bez zvuku, prázdny zvuk ho preto nezastaví
  if ((input.audio.size === 0 && !hasBody) || input.audio.size > MAX_PITCH_AUDIO_BYTES) {
    throw new PitchServiceError("invalid", "Nahrávka je prázdna alebo príliš dlhá (najviac 4 minúty).");
  }
  const balance = await getPitchBalance(userId);
  if (!canUseLength(input.targetSeconds, balance)) {
    throw new PitchServiceError("limit_reached", "4-minútový pitch je v platenej verzii. Kúp si balík pitchov alebo nahraj kratší pitch.", 402);
  }
  if (!balance.canPitch) {
    throw new PitchServiceError(
      "limit_reached",
      `Využil si ${FREE_PITCHES} pitche zadarmo. Kúp si balík ${PITCH_PACK.credits} pitchov za ${formatEur(PITCH_PACK.priceCents)} a trénuj ďalej.`,
      402,
    );
  }

  const attempt = await insertPitchAttempt({
    user_id: userId,
    audience: input.audience,
    target_seconds: input.targetSeconds,
    focus: input.focus,
    with_camera: Boolean(input.vision?.length || input.coach),
    duration_ms: input.durationMs,
  });

  try {
    const body = input.vision?.length || input.coach ? { ...summarizeBody(input.vision ?? []), coach: input.coach ?? null } : null;

    let transcript: Awaited<ReturnType<typeof transcribeWithWords>> | null = null;
    try {
      if (input.audio.size > 0) transcript = await transcribeWithWords(input.audio, input.fileName, language);
    } catch (error) {
      const notConfigured = error instanceof TranscriptionError && error.code === "not_configured";
      if (!body) {
        await updatePitchAttempt(attempt.id, { status: "failed" });
        const message = notConfigured ? "Prepis reči nie je nakonfigurovaný (chýba OPENAI_API_KEY alebo MISTRAL_API_KEY)." : "Nahrávku sa nepodarilo prepísať. Skús to znova.";
        throw new PitchServiceError("transcription_failed", message, 503);
      }
      // pokus s kamerou sa dokončí aj bez prepisu: skóre z reči tela
      console.warn("[pitch] prepis zlyhal, vyhodnocujem len reč tela:", error instanceof TranscriptionError ? error.code : error);
    }
    if (transcript && !transcript.text.trim()) {
      if (!body) {
        await updatePitchAttempt(attempt.id, { status: "failed" });
        throw new PitchServiceError("transcription_failed", "V nahrávke sme nezachytili reč. Skús to znova bližšie k mikrofónu.");
      }
      // s kamerou dáme aspoň spätnú väzbu k reči tela
      console.warn("[pitch] v nahrávke nie je reč, vyhodnocujem len reč tela");
      transcript = null;
    }
    if (transcript) await recordUsage(userId, "transcription_seconds", Math.ceil(input.durationMs / 1000), null);

    const metrics = transcript ? buildMetrics({ text: transcript.text, words: transcript.words, durationMs: input.durationMs, language }) : null;

    let content = null;
    let score: number | null = null;
    let model: string | null = null;
    const llm = getLlmProvider();
    const outline = input.outline ?? null;
    // bez prepisu sa osnova porovnať nedá, uložíme ju aspoň na zobrazenie
    let outlineResult: OutlineResult | null = outline ? { version: 1, ...outline, check: null } : null;

    const contentTask = async () => {
      if (!llm || !transcript) return;
      try {
        const profile = await getProfile(userId);
        const result = await llm.generateStructured({
          purpose: "pitch_content",
          system: CONTENT_SYSTEM,
          messages: [
            {
              role: "user",
              content: buildContentPrompt({
                transcript: transcript.text,
                audience: input.audience,
                targetSeconds: input.targetSeconds,
                notes: profile?.pitch_notes ?? null,
                topic: outline?.topic || null,
                outline: outline?.points ?? null,
                language: LANGUAGE_INFO[language].adjective,
              }),
            },
          ],
          schema: contentScoreSchema,
          effort: "low",
          maxTokens: 3_000,
          speed: "interactive",
        });
        content = result.data;
        score = overallScore(result.data, input.audience);
        model = result.model;
        await recordUsage(userId, "exercise_evaluation", 1, null);
      } catch (error) {
        console.error("[pitch] obsahové skóre zlyhalo:", error instanceof LlmError ? error.code : error);
      }
    };

    const outlineTask = async () => {
      if (!outline || !transcript) return;
      // bez AI aspoň zhoda kľúčových slov
      outlineResult = outlineByKeywords(outline, transcript.text);
      if (!llm) return;
      try {
        const result = await llm.generateStructured({
          purpose: "pitch_outline",
          system: OUTLINE_SYSTEM,
          messages: [{ role: "user", content: buildOutlinePrompt({ outline, transcript: transcript.text, audience: input.audience, language: LANGUAGE_INFO[language].adjective }) }],
          schema: outlineCheckSchema,
          effort: "low",
          maxTokens: 3_000,
          speed: "interactive",
        });
        outlineResult = outlineFromCheck(outline, result.data, transcript.text);
      } catch (error) {
        console.error("[pitch] porovnanie s osnovou zlyhalo:", error instanceof LlmError ? error.code : error);
      }
    };

    await Promise.all([contentTask(), outlineTask()]);

    const patch = {
      status: "ready" as const,
      transcript: transcript ? transcript.text.slice(0, 20_000) : null,
      metrics,
      content,
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
