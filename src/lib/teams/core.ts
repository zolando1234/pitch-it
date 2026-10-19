import { z } from "zod";

/*
  Firemné účty: vlastník tímu platí pitche, pozvaní členovia sa len prihlásia a čerpajú
  z jeho peňaženky. Čisté funkcie (bez úložiska), testované.
*/

/** najviac členov v tíme (bez vlastníka), vrátane čakajúcich pozvánok */
export const TEAM_MAX_MEMBERS = 50;
/** najviac e-mailov v jednom odoslaní pozvánok */
export const INVITE_BATCH_MAX = 20;
/** platnosť odkazu v pozvánke */
export const INVITE_TTL_SECONDS = 14 * 24 * 60 * 60;
/** najskôr po koľkých minútach sa dá pozvánka poslať znova */
export const RESEND_COOLDOWN_MS = 2 * 60 * 1000;

export const teamNameSchema = z.string().trim().min(2, "Názov musí mať aspoň 2 znaky.").max(80, "Najviac 80 znakov.");

const emailSchema = z.email();

export type ParsedEmails = { valid: string[]; invalid: string[] };

/** E-maily z textového poľa (čiarky, bodkočiarky, medzery, nové riadky), malými písmenami a bez duplikátov. */
export function parseInviteEmails(input: string): ParsedEmails {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const raw of input.split(/[\s,;]+/)) {
    const email = raw.trim().replace(/^<|>$/g, "").toLowerCase();
    if (!email) continue;
    if (emailSchema.safeParse(email).success && email.length <= 254) {
      if (!valid.includes(email)) valid.push(email);
    } else if (!invalid.includes(email)) invalid.push(email);
  }
  return { valid, invalid };
}

export type InviteBlocker = "self" | "member" | "invited";

/** Koho netreba pozývať: seba, existujúcich členov a už pozvaných. */
export function inviteBlocker(email: string, ctx: { ownerEmail: string | null; memberEmails: string[]; invitedEmails: string[] }): InviteBlocker | null {
  if (ctx.ownerEmail && email === ctx.ownerEmail.toLowerCase()) return "self";
  if (ctx.memberEmails.includes(email)) return "member";
  if (ctx.invitedEmails.includes(email)) return "invited";
  return null;
}

/**
 * Koľko ešte možno pozvať, aby tím neprekročil limit. Pri platenom pláne (paidSeats) aj počet
 * zaplatených účtov: vlastník + členovia + čakajúce pozvánky. Bez plánu trénujú členovia ako Free.
 */
export function seatsLeft(members: number, pendingInvites: number, paidSeats: number | null = null): number {
  const byLimit = TEAM_MAX_MEMBERS - members - pendingInvites;
  const byPaid = paidSeats === null ? byLimit : paidSeats - 1 - members - pendingInvites;
  return Math.max(0, Math.min(byLimit, byPaid));
}

/** Najmenej účtov, za ktoré musí vlastník platiť: on sám, členovia a čakajúce pozvánky. */
export function minPaidSeats(members: number, pendingInvites: number): number {
  return 1 + members + pendingInvites;
}

/** Text e-mailovej pozvánky. */
export function inviteEmail(input: { teamName: string; inviter: string; link: string; locale: "sk" | "en" }): { subject: string; text: string } {
  if (input.locale === "en") {
    return {
      subject: `${input.inviter} invited you to PitchIt (${input.teamName})`,
      text: `Hi,\n\n${input.inviter} invited you to the team "${input.teamName}" on PitchIt, an AI coach for presentations, pitches and client meetings.\nYour training is paid for by the team and you get 10 free recording minutes of your own, you only need to sign in. The team owner sees how many times you try the training, the length, topic and scores, but never your recordings or transcripts.\n\nAccept the invitation (the link is valid for 14 days):\n${input.link}\n\nIf you don't know this person, just ignore this email.\n\nPitchIt`,
    };
  }
  return {
    subject: `${input.inviter} ťa pozýva do PitchIt (${input.teamName})`,
    text: `Ahoj,\n\n${input.inviter} ťa pozýva do tímu „${input.teamName}“ v PitchIt, AI kouča pre prezentácie, pitche a stretnutia s klientmi.\nTréning ti platí tím a máš 10 minút nahrávania zadarmo len pre seba, stačí sa prihlásiť. Vlastník tímu uvidí, koľkokrát si tréning vyskúšaš, dĺžku, tému a skóre, nikdy však nahrávky ani prepisy.\n\nPrijať pozvánku (odkaz platí 14 dní):\n${input.link}\n\nAk tohto človeka nepoznáš, správu pokojne ignoruj.\n\nPitchIt`,
  };
}
