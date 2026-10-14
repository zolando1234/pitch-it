import { z } from "zod";
import { getLlmProvider } from "@/lib/ai/llm/anthropic";
import { LlmError } from "@/lib/ai/llm/types";
import { getPitchAttempt, updatePitchAttempt } from "@/lib/db/pitch";
import { getPitchContext } from "@/lib/db/pitch-context";
import { apiError, apiOk, handleRouteError, isUuid, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { parseLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { contextForPrompt } from "@/lib/pitch/context";
import { LANGUAGE_INFO, parseLanguage } from "@/lib/pitch/language";
import { ANSWERS_SYSTEM, answerScoreSchema, buildAnswersPrompt, buildQaResult, MAX_ANSWERS, QA_ANSWER_MAX_MS, type AnswerScore } from "@/lib/pitch/qa";
import { MAX_SEGMENTS, mergeSegments } from "@/lib/pitch/segment-merge";
import { dropSegments, loadSegments } from "@/lib/pitch/segments";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const maxDuration = 60;

const bodySchema = z.object({
  uiLocale: z.enum(["sk", "en"]).nullable(),
  answers: z
    .array(
      z.object({
        question: z.string().min(1).max(300),
        draftId: z.uuid().nullable(),
        segments: z.number().int().min(0).max(MAX_SEGMENTS),
        durationMs: z.number().int().min(0).max(QA_ANSWER_MAX_MS + 10_000),
      }),
    )
    .min(1)
    .max(MAX_ANSWERS),
});

/** Vyhodnotenie Q&A po prejave: odpovede (prepísané úseky) → skóre a rady ku každej. */
export async function POST(request: Request, ctx: RouteContext<"/api/pitch/[attemptId]/qa">) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "pitch-qa", RATE_LIMITS.pitchQuestions);
  if (limited) return limited;
  const { attemptId } = await ctx.params;
  if (!isUuid(attemptId)) return apiError(404, "not_found", "Pokus neexistuje.");
  const body = await parseJson(request, bodySchema);
  if (body instanceof Response) return body;
  try {
    const attempt = await getPitchAttempt(attemptId);
    if (!attempt || attempt.user_id !== user.id) return apiError(404, "not_found", "Pokus neexistuje.");
    const language = parseLanguage(attempt.language);
    const ui = parseLocale(body.uiLocale) ?? (await getLocale());

    const answers = await Promise.all(
      body.answers.map(async (a) => {
        const segments = a.draftId ? await loadSegments(user.id, a.draftId, a.segments) : [];
        return { question: a.question, transcript: mergeSegments(segments).text, durationMs: a.durationMs };
      }),
    );

    let scores: AnswerScore | null = null;
    const llm = getLlmProvider();
    if (llm && answers.some((a) => a.transcript.trim())) {
      try {
        const context = await getPitchContext(user.id);
        const result = await llm.generateStructured({
          purpose: "qa_evaluation",
          system: ANSWERS_SYSTEM,
          messages: [{ role: "user", content: buildAnswersPrompt({ answers, language: LANGUAGE_INFO[language].english, feedbackLocale: ui, context: contextForPrompt(context) }) }],
          schema: answerScoreSchema,
          effort: "low",
          maxTokens: 3_500,
          speed: "interactive",
        });
        scores = result.data;
      } catch (error) {
        console.error("[qa] hodnotenie zlyhalo:", error instanceof LlmError ? error.code : error);
      }
    }

    const qa = buildQaResult({ language, answers, scores });
    await updatePitchAttempt(attemptId, { qa: qa as unknown as Record<string, unknown> });
    await Promise.all(body.answers.map((a) => (a.draftId ? dropSegments(user.id, a.draftId, a.segments).catch(() => {}) : null)));
    return apiOk({ qa });
  } catch (error) {
    return handleRouteError(error, "pitch.qa");
  }
}
