import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TeamPlanPicker } from "@/components/billing/plan-picker";
import { ActionButton, CreateTeamForm, InviteForm, RenameTeamForm } from "@/components/team/team-forms";
import { buttonClasses } from "@/components/ui/button";
import { ConfirmAction } from "@/components/ui/confirm-action";
import { Notice } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { balanceLabel, teamBalanceLabel } from "@/lib/billing/pitch-pack";
import { activePlan, FREE_SECONDS, PRO_WEEKLY_SECONDS, TEAM_DISCOUNT_TIERS } from "@/lib/billing/pricing";
import { isStripeConfigured } from "@/lib/billing/stripe";
import { getPitchBalance } from "@/lib/db/pitch-wallet";
import { getMembership, getOwnedTeam, invitesForEmail, listInvites, listTeamAttempts, listTeamMembers } from "@/lib/db/teams";
import { getSubscription } from "@/lib/db/usage";
import { formatDate, formatNumber } from "@/lib/format";
import { getLocale } from "@/lib/i18n/server";
import { progressRows } from "@/lib/pitch/progress";
import {
  acceptInviteAction,
  cancelInviteAction,
  deleteTeamAction,
  leaveTeamAction,
  removeMemberAction,
  resendInviteAction,
} from "@/lib/teams/actions";
import { minPaidSeats, seatsLeft, TEAM_MAX_MEMBERS } from "@/lib/teams/core";
import { summarizeMember, teamTotals, type MemberSummary } from "@/lib/teams/progress";

// Stránka závisí od dát používateľa: navigácia smie počkať na server.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Team" : "Tím" };
}

