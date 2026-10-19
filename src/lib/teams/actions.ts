"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { siteConfig } from "@/config/site";
import { endSession } from "@/lib/auth/accounts";
import { getCurrentUser, safeNextPath } from "@/lib/auth/session";
import { signToken } from "@/lib/auth/token";
import {
  acceptInvite,
  createInvites,
  createTeam,
  deleteInvite,
  deleteTeam,
  getInvite,
  getMembership,
  getOwnedTeam,
  listInvites,
  listTeamMembers,
  markInviteSent,
  removeMember,
  renameTeam,
  type TeamInviteRow,
  type TeamRow,
} from "@/lib/db/teams";
import { getPaidSeats } from "@/lib/db/pitch-wallet";
import { sendEmail } from "@/lib/email/send";
import { getLocale } from "@/lib/i18n/server";
import type { FormState } from "@/lib/projects/actions";
import { consumeRateLimit, RATE_LIMITS } from "@/lib/security/rate-limit";
import { getAdminDb } from "@/lib/store/client";
import {
  INVITE_BATCH_MAX,
  INVITE_TTL_SECONDS,
  inviteBlocker,
  inviteEmail,
  parseInviteEmails,
  RESEND_COOLDOWN_MS,
  seatsLeft,
  TEAM_MAX_MEMBERS,
  teamNameSchema,
} from "@/lib/teams/core";

/*
  Správa firemného tímu: vlastník zakladá tím, pozýva e-mailom a odoberá členov;
  člen pozvánku prijme alebo z tímu odíde. Každá akcia overuje používateľa a jeho rolu.
*/

async function texts() {
  const en = (await getLocale()) === "en";
  return { en, L: (sk: string, enText: string) => (en ? enText : sk) };
}

const signedOut = (L: (sk: string, en: string) => string): FormState => ({ status: "error", message: L("Relácia vypršala. Prihlás sa znova.", "Your session expired. Sign in again.") });

const done = (message: string): FormState => {
  revalidatePath("/app", "layout");
  return { status: "success", message };
};

/** Odkaz na prijatie pozvánky (podpísaný, platí 14 dní; zrušená pozvánka ho zneplatní). */
function inviteLink(invite: TeamInviteRow): string {
  const token = signToken("team-invite", { iid: invite.id }, INVITE_TTL_SECONDS);
  return `${siteConfig.url}/pozvanka?t=${encodeURIComponent(token)}`;
}

async function inviterName(userId: string, fallback: string | null): Promise<string> {
  const { data } = await getAdminDb().from("profiles").select("display_name").eq("id", userId).maybeSingle<{ display_name: string | null }>();
  return data?.display_name?.trim() || fallback || "PitchIt";
}

async function sendInvite(team: TeamRow, invite: TeamInviteRow, inviter: string, locale: "sk" | "en"): Promise<boolean> {
  const ok = await sendEmail({ to: invite.email, ...inviteEmail({ teamName: team.name, inviter, link: inviteLink(invite), locale }) });
  if (ok) await markInviteSent(invite.id);
  return ok;
}

export async function createTeamAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const parsed = teamNameSchema.safeParse(formData.get("name") ?? "");
  if (!parsed.success) return { status: "error", message: L("Skontroluj názov tímu.", "Check the team name."), fieldErrors: { name: L("Názov musí mať 2 až 80 znakov.", "The name must have 2 to 80 characters.") } };
  try {
    const result = await createTeam(user.id, parsed.data);
    if (!result.ok) {
      return {
        status: "error",
        message:
          result.reason === "member_elsewhere"
            ? L("Si členom iného tímu. Najprv z neho odíď.", "You're a member of another team. Leave it first.")
            : L("Tím už máš.", "You already have a team."),
      };
    }
  } catch (error) {
    console.error("[team] create:", error instanceof Error ? error.message : error);
    return { status: "error", message: L("Tím sa nepodarilo založiť.", "The team could not be created.") };
  }
  return done(L("Tím je založený. Teraz pozvi kolegov.", "Your team is ready. Now invite your colleagues."));
}

export async function renameTeamAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const team = await getOwnedTeam(user.id);
  if (!team) return { status: "error", message: L("Tím nemáš.", "You don't have a team.") };
  const parsed = teamNameSchema.safeParse(formData.get("name") ?? "");
  if (!parsed.success) return { status: "error", message: L("Názov musí mať 2 až 80 znakov.", "The name must have 2 to 80 characters.") };
  await renameTeam(team.id, parsed.data);
  return done(L("Názov je uložený.", "The name is saved."));
}

