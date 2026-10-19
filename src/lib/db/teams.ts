import "server-only";

import { cache } from "react";
import { check } from "@/lib/db/core";
import type { PitchAttemptRow } from "@/lib/db/types";
import { adminDb as getAdminDb } from "@/lib/store/db";

/*
  Firemné účty v úložisku. Zapisuje iba server (server actions tímu), preto admin klient;
  každá funkcia dostáva už overeného používateľa a kontroluje, že smie robiť, čo robí.
*/

export type TeamRow = { id: string; owner_id: string; name: string; created_at: string };
export type TeamInviteRow = { id: string; team_id: string; email: string; created_at: string; sent_at: string | null };
type MemberRow = { team_id: string; user_id: string; created_at: string };

export type TeamMembership = { team: TeamRow; ownerEmail: string | null };

export type TeamMemberView = {
  userId: string;
  email: string | null;
  name: string | null;
  joinedAt: string;
  pitchesThisMonth: number;
  pitchesTotal: number;
};

const db = () => getAdminDb();
const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function getTeam(teamId: string): Promise<TeamRow | null> {
  const { data, error } = await db().from("teams").select("*").eq("id", teamId).maybeSingle<TeamRow>();
  check({ error }, "teams.get");
  return data;
}

export async function getOwnedTeam(userId: string): Promise<TeamRow | null> {
  const { data, error } = await db().from("teams").select("*").eq("owner_id", userId).maybeSingle<TeamRow>();
  check({ error }, "teams.owned");
  return data;
}

async function emailOf(userId: string): Promise<string | null> {
  const { data } = await db().from("auth_users").select("email").eq("id", userId).maybeSingle<{ email: string }>();
  return data?.email ?? null;
}

/** Tím, v ktorom je používateľ členom (nie vlastníkom). Raz za požiadavku. */
export const getMembership = cache(async (userId: string): Promise<TeamMembership | null> => {
  const { data, error } = await db().from("team_members").select("*").eq("user_id", userId).maybeSingle<MemberRow>();
  check({ error }, "team_members.get");
  if (!data) return null;
  const team = await getTeam(data.team_id);
  if (!team) return null;
  return { team, ownerEmail: await emailOf(team.owner_id) };
});

/** Kto platí pitche: vlastník tímu pre člena, inak používateľ sám. */
export async function billingUserId(userId: string): Promise<string> {
  return (await getMembership(userId))?.team.owner_id ?? userId;
}

export type CreateTeamResult = { ok: true; team: TeamRow } | { ok: false; reason: "member_elsewhere" | "exists" };

export async function createTeam(ownerId: string, name: string): Promise<CreateTeamResult> {
  if (await getMembership(ownerId)) return { ok: false, reason: "member_elsewhere" };
  const { data, error } = await db().from("teams").insert({ owner_id: ownerId, name }).select("*").single<TeamRow>();
  if (error?.code === "23505") return { ok: false, reason: "exists" };
  check({ error }, "teams.create");
  return { ok: true, team: data as TeamRow };
}

export async function renameTeam(teamId: string, name: string): Promise<void> {
  const { error } = await db().from("teams").update({ name }).eq("id", teamId);
  check({ error }, "teams.rename");
}

/** Zruší tím: členovia aj pozvánky zmiznú (kaskáda), účty členov ostanú. */
export async function deleteTeam(teamId: string): Promise<void> {
  const { error } = await db().from("teams").delete().eq("id", teamId);
  check({ error }, "teams.delete");
}

const monthStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

export async function listTeamMembers(teamId: string, now = new Date()): Promise<TeamMemberView[]> {
  const { data, error } = await db().from("team_members").select("*").eq("team_id", teamId);
  check({ error }, "team_members.list");
  const since = monthStart(now);
  const members = await Promise.all(
    ((data ?? []) as MemberRow[]).map(async (m) => {
      const [account, profile, attempts] = await Promise.all([
        db().from("auth_users").select("email").eq("id", m.user_id).maybeSingle<{ email: string }>(),
        db().from("profiles").select("display_name").eq("id", m.user_id).maybeSingle<{ display_name: string | null }>(),
        db().from("pitch_attempts").select("created_at, status").eq("user_id", m.user_id),
      ]);
      const done = ((attempts.data ?? []) as Array<{ created_at: string; status: string }>).filter((a) => a.status === "ready");
      return {
        userId: m.user_id,
        email: account.data?.email ?? null,
        name: profile.data?.display_name ?? null,
        joinedAt: m.created_at,
        pitchesThisMonth: done.filter((a) => a.created_at >= since).length,
        pitchesTotal: done.length,
      };
    }),
  );
  return members.sort((a, b) => a.joinedAt.localeCompare(b.joinedAt));
}

/** Počet členov a čakajúcich pozvánok (bez načítania profilov). */
export async function teamHeadcount(teamId: string): Promise<{ members: number; invites: number }> {
  const [members, invites] = await Promise.all([
    db().from("team_members").select("user_id").eq("team_id", teamId),
    db().from("team_invites").select("id").eq("team_id", teamId),
  ]);
  check({ error: members.error }, "team_members.count");
  check({ error: invites.error }, "team_invites.count");
  return { members: (members.data ?? []).length, invites: (invites.data ?? []).length };
}

