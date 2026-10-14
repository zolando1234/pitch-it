import { getPitchContext, savePitchContext } from "@/lib/db/pitch-context";
import { apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { pitchContextSchema } from "@/lib/pitch/context";
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

export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "context", RATE_LIMITS.pitchContext);
  if (limited) return limited;
  const body = await parseJson(request, pitchContextSchema);
  if (body instanceof Response) return body;
  try {
    await savePitchContext(user.id, body);
    return apiOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "context.save");
  }
}