export async function inviteMembersAction(_previous: FormState, formData: FormData): Promise<FormState> {
  const { en, L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const team = await getOwnedTeam(user.id);
  if (!team) return { status: "error", message: L("Najprv založ tím.", "Create a team first.") };

  const raw = String(formData.get("emails") ?? "");
  const { valid, invalid } = parseInviteEmails(raw);
  if (invalid.length) {
    return { status: "error", message: L(`Tieto e-maily nevyzerajú správne: ${invalid.join(", ")}`, `These emails don't look right: ${invalid.join(", ")}`), fieldErrors: { emails: invalid.join(", ") } };
  }
  if (!valid.length) return { status: "error", message: L("Zadaj aspoň jeden e-mail.", "Enter at least one email."), fieldErrors: { emails: L("Zadaj e-mail.", "Enter an email.") } };
  if (valid.length > INVITE_BATCH_MAX) return { status: "error", message: L(`Naraz najviac ${INVITE_BATCH_MAX} e-mailov.`, `At most ${INVITE_BATCH_MAX} emails at once.`) };
  if (!consumeRateLimit(`team-invite:${user.id}`, RATE_LIMITS.teamInvite)) {
    return { status: "error", message: L("Poslal si veľa pozvánok. Skús to znova o hodinu.", "You've sent a lot of invitations. Try again in an hour.") };
  }

  try {
    const [members, invites, paidSeats] = await Promise.all([listTeamMembers(team.id), listInvites(team.id), getPaidSeats(user.id)]);
    const ctx = { ownerEmail: user.email, memberEmails: members.map((m) => (m.email ?? "").toLowerCase()), invitedEmails: invites.map((i) => i.email) };
    const fresh = valid.filter((email) => !inviteBlocker(email, ctx));
    const skipped = valid.length - fresh.length;
    const seats = seatsLeft(members.length, invites.length, paidSeats);
    if (fresh.length > seats) {
      if (paidSeats !== null && seats < TEAM_MAX_MEMBERS - members.length - invites.length) {
        return {
          status: "error",
          message: L(
            `Plán máš zaplatený za ${paidSeats} ${paidSeats === 1 ? "účet" : paidSeats < 5 ? "účty" : "účtov"}, pozvať môžeš ešte ${seats}. Pridaj účty v časti Plán tímu.`,
            `Your plan covers ${paidSeats} ${paidSeats === 1 ? "account" : "accounts"}, you can invite ${seats} more. Add accounts under Team plan.`,
          ),
        };
      }
      return { status: "error", message: L(`Do tímu môžeš pozvať ešte ${seats} ľudí.`, `You can invite ${seats} more people to the team.`) };
    }
    const created = await createInvites(team.id, fresh);
    const inviter = await inviterName(user.id, user.email);
    const sent = await Promise.all(created.map((invite) => sendInvite(team, invite, inviter, en ? "en" : "sk")));
    const failed = sent.filter((ok) => !ok).length;
    const parts = [
      created.length ? L(`Pozvánky odoslané: ${created.length - failed}.`, `Invitations sent: ${created.length - failed}.`) : null,
      skipped ? L(`Preskočené (už člen alebo pozvaný): ${skipped}.`, `Skipped (already a member or invited): ${skipped}.`) : null,
      failed ? L(`Nepodarilo sa odoslať: ${failed}, skús „Poslať znova“.`, `Could not send: ${failed}, try “Send again”.`) : null,
    ].filter(Boolean);
    revalidatePath("/app/tim");
    return { status: failed ? "error" : "success", message: parts.join(" ") || L("Nikto nový na pozvanie.", "Nobody new to invite.") };
  } catch (error) {
    console.error("[team] invite:", error instanceof Error ? error.message : error);
    return { status: "error", message: L("Pozvánky sa nepodarilo odoslať.", "The invitations could not be sent.") };
  }
}

export async function resendInviteAction(inviteId: string): Promise<FormState> {
  const { en, L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const team = await getOwnedTeam(user.id);
  const invite = await getInvite(inviteId);
  if (!team || !invite || invite.team_id !== team.id) return { status: "error", message: L("Pozvánka už neexistuje.", "The invitation no longer exists.") };
  if (invite.sent_at && Date.now() - new Date(invite.sent_at).getTime() < RESEND_COOLDOWN_MS) {
    return { status: "error", message: L("Pozvánka práve odišla, skús to o pár minút.", "The invitation was just sent, try again in a few minutes.") };
  }
  if (!consumeRateLimit(`team-invite:${user.id}`, RATE_LIMITS.teamInvite)) {
    return { status: "error", message: L("Poslal si veľa pozvánok. Skús to znova o hodinu.", "You've sent a lot of invitations. Try again in an hour.") };
  }
  const ok = await sendInvite(team, invite, await inviterName(user.id, user.email), en ? "en" : "sk");
  if (!ok) return { status: "error", message: L("E-mail sa nepodarilo odoslať.", "The email could not be sent.") };
  revalidatePath("/app/tim");
  return { status: "success", message: L(`Pozvánka znova odoslaná na ${invite.email}.`, `Invitation sent again to ${invite.email}.`) };
}

export async function cancelInviteAction(inviteId: string): Promise<FormState> {
  const { L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const team = await getOwnedTeam(user.id);
  if (!team) return { status: "error", message: L("Tím nemáš.", "You don't have a team.") };
  await deleteInvite(team.id, inviteId);
  revalidatePath("/app/tim");
  return { status: "success", message: L("Pozvánka je zrušená.", "The invitation is cancelled.") };
}

export async function removeMemberAction(memberId: string): Promise<FormState> {
  const { L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const team = await getOwnedTeam(user.id);
  if (!team) return { status: "error", message: L("Tím nemáš.", "You don't have a team.") };
  await removeMember(team.id, memberId);
  return done(L("Člen je odobratý. Jeho účet aj tréningy ostávajú, tréning si už platí sám.", "The member is removed. Their account and sessions stay; they now pay for their own training."));
}

export async function leaveTeamAction(): Promise<FormState> {
  const { L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const membership = await getMembership(user.id);
  if (!membership) return { status: "error", message: L("Nie si v žiadnom tíme.", "You're not in a team.") };
  await removeMember(membership.team.id, user.id);
  return done(L("Odišiel si z tímu.", "You've left the team."));
}

export async function deleteTeamAction(): Promise<FormState> {
  const { L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  const team = await getOwnedTeam(user.id);
  if (!team) return { status: "error", message: L("Tím nemáš.", "You don't have a team.") };
  await deleteTeam(team.id);
  return done(L("Tím je zrušený. Účty členov ostávajú.", "The team is deleted. Members keep their accounts."));
}

/** Pozvánka prišla na iný e-mail: odhlási a vráti na pozvánku (tá ponúkne prihlásenie aj registráciu). */
export async function switchAccountAction(formData: FormData): Promise<void> {
  await endSession();
  redirect(safeNextPath(formData.get("next"), "/prihlasenie"));
}

/** Prijatie pozvánky (z odkazu v e-maile alebo zo stránky Tím). Po úspechu presmeruje do aplikácie. */
export async function acceptInviteAction(inviteId: string): Promise<FormState> {
  const { L } = await texts();
  const user = await getCurrentUser();
  if (!user) return signedOut(L);
  let result;
  try {
    result = await acceptInvite(inviteId, user);
  } catch (error) {
    console.error("[team] accept:", error instanceof Error ? error.message : error);
    return { status: "error", message: L("Pozvánku sa nepodarilo prijať. Skús to znova.", "The invitation could not be accepted. Try again.") };
  }
  if (!result.ok) {
    const messages: Record<typeof result.reason, string> = {
      invalid: L("Pozvánka už neplatí. Požiadaj o novú.", "This invitation is no longer valid. Ask for a new one."),
      wrong_email: L("Pozvánka je pre iný e-mail. Prihlás sa účtom, na ktorý prišla.", "This invitation is for a different email. Sign in with the account it was sent to."),
      own_team: L("Toto je tvoj vlastný tím.", "This is your own team."),
      owner_elsewhere: L("Vlastníš iný tím. Najprv ho zruš, potom sa môžeš pridať.", "You own another team. Delete it first, then you can join."),
      other_team: L("Už si v inom tíme. Najprv z neho odíď.", "You're already in another team. Leave it first."),
    };
    return { status: "error", message: messages[result.reason] };
  }
  revalidatePath("/app", "layout");
  redirect("/app/tim?pridany=1");
}
