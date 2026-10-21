import { z } from "zod";
import { setUseTeamMaterials } from "@/lib/db/team-materials";
import { apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Člen tímu zapne alebo vypne hodnotenie podľa materiálov tímu (vlastné podklady ostávajú). */
export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "team-prefs", RATE_LIMITS.pitchContext);
  if (limited) return limited;
  const body = await parseJson(request, z.object({ use: z.boolean() }));
  if (body instanceof Response) return body;
  try {
    await setUseTeamMaterials(user.id, body.use);
    return apiOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "team.prefs.save");
  }
}
