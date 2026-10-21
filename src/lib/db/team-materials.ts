import "server-only";

import { check } from "@/lib/db/core";
import { getMembership, getOwnedTeam } from "@/lib/db/teams";
import { CRITERIA, DEFAULT_CRITERIA, EMPTY_MATERIALS, type Criterion, type TeamMaterials } from "@/lib/pitch/team-materials";
import { getAdminDb } from "@/lib/store/client";

/* Materiály tímu v úložisku. Zapisuje iba server po overení vlastníka tímu. */

export async function getTeamMaterials(teamId: string): Promise<TeamMaterials> {
  const { data, error } = await getAdminDb().from("team_materials").select("documents, summary, summary_of, criteria").eq("team_id", teamId).maybeSingle<Partial<TeamMaterials>>();
  check({ error }, "team_materials.get");
  if (!data) return EMPTY_MATERIALS;
  const criteria = Array.isArray(data.criteria) ? (data.criteria.filter((c): c is Criterion => (CRITERIA as readonly string[]).includes(c as string))) : DEFAULT_CRITERIA;
  return {
    documents: Array.isArray(data.documents) ? data.documents : [],
    summary: data.summary ?? "",
    summary_of: Array.isArray(data.summary_of) ? data.summary_of : [],
    criteria,
  };
}

export async function saveTeamMaterials(teamId: string, materials: TeamMaterials): Promise<void> {
  const { error } = await getAdminDb().from("team_materials").upsert({ team_id: teamId, ...materials }, { onConflict: "team_id" });
  check({ error }, "team_materials.save");
}

/** Hodnotiť prejavy podľa materiálov tímu? Predvolene áno; človek to môže vypnúť. */
export async function getUseTeamMaterials(userId: string): Promise<boolean> {
  const { data, error } = await getAdminDb().from("team_prefs").select("use_materials").eq("user_id", userId).maybeSingle<{ use_materials: boolean }>();
  check({ error }, "team_prefs.get");
  return data?.use_materials !== false;
}

export async function setUseTeamMaterials(userId: string, use: boolean): Promise<void> {
  const { error } = await getAdminDb().from("team_prefs").upsert({ user_id: userId, use_materials: use }, { onConflict: "user_id" });
  check({ error }, "team_prefs.save");
}

/** Materiály tímu, do ktorého človek patrí (člen alebo vlastník), bez ohľadu na jeho voľbu; null, ak tím nič nenahral. */
export async function getAvailableTeamMaterials(userId: string): Promise<TeamMaterials | null> {
  const membership = await getMembership(userId);
  const teamId = membership?.team.id ?? (await getOwnedTeam(userId))?.id;
  if (!teamId) return null;
  const materials = await getTeamMaterials(teamId);
  return materials.documents.some((d) => d.text.trim()) ? materials : null;
}

/** Materiály, podľa ktorých sa hodnotia prejavy človeka: tímové, ak ich tím má a človek ich nevypol. */
export async function getTeamMaterialsForUser(userId: string): Promise<TeamMaterials | null> {
  const materials = await getAvailableTeamMaterials(userId);
  if (!materials) return null;
  return (await getUseTeamMaterials(userId)) ? materials : null;
}