function Card({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[18px] border border-line bg-panel/60 p-5 md:p-7">
      <h2 className="type-heading text-[1.2rem]">{title}</h2>
      {description ? <p className="mt-1.5 text-[14.5px] leading-relaxed text-mute">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line/70 bg-panel px-3.5 py-3">
      <dt className="text-[12px] font-semibold text-mute">{label}</dt>
      <dd className="mt-1 text-[1.4rem] font-extrabold leading-none text-paper">{value}</dd>
    </div>
  );
}

/** Pásma tímovej zľavy do textu, napr. „od 2 účtov −10 %, od 6 −13 %, od 11 −15 %“. */
function teamTiers(locale: "sk" | "en"): string {
  const tiers = [...TEAM_DISCOUNT_TIERS].reverse();
  return tiers
    .map((t, i) =>
      locale === "en" ? `${t.minSeats}+${i === 0 ? " accounts" : ""} −${t.percent}%` : `od ${t.minSeats}${i === 0 ? " účtov" : ""} −${t.percent} %`,
    )
    .join(", ");
}

export default async function TeamPage({ searchParams }: PageProps<"/app/tim">) {
  const user = await requireUser("/app/tim");
  const [params, locale, owned, membership, balance] = await Promise.all([
    searchParams,
    getLocale(),
    getOwnedTeam(user.id),
    getMembership(user.id),
    getPitchBalance(user.id),
  ]);
  const en = locale === "en";
  const L = (sk: string, enText: string) => (en ? enText : sk);
  const left = balanceLabel(balance, locale);
  const joined =
    params.pridany === "1" ? (
      <Notice tone="success" className="mb-6">
        {L("Si v tíme. Tréning ti odteraz platí tím.", "You're in the team. From now on the team pays for your training.")}
      </Notice>
    ) : null;

  // Člen tímu: iba informácia a odchod
  if (membership) {
    return (
      <>
        <PageHeader title={L("Môj tím", "My team")} description={L("Si členom firemného tímu.", "You're a member of a company team.")} />
        {joined}
        <Card title={membership.team.name}>
          <p className="text-[15px] leading-relaxed text-paper">
            {L("Tréning ti platí vlastník tímu", "Your training is paid for by the team owner")}
            {membership.ownerEmail ? ` (${membership.ownerEmail})` : ""}. {teamBalanceLabel(balance, locale)}
          </p>
          <p className="mt-2 text-[14px] text-faint">
            {L(
              "Vlastník tímu vidí, koľkokrát si tréning vyskúšal, dĺžku, tému a skóre. Nahrávky, prepisy ani podrobný report nevidí.",
              "The team owner sees how many times you've tried the training, the length, topic and scores. Recordings, transcripts and detailed reports stay private.",
            )}
          </p>
          <div className="mt-5">
            <ConfirmAction
              trigger={L("Odísť z tímu", "Leave the team")}
              title={L("Odísť z tímu?", "Leave the team?")}
              description={L("Tvoj účet aj tréningy ostanú, ďalší tréning si budeš platiť sám.", "Your account and sessions stay; you'll pay for further training yourself.")}
              confirmLabel={L("Odísť", "Leave")}
              pendingLabel={L("Odchádzam…", "Leaving…")}
              action={leaveTeamAction}
            />
          </div>
        </Card>
      </>
    );
  }

  // Bez tímu: pozvánky pre môj e-mail a založenie tímu
  if (!owned) {
    const invites = user.email ? await invitesForEmail(user.email) : [];
    return (
      <>
        <PageHeader
          title={L("Firemný tím", "Company team")}
          description={L(
            "Jeden účet platí tréning za celý tím. Pozvi kolegov e-mailom, oni sa len prihlásia a trénujú.",
            "One account pays for the whole team's training. Invite colleagues by email; they just sign in and train.",
          )}
        />
        {joined}
        <div className="grid gap-6">
          {invites.length ? (
            <Card title={L("Pozvánky pre teba", "Invitations for you")}>
              <ul className="divide-y divide-line/60">
                {invites.map(({ invite, team, ownerEmail }) => (
                  <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div>
                      <p className="font-medium text-paper">{team.name}</p>
                      {ownerEmail ? <p className="text-[13.5px] text-faint">{L(`Pozýva ${ownerEmail}`, `From ${ownerEmail}`)}</p> : null}
                    </div>
                    <ActionButton action={acceptInviteAction.bind(null, invite.id)} label={L("Prijať", "Accept")} pendingLabel={L("Prijímam…", "Accepting…")} variant="primary" />
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          <Card
            title={L("Založiť tím", "Create a team")}
            description={L(
              `Každý člen dostane ${FREE_SECONDS / 60} minút zadarmo, potom trénuje z tvojho plánu, ktorý zaplatíš za počet účtov (tímová zľava ${teamTiers("sk")}). Do tímu pozveš až ${TEAM_MAX_MEMBERS} ľudí.`,
              `Every member gets ${FREE_SECONDS / 60} free minutes, then trains on your plan, paid per account (team discount ${teamTiers("en")}). You can invite up to ${TEAM_MAX_MEMBERS} people.`,
            )}
          >
            <CreateTeamForm />
          </Card>
        </div>
      </>
    );
  }

  // Vlastník tímu
  const [members, invites, attemptsByMember, subscription] = await Promise.all([
    listTeamMembers(owned.id),
    listInvites(owned.id),
    listTeamAttempts(owned.id),
    getSubscription(user.id),
  ]);
  const plan = activePlan(subscription);
  const paidSeats = plan === "free" ? null : Math.max(1, subscription?.seats ?? 1);
  const seats = seatsLeft(members.length, invites.length, paidSeats);
  const accounts = minPaidSeats(members.length, invites.length);
  const stripe = isStripeConfigured();
  const summaries = new Map<string, MemberSummary>(
    members.map((m) => {
      const attempts = attemptsByMember.get(m.userId) ?? [];
      const durations = new Map(attempts.map((a) => [a.id, Math.round((a.duration_ms ?? a.target_seconds * 1000) / 1000)]));
      return [m.userId, summarizeMember(progressRows(attempts), durations)];
    }),
  );
  const totals = teamTotals([...summaries.values()]);

  return (
    <>
      <PageHeader
        title={owned.name}
        description={L(
          `Firemný tím: ${members.length} ${members.length === 1 ? "člen" : "členov"}, tento mesiac ${totals.thisMonth} prejavov. Tréning platíš ty.`,
          `Company team: ${members.length} ${members.length === 1 ? "member" : "members"}, ${totals.thisMonth} talks this month. You pay for the training.`,
        )}
      />
      {joined}
      <div className="grid gap-6">
        <Card
          title={L("Plán tímu", "Team plan")}
          description={L(
            `Každý člen má ${FREE_SECONDS / 60} minút zadarmo len pre seba, potom trénuje z tvojho plánu. Plán platíš za počet účtov (s tebou), tímová zľava ${teamTiers("sk")}. Pri Pro má tím spolu ${PRO_WEEKLY_SECONDS / 60} minút týždenne za každý účet.`,
            `Every member gets ${FREE_SECONDS / 60} free minutes of their own, then trains on your plan. You pay per account (including you), team discount ${teamTiers("en")}. On Pro the team shares ${PRO_WEEKLY_SECONDS / 60} minutes per week for each account.`,
          )}
        >
          <p className="text-[15px] text-paper">{left}</p>
          {paidSeats !== null ? (
            <p className={`mt-2 text-[14.5px] ${paidSeats < accounts ? "text-coral" : "text-mute"}`}>
              {L(
                `Zaplatené účty: ${paidSeats}, v tíme (s tebou a pozvánkami): ${accounts}.`,
                `Paid accounts: ${paidSeats}, in the team (with you and invitations): ${accounts}.`,
              )}
              {paidSeats < accounts ? ` ${L("Pridaj účty, aby si mohol pozývať ďalších.", "Add accounts to invite more people.")}` : ""}
            </p>
          ) : null}
          {stripe ? (
            <div className="mt-6">
              <TeamPlanPicker
                current={plan}
                currentInterval={plan === "free" ? null : (subscription?.interval ?? null)}
                currentSeats={paidSeats ?? 1}
                minSeats={accounts}
                paymentsEnabled={stripe}
              />
            </div>
          ) : (
            <p className="mt-2 text-sm text-marker">{L("Platby zatiaľ nie sú zapnuté.", "Payments are not enabled yet.")}</p>
          )}
          <Link href="/app/nastavenia#plan" className={`${buttonClasses({ variant: "secondary" })} mt-5`}>
            {L("Spravovať plán", "Manage plan")}
          </Link>
        </Card>

        <Card
          title={L("Pozvať kolegov", "Invite colleagues")}
          description={L(
            "Každému príde e-mail s odkazom. Prihlási sa (alebo zaregistruje) e-mailom, na ktorý prišla pozvánka, a je v tíme.",
            "Each person gets an email with a link. They sign in (or sign up) with the email the invitation was sent to and they're in.",
          )}
        >
          <InviteForm seats={seats} />
        </Card>

        <Card
          title={L(`Členovia (${members.length})`, `Members (${members.length})`)}
          description={
            members.length
              ? L(
                  "Koľkokrát si kto tréning skúsil a ako sa mu darí. Klikni na člena pre celý priebeh. Nahrávky ani prepisy nevidíš.",
                  "How many times each person tried the training and how they're doing. Click a member for the full history. You don't see recordings or transcripts.",
                )
              : undefined
          }
        >
          {members.length > 0 ? (
            <dl className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Tile label={L("Aktívni za 7 dní", "Active in 7 days")} value={`${totals.active7} / ${totals.members}`} />
              <Tile label={L("Pokusov spolu", "Attempts in total")} value={String(totals.attempts)} />
              <Tile label={L("Tento mesiac", "This month")} value={String(totals.thisMonth)} />
              <Tile label={L("Ešte nič nevyskúšali", "Haven't tried yet")} value={String(totals.neverTried)} />
            </dl>
          ) : null}
          {members.length === 0 ? (
            <p className="text-[14.5px] text-mute">{L("Zatiaľ nikto. Pozvi prvých kolegov vyššie.", "Nobody yet. Invite your first colleagues above.")}</p>
          ) : (
            <ul className="divide-y divide-line/60">
              {members.map((m) => {
                const sum = summaries.get(m.userId)!;
                const trend = sum.trend === "up" ? " ↑" : sum.trend === "down" ? " ↓" : sum.trend === "flat" ? " →" : "";
                return (
                  <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <Link href={`/app/tim/clen/${m.userId}`} className="group min-w-0 flex-1">
                      <p className="truncate font-medium text-paper group-hover:underline">{m.name || m.email}</p>
                      <p className="truncate text-[13.5px] text-faint">
                        {m.name && m.email ? `${m.email} · ` : ""}
                        {L(`od ${formatDate(new Date(m.joinedAt))}`, `since ${formatDate(new Date(m.joinedAt))}`)}
                      </p>
                      <p className="mt-1 text-[13.5px] text-mute">
                        {sum.attempts === 0
                          ? L("Ešte nič nevyskúšal(a).", "Hasn't tried anything yet.")
                          : [
                              L(`${sum.attempts}× vyskúšal(a)`, `${sum.attempts} attempts`),
                              L(`${sum.thisWeek} tento týždeň`, `${sum.thisWeek} this week`),
                              sum.daysSince === 0 ? L("naposledy dnes", "last today") : L(`naposledy pred ${sum.daysSince} d`, `last ${sum.daysSince} d ago`),
                              sum.content ? `${L("obsah", "content")} ${formatNumber(sum.content.last, 1)}/10${trend}` : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                      </p>
                    </Link>
                    <ConfirmAction
                      trigger={L("Odobrať", "Remove")}
                      title={L(`Odobrať ${m.email ?? "člena"}?`, `Remove ${m.email ?? "this member"}?`)}
                      description={L("Účet aj tréningy mu ostanú, len mu prestaneš platiť tréning.", "They keep their account and sessions; you just stop paying for their training.")}
                      confirmLabel={L("Odobrať", "Remove")}
                      pendingLabel={L("Odoberám…", "Removing…")}
                      action={removeMemberAction.bind(null, m.userId)}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {invites.length ? (
          <Card title={L(`Čakajúce pozvánky (${invites.length})`, `Pending invitations (${invites.length})`)}>
            <ul className="divide-y divide-line/60">
              {invites.map((invite) => (
                <li key={invite.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-paper">{invite.email}</p>
                    <p className="text-[13.5px] text-faint">
                      {invite.sent_at
                        ? L(`odoslaná ${formatDate(new Date(invite.sent_at))}`, `sent ${formatDate(new Date(invite.sent_at))}`)
                        : L("e-mail zatiaľ neodišiel", "email not sent yet")}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start gap-1">
                    <ActionButton action={resendInviteAction.bind(null, invite.id)} label={L("Poslať znova", "Send again")} pendingLabel={L("Posielam…", "Sending…")} />
                    <ConfirmAction
                      trigger={L("Zrušiť", "Cancel")}
                      title={L(`Zrušiť pozvánku pre ${invite.email}?`, `Cancel the invitation for ${invite.email}?`)}
                      description={L("Odkaz v e-maile prestane fungovať.", "The link in the email will stop working.")}
                      confirmLabel={L("Zrušiť pozvánku", "Cancel invitation")}
                      pendingLabel={L("Ruším…", "Cancelling…")}
                      action={cancelInviteAction.bind(null, invite.id)}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        <Card title={L("Nastavenia tímu", "Team settings")}>
          <RenameTeamForm name={owned.name} />
          <div className="mt-6 border-t border-coral/30 pt-5">
            <ConfirmAction
              trigger={L("Zrušiť tím", "Delete team")}
              title={L("Zrušiť tím?", "Delete the team?")}
              description={L(
                "Členovia ostanú bez tímu a tréning si budú platiť sami. Ich účty ani tréningy sa nemažú. Tvoj plán ostáva tebe.",
                "Members leave the team and pay for their own training. Their accounts and sessions aren't deleted. Your plan stays with you.",
              )}
              confirmLabel={L("Zrušiť tím", "Delete team")}
              pendingLabel={L("Ruším…", "Deleting…")}
              action={deleteTeamAction}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
