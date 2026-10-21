import { getOwnedTeam } from "@/lib/db/teams";
import { getTeamMaterials, saveTeamMaterials } from "@/lib/db/team-materials";
import { apiError, apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { summaryIsCurrent } from "@/lib/pitch/context";
import { summarizeContext } from "@/lib/pitch/context-summary";
import { materialsAsContext, teamMaterialsSchema, type TeamMaterials } from "@/lib/pitch/team-materials";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const maxDuration = 60;

/** Materiály tímu uloží vlastník tímu (text z dokumentov sa vytiahne v prehliadači). */
export async function PUT(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "team-materials", RATE_LIMITS.pitchContext);
  if (limited) return limited;
  const body = await parseJson(request, teamMaterialsSchema);
  if (body instanceof Response) return body;
  try {
    const team = await getOwnedTeam(user.id);
    if (!team) return apiError(403, "forbidden", "Materiály tímu spravuje vlastník tímu.");
    const previous = await getTeamMaterials(team.id);
    const next: TeamMaterials = { ...body, summary: previous.summary, summary_of: previous.summary_of };
    // výťah faktov sa robí len pri zmene dokumentov
    if (!summaryIsCurrent(materialsAsContext(next))) {
      next.summary = next.documents.length ? await summarizeContext(materialsAsContext(next)) : "";
      next.summary_of = next.documents.map((d) => d.id);
    }
    await saveTeamMaterials(team.id, next);
    return apiOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "team.materials.save");
  }
}
