import { getPitchContext, savePitchContext } from "@/lib/db/pitch-context";
import { apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { getLlmProvider } from "@/lib/ai/llm/anthropic";
import { LlmError } from "@/lib/ai/llm/types";
import { documentsForSummary, pitchContextSchema, SUMMARY_MAX, SUMMARY_SYSTEM, summaryIsCurrent, summarySchema, type PitchContext } from "@/lib/pitch/context";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Krátky výťah faktov z dokumentov; pri chybe prázdny (prompty potom vezmú začiatok textov). */
async function summarize(context: PitchContext): Promise<string> {
  const llm = getLlmProvider();
  if (!llm) return "";
  try {
    const result = await llm.generateStructured({
      purpose: "context_summary",
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: documentsForSummary(context.documents) }],
      schema: summarySchema,
      effort: "low",
      maxTokens: 800,
      speed: "interactive",
    });
    return result.data.facts.slice(0, SUMMARY_MAX);
  } catch (error) {
    console.error("[kontext] výťah zlyhal:", error instanceof LlmError ? error.code : error);
    return "";
  }
}

/** Podklady k prejavu (text o firme a text z dokumentov). */
export async function GET() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  try {
    return apiOk({ context: (await getPitchContext(user.id)) ?? { about: "", documents: [] } });
  } catch (error) {
    return handleRouteError(error, "context.get");
  }
}

export const maxDuration = 60;

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "context", RATE_LIMITS.pitchContext);
  if (limited) return limited;
  const body = await parseJson(request, pitchContextSchema);
  if (body instanceof Response) return body;
  try {
    const previous = await getPitchContext(user.id);
    const next: PitchContext = { ...body, summary: previous?.summary ?? "", summary_of: previous?.summary_of ?? [] };
    // výťah faktov sa robí len pri zmene dokumentov (raz na nahraný dokument), nie pri každom hodnotení
    if (!summaryIsCurrent(next)) {
      next.summary = next.documents.length ? await summarize(next) : "";
      next.summary_of = next.documents.map((d) => d.id);
    }
    await savePitchContext(user.id, next);
    return apiOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "context.save");
  }
}