export async function listInvites(teamId: string): Promise<TeamInviteRow[]> {
  const { data, error } = await db().from("team_invites").select("*").eq("team_id", teamId);
  check({ error }, "team_invites.list");
  return ((data ?? []) as TeamInviteRow[]).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function getInvite(inviteId: string): Promise<TeamInviteRow | null> {
  const { data, error } = await db().from("team_invites").select("*").eq("id", inviteId).maybeSingle<TeamInviteRow>();
  check({ error }, "team_invites.get");
  return data;
}

/** Vytvorí pozvánky; e-mail, ktorý už pozvánku má, preskočí. */
export async function createInvites(teamId: string, emails: string[]): Promise<TeamInviteRow[]> {
  const created: TeamInviteRow[] = [];
  for (const email of emails) {
    const { data, error } = await db().from("team_invites").insert({ team_id: teamId, email: normalizeEmail(email) }).select("*").single<TeamInviteRow>();
    if (error?.code === "23505") continue;
    check({ error }, "team_invites.create");
    created.push(data as TeamInviteRow);
  }
  return created;
}

export async function markInviteSent(inviteId: string, at = new Date()): Promise<void> {
  const { error } = await db().from("team_invites").update({ sent_at: at.toISOString() }).eq("id", inviteId);
  check({ error }, "team_invites.sent");
}

export async function deleteInvite(teamId: string, inviteId: string): Promise<void> {
  const { error } = await db().from("team_invites").delete().eq("id", inviteId).eq("team_id", teamId);
  check({ error }, "team_invites.delete");
}

export async function removeMember(teamId: string, userId: string): Promise<void> {
  const { error } = await db().from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
  check({ error }, "team_members.remove");
}

/** Čakajúce pozvánky pre e-mail (aby ich človek videl aj bez odkazu z e-mailu). */
export async function invitesForEmail(email: string): Promise<Array<{ invite: TeamInviteRow; team: TeamRow; ownerEmail: string | null }>> {
  const { data, error } = await db().from("team_invites").select("*").eq("email", normalizeEmail(email));
  check({ error }, "team_invites.for_email");
  const rows = await Promise.all(
    ((data ?? []) as TeamInviteRow[]).map(async (invite) => {
      const team = await getTeam(invite.team_id);
      return team ? { invite, team, ownerEmail: await emailOf(team.owner_id) } : null;
    }),
  );
  return rows.filter((r) => r !== null);
}

export type AcceptResult =
  | { ok: true; team: TeamRow }
  | { ok: false; reason: "invalid" | "wrong_email" | "own_team" | "owner_elsewhere" | "other_team" };

/** Prijme pozvánku pre prihláseného používateľa. E-mail účtu sa musí zhodovať s pozvaným. */
export async function acceptInvite(inviteId: string, user: { id: string; email: string | null }): Promise<AcceptResult> {
  const invite = await getInvite(inviteId);
  const team = invite ? await getTeam(invite.team_id) : null;
  if (!invite || !team) return { ok: false, reason: "invalid" };
  if (!user.email || normalizeEmail(user.email) !== invite.email) return { ok: false, reason: "wrong_email" };
  if (team.owner_id === user.id) return { ok: false, reason: "own_team" };
  if (await getOwnedTeam(user.id)) return { ok: false, reason: "owner_elsewhere" };
  const membership = await getMembership(user.id);
  if (membership && membership.team.id !== team.id) return { ok: false, reason: "other_team" };
  if (!membership) {
    const { error } = await db().from("team_members").insert({ team_id: team.id, user_id: user.id });
    if (error?.code === "23505") return { ok: false, reason: "other_team" };
    check({ error }, "team_members.add");
  }
  await deleteInvite(team.id, invite.id);
  return { ok: true, team };
}

/*
  Progres členov pre vlastníka tímu. Čítajú sa iba stĺpce potrebné na skóre a počty:
  prepis ani audio sa vlastníkovi nikdy nenačítajú.
*/
const PROGRESS_COLUMNS = "id, user_id, created_at, status, mode, target_seconds, duration_ms, language, metrics, content_score, body, outline, qa";

/** Vyhodnotené pokusy člena; prázdne, ak človek nie je členom daného tímu. */
export async function listMemberAttempts(teamId: string, memberId: string, limit = 200): Promise<PitchAttemptRow[]> {
  const { data: member } = await db().from("team_members").select("*").eq("team_id", teamId).eq("user_id", memberId).maybeSingle<MemberRow>();
  if (!member) return [];
  const { data, error } = await db().from("pitch_attempts").select(PROGRESS_COLUMNS).eq("user_id", memberId).order("created_at", { ascending: false }).limit(limit);
  check({ error }, "team.member_attempts");
  return ((data ?? []) as unknown as PitchAttemptRow[]).filter((a) => a.status === "ready");
}

/** Pokusy všetkých členov tímu podľa používateľa. */
export async function listTeamAttempts(teamId: string): Promise<Map<string, PitchAttemptRow[]>> {
  const { data: members, error } = await db().from("team_members").select("*").eq("team_id", teamId);
  check({ error }, "team.members");
  const result = new Map<string, PitchAttemptRow[]>();
  await Promise.all(
    ((members ?? []) as MemberRow[]).map(async (m) => result.set(m.user_id, await listMemberAttempts(teamId, m.user_id))),
  );
  return result;
}
