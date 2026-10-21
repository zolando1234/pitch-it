import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { TeamPlanPicker } from "@/components/billing/plan-picker";
import { UseTeamMaterials } from "@/components/team/use-team-materials";
import { TeamMaterials } from "@/components/team/team-materials";
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
import { getAvailableTeamMaterials, getTeamMaterials, getUseTeamMaterials } from "@/lib/db/team-materials";
import { averageMatch } from "@/lib/pitch/team-materials";
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

function Card({ id, title, description, children }: { id?: string; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24 rounded-[18px] border border-line bg-panel/60 p-5 md:p-7">
      <h2 className="type-heading text-[1.2rem]">{title}</h2>
      {description ? <p className="mt-1.5 text-[14.5px] leading-relaxed text-mute">{description}</p> : null}
      <div className="mt-5">{children}</div>
    </section>
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
    const [teamMaterials, useTeam] = await Promise.all([getAvailableTeamMaterials(user.id), getUseTeamMaterials(user.id)]);
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
        {teamMaterials ? (
          <div className="mt-6">
            <UseTeamMaterials initial={useTeam} documentNames={teamMaterials.documents.map((d) => d.name)} />
          </div>
        ) : null}
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
  const [members, invites, attemptsByMember, subscription, materials] = await Promise.all([
    listTeamMembers(owned.id),
    listInvites(owned.id),
    listTeamAttempts(owned.id),
    getSubscription(user.id),
    getTeamMaterials(owned.id),
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
  const matchByMember = new Map(members.map((m) => [m.userId, averageMatch((attemptsByMember.get(m.userId) ?? []).map((a) => a.materials_match))]));
  const hasMaterials = materials.documents.length > 0;
  const totals = teamTotals([...summaries.values()]);

  const inviteSlots = paidSeats === null ? null : seats;
  const statusLabel = (active: boolean, never: boolean) =>
    active ? L("Aktívny", "Active") : never ? L("Ešte nič", "Not started") : L("Neaktívny", "Inactive");

  return (
    <>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
        <div className="min-w-0">
          <p className="text-[13px] text-faint">{L("Oddelenie / spoločnosť", "Department / company")}</p>
          <h1 className="type-heading mt-1 truncate text-[2.2rem] leading-tight md:text-[2.6rem]">{owned.name}</h1>
        </div>
        <dl className="flex gap-8">
          {[
            [members.length + 1, L("členov", "members")],
            [totals.active7, L("aktívnych", "active")],
            [totals.thisMonth, L("prejavov tento mesiac", "talks this month")],
          ].map(([value, label]) => (
            <div key={String(label)}>
              <dd className="text-[1.5rem] font-extrabold leading-none text-paper">{value}</dd>
              <dt className="mt-1 max-w-[7rem] text-[12.5px] leading-tight text-mute">{label}</dt>
            </div>
          ))}
        </dl>
      </header>
      {joined}
      <div className="grid gap-8">
        <section aria-labelledby="clenovia">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h2 id="clenovia" className="type-heading text-[1.25rem]">
              {L("Členovia", "Members")}
            </h2>
            <p className="text-[13.5px] text-mute">
              {L(`Každý nový člen má ${FREE_SECONDS / 60} min zadarmo, potom trénuje z tvojho plánu.`, `Every new member gets ${FREE_SECONDS / 60} free min, then trains on your plan.`)}
            </p>
          </div>
          <div className="mt-4">
            {paidSeats === null ? (
              <Notice tone="info" className="mb-3">
                {L("Bez plateného plánu trénujú pozvaní kolegovia ako Free.", "Without a paid plan, invited colleagues train on Free.")}{" "}
                <a href="#plan-timu" className="font-bold underline">
                  {L("Zaplatiť za tím", "Pay for the team")}
                </a>
              </Notice>
            ) : seats <= 0 ? (
              <Notice tone="info" className="mb-3">
                {L(`Všetkých ${paidSeats} zaplatených účtov je obsadených.`, `All ${paidSeats} paid accounts are taken.`)}{" "}
                <a href="#plan-timu" className="font-bold underline">
                  {L("Pridať účty", "Add accounts")}
                </a>
              </Notice>
            ) : null}
            <InviteForm seats={seats} compact />
            {inviteSlots !== null && inviteSlots > 0 ? (
              <p className="mt-2 text-[12.5px] text-faint">{L(`Môžeš pozvať ešte ${inviteSlots}. Viac e-mailov oddeľ čiarkou.`, `You can invite ${inviteSlots} more. Separate several emails with commas.`)}</p>
            ) : null}
          </div>

          {members.length > 0 || invites.length > 0 ? (
            <div className="mt-5 overflow-hidden rounded-[18px] border border-line bg-panel/60">
              <div className="hidden grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_auto] gap-4 border-b border-line px-5 py-3 text-[11.5px] font-semibold uppercase tracking-wider text-faint md:grid">
                <span>{L("Meno", "Name")}</span>
                <span>{L("Stav", "Status")}</span>
                <span>{L("Minúty", "Minutes")}</span>
                <span>{hasMaterials ? L("Zhoda s materiálmi", "Match with materials") : L("Skóre obsahu", "Content score")}</span>
                <span className="w-24" />
              </div>
              <ul className="divide-y divide-line/60">
                {members.map((m) => {
                  const sum = summaries.get(m.userId)!;
                  const active = sum.last7 > 0;
                  const trend = sum.trend === "up" ? " ↑" : sum.trend === "down" ? " ↓" : "";
                  return (
                    <li key={m.userId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_auto]">
                      <Link href={`/app/tim/clen/${m.userId}`} className="group flex min-w-0 items-center gap-3">
                        <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-[12px] font-bold text-mute">
                          {(m.name || m.email || "?").trim().slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-paper group-hover:underline">{m.name || m.email}</span>
                          <span className="block truncate text-[12.5px] text-faint">
                            {m.name && m.email ? m.email : L(`od ${formatDate(new Date(m.joinedAt))}`, `since ${formatDate(new Date(m.joinedAt))}`)}
                          </span>
                        </span>
                      </Link>
                      <span className={`col-start-1 text-[13.5px] md:col-start-auto ${active ? "text-accent" : "text-mute"}`}>
                        {statusLabel(active, sum.attempts === 0)}
                        <span className="text-faint md:hidden">{` · ${sum.minutes} min`}</span>
                      </span>
                      <span className="hidden text-[14px] text-paper md:block">
                        {sum.minutes} min <span className="text-faint">· {sum.attempts}×</span>
                      </span>
                      <span className="hidden text-[14px] font-bold md:block">
                        {hasMaterials ? (
                          matchByMember.get(m.userId) !== null && matchByMember.get(m.userId) !== undefined ? (
                            <span className="text-accent">{matchByMember.get(m.userId)} %</span>
                          ) : (
                            <span className="font-normal text-faint">—</span>
                          )
                        ) : sum.content ? (
                          <span className="text-accent">
                            {formatNumber(sum.content.last, 1)}/10{trend}
                          </span>
                        ) : (
                          <span className="font-normal text-faint">—</span>
                        )}
                      </span>
                      <span className="col-start-2 row-span-2 row-start-1 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto md:w-24 md:text-right">
                        <ConfirmAction
                          trigger={L("Odobrať", "Remove")}
                          title={L(`Odobrať ${m.email ?? "člena"}?`, `Remove ${m.email ?? "this member"}?`)}
                          description={L(
                            "Účet aj tréningy mu ostanú, len mu prestaneš platiť tréning. Počet zaplatených účtov sa nezmení, uvoľnené miesto môžeš dať niekomu inému alebo znížiť počet účtov v Pláne tímu.",
                            "They keep their account and sessions; you just stop paying for their training. Your paid accounts stay the same: invite someone else, or lower the number of accounts under Team plan.",
                          )}
                          confirmLabel={L("Odobrať", "Remove")}
                          pendingLabel={L("Odoberám…", "Removing…")}
                          action={removeMemberAction.bind(null, m.userId)}
                        />
                      </span>
                    </li>
                  );
                })}
                {invites.map((invite) => (
                  <li key={invite.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-5 py-4 md:grid-cols-[minmax(0,2.2fr)_1fr_1fr_1fr_auto]">
                    <div className="flex min-w-0 items-center gap-3">
                      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-[12px] font-bold text-mute">
                        {invite.email.slice(0, 2).toUpperCase()}
                      </span>
                      <span className="block min-w-0 truncate font-medium text-paper">{invite.email}</span>
                    </div>
                    <span className="col-start-1 text-[13.5px] text-mute md:col-start-auto">
                      {invite.sent_at ? L("Pozvánka odoslaná", "Invitation sent") : L("E-mail neodišiel", "Email not sent")}
                    </span>
                    <span className="hidden text-faint md:block">—</span>
                    <span className="hidden text-faint md:block">—</span>
                    <span className="col-start-2 row-span-2 row-start-1 flex flex-wrap justify-end gap-1 md:col-start-auto md:row-span-1 md:row-start-auto md:w-auto">
                      <ActionButton action={resendInviteAction.bind(null, invite.id)} label={L("Poslať znova", "Send again")} pendingLabel={L("Posielam…", "Sending…")} />
                      <ConfirmAction
                        trigger={L("Zrušiť", "Cancel")}
                        title={L(`Zrušiť pozvánku pre ${invite.email}?`, `Cancel the invitation for ${invite.email}?`)}
                        description={L("Odkaz v e-maile prestane fungovať.", "The link in the email will stop working.")}
                        confirmLabel={L("Zrušiť pozvánku", "Cancel invitation")}
                        pendingLabel={L("Ruším…", "Cancelling…")}
                        action={cancelInviteAction.bind(null, invite.id)}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-5 text-[14.5px] text-mute">{L("Zatiaľ nikto. Pozvi prvých kolegov vyššie.", "Nobody yet. Invite your first colleagues above.")}</p>
          )}
        </section>

        <TeamMaterials initialDocuments={materials.documents} initialCriteria={materials.criteria} />

        <section id="plan-timu" className="scroll-mt-24">
          <h2 className="type-heading text-[1.25rem]">{L("Plán tímu", "Team plan")}</h2>
          <p className="mt-1 text-[13.5px] text-mute">
            {L(
              `Platíš ty, za každý účet vrátane seba. Tímová zľava ${teamTiers("sk")}. Pri Pro má tím ${PRO_WEEKLY_SECONDS / 60} minút týždenne za každý účet.`,
              `You pay, per account including yourself. Team discount ${teamTiers("en")}. On Pro the team gets ${PRO_WEEKLY_SECONDS / 60} minutes per week per account.`,
            )}
          </p>
          <div className="mt-4 rounded-[18px] border border-accent/25 bg-lime-tint/40 p-5 md:p-6">
            <p className="text-[1.15rem] font-bold leading-snug text-accent md:text-[1.4rem]">{left}</p>
            {paidSeats !== null ? (
              <p className={`mt-2 text-[14px] ${paidSeats < accounts ? "text-coral" : "text-mute"}`}>
                {L(
                  `Zaplatené účty: ${paidSeats}, v tíme (s tebou a pozvánkami): ${accounts}.`,
                  `Paid accounts: ${paidSeats}, in the team (with you and invitations): ${accounts}.`,
                )}
                {paidSeats < accounts ? ` ${L("Pridaj účty, aby si mohol pozývať ďalších.", "Add accounts to invite more people.")}` : ""}
              </p>
            ) : null}
          </div>
          {stripe ? (
            <div className="mt-5">
              <TeamPlanPicker
                current={plan}
                currentInterval={plan === "free" ? null : (subscription?.interval ?? null)}
                currentSeats={paidSeats ?? 1}
                minSeats={accounts}
                paymentsEnabled={stripe}
              />
            </div>
          ) : (
            <p className="mt-3 text-sm text-marker">{L("Platby zatiaľ nie sú zapnuté.", "Payments are not enabled yet.")}</p>
          )}
          <Link href="/app/nastavenia#plan" className={`${buttonClasses({ variant: "secondary" })} mt-5`}>
            {L("Spravovať plán", "Manage plan")}
          </Link>
        </section>

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
