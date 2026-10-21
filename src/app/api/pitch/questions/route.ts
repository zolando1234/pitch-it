import { z } from "zod";
import { getLlmProvider } from "@/lib/ai/llm/anthropic";
import { LlmError } from "@/lib/ai/llm/types";
import { getPitchContext } from "@/lib/db/pitch-context";
import { apiError, apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { contextForPrompt } from "@/lib/pitch/context";
import { LANGUAGE_INFO, PITCH_LANGUAGES } from "@/lib/pitch/language";
import { buildQuestionsPrompt, CLIENT_QUESTIONS_SYSTEM, QA_MAX_QUESTIONS, qaMaxQuestionsFor, QUESTIONS_SYSTEM, questionsSchema } from "@/lib/pitch/qa";
import { MAX_SEGMENTS, mergeSegments } from "@/lib/pitch/segment-merge";
import { loadSegments } from "@/lib/pitch/segments";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const maxDuration = 60;

const bodySchema = z.object({
  count: z.number().int().min(1).max(QA_MAX_QUESTIONS),
  /** dĺžka prejavu; určuje, koľko otázok Q&A sa smie položiť (otázky klienta majú vlastný plán) */
  durationMs: z.number().int().min(0).max(4 * 60 * 60 * 1000).optional(),
  language: z.enum(PITCH_LANGUAGES),
  draftId: z.uuid().nullable(),
  segments: z.number().int().min(0).max(MAX_SEGMENTS),
  topic: z.string().max(2_000).nullable(),
  outline: z.array(z.string().max(300)).max(20).nullable(),
  /** stretnutie s klientom: otázka počas výkladu */
  mode: z.enum(["public", "client"]).optional(),
  asked: z.array(z.string().max(300)).max(10).optional(),
});

/** Otázky do Q&A po prejave: z podkladov, témy a toho, čo už bolo prepísané. */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "pitch-questions", RATE_LIMITS.pitchQuestions);
  if (limited) return limited;
  const body = await parseJson(request, bodySchema);
  if (body instanceof Response) return body;
  const llm = getLlmProvider();
  if (!llm) return apiError(503, "not_configured", "Otázky momentálne nevieme pripraviť.");
  try {
    const [context, segments] = await Promise.all([getPitchContext(user.id), body.draftId ? loadSegments(user.id, body.draftId, body.segments) : []]);
    const merged = segments.length ? mergeSegments(segments) : null;
    const transcript = merged?.text ?? null;
    // dĺžku od klienta overí prepis: koniec poslednej vety + minúta rezervy na ticho na konci
    const spokenMs = merged?.words.length ? (merged.words[merged.words.length - 1].end + 60) * 1000 : Infinity;
    const count = body.mode === "client" ? body.count : Math.min(body.count, qaMaxQuestionsFor(Math.min(body.durationMs ?? 0, spokenMs)));
    const result = await llm.generateStructured({
      purpose: "qa_questions",
      system: body.mode === "client" ? CLIENT_QUESTIONS_SYSTEM : QUESTIONS_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildQuestionsPrompt({
            count,
            language: LANGUAGE_INFO[body.language].english,
            topic: body.topic,
            outline: body.outline,
            context: contextForPrompt(context),
            transcript,
            seed: Math.floor(Math.random() * 1000),
            asked: body.asked,
            client: body.mode === "client",
          }),
        },
      ],
      schema: questionsSchema,
      effort: "low",
      maxTokens: 1_000,
      speed: "interactive",
    });
    return apiOk({ questions: result.data.questions.slice(0, count) });
  } catch (error) {
    if (error instanceof LlmError) {
      console.error("[qa] otázky zlyhali:", error.code);
      return apiError(503, "unavailable", "Otázky sa nepodarilo pripraviť.");
    }
    return handleRouteError(error, "pitch.questions");
  }
}
