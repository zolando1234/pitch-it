import { getPitchContext, savePitchContext } from "@/lib/db/pitch-context";
import { apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { summarizeContext } from "@/lib/pitch/context-summary";
import { pitchContextSchema, summaryIsCurrent, type PitchContext } from "@/lib/pitch/context";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

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
      next.summary = next.documents.length ? await summarizeContext(next) : "";
      next.summary_of = next.documents.map((d) => d.id);
    }
    await savePitchContext(user.id, next);
    return apiOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "context.save");
  }
}
