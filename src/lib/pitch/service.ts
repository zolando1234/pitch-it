import "server-only";

import { getLlmProvider } from "@/lib/ai/llm/anthropic";
import { LlmError } from "@/lib/ai/llm/types";
import { TranscriptionError, transcribeWithWords } from "@/lib/ai/transcription";
import type { VisionSample } from "@/lib/analytics/vision/types";
import type { StoredCoach } from "@/lib/coach/stored";
import { checkEntitlement } from "@/lib/billing/plans";
import { getProfile } from "@/lib/db/profile";
import { insertPitchAttempt, updatePitchAttempt } from "@/lib/db/pitch";
import type { PitchAttemptRow } from "@/lib/db/types";
import { getBillingContext, recordUsage } from "@/lib/db/usage";
import { trackEvent } from "@/lib/events/track";
import { summarizeBody } from "@/lib/pitch/body";
import { buildContentPrompt, CONTENT_SYSTEM, contentScoreSchema, overallScore } from "@/lib/pitch/content";
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

/** Najviac ~3,5 minúty audia (webm/opus pri ~128 kb/s). */
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
};

/**
 * Celá analýza pitchu: prepis so slovnými časmi → tempo, pauzy, vypĺňacie slová →
 * obsahové skóre (LLM) → reč tela. Nahrávka sa neukladá, pošle sa na prepis a zahodí sa.
 */
export async function analyzePitch(userId: string, input: PitchInput): Promise<PitchAttemptRow> {
  const hasBody = Boolean(input.vision?.length || input.coach);
  // pokus s kamerou má reč tela aj bez zvuku, prázdny zvuk ho preto nezastaví
  if ((input.audio.size === 0 && !hasBody) || input.audio.size > MAX_PITCH_AUDIO_BYTES) {
    throw new PitchServiceError("invalid", "Nahrávka je prázdna alebo príliš dlhá (najviac 3 minúty).");
  }
  const billing = await getBillingContext(userId);
  if (!checkEntitlement(billing.plan, billing.usage, "exercise_evaluation").allowed) {
    throw new PitchServiceError("limit_reached", "Na tento mesiac si vyčerpal analýzy vo free pláne. Prejdi na Pro alebo počkaj na ďalší mesiac.", 402);
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
      if (input.audio.size > 0) transcript = await transcribeWithWords(input.audio, input.fileName, "sk");
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

    const metrics = transcript ? buildMetrics({ text: transcript.text, words: transcript.words, durationMs: input.durationMs }) : null;

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
          messages: [{ role: "user", content: buildOutlinePrompt({ outline, transcript: transcript.text, audience: input.audience }) }],
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
      model,
    };
    await updatePitchAttempt(attempt.id, patch);
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
