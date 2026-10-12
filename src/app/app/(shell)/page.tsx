import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth/session";
import { toDashboardExercise, toDashboardSession } from "@/lib/dashboard/load";
import {
  buildActivity,
  buildProgressSeries,
  buildRecentReports,
  buildStatCards,
  buildTip,
  trainingHref,
} from "@/lib/dashboard/overview";
import { recommendNextStep } from "@/lib/dashboard/recommendation";
import { listExercises } from "@/lib/db/exercises";
import { listOwnPitchAttempts } from "@/lib/db/pitch";
import { pitchStatCards, progressRows } from "@/lib/pitch/progress";
import { getProfile } from "@/lib/db/profile";
import { getMaterialCounts, listProjects } from "@/lib/db/projects";
import { listDashboardSessions } from "@/lib/db/sessions";
import { toNumber } from "@/lib/db/types";

// Stránka závisí od URL a dát používateľa: navigácia smie počkať na server.
export const instant = false;

export const metadata: Metadata = { title: "Prehľad" };

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const user = await requireUser("/app");
  const params = await searchParams;
  const [profile, projects, rows, exerciseRows, pitchAttempts] = await Promise.all([
    getProfile(user.id),
    listProjects(),
    listDashboardSessions(user.id),
    listExercises(user.id),
    listOwnPitchAttempts(user.id, 200),
  ]);
  // Nový účet: najprv krátky úvodný kvíz (dá sa preskočiť).
  if (profile && !profile.onboarding_completed_at) redirect("/app/vitaj");

  const counts = await getMaterialCounts(projects.map((project) => project.id));
  const sessions = rows.map(toDashboardSession);
  const exercises = exerciseRows.map(toDashboardExercise);

  const firstProject = projects[0] ?? null;
  const checklist = [
    {
      key: "profile",
      title: "Nastav si plán tréningu",
      detail: "Tri rýchle otázky, z ktorých zostavíme plán tréningu.",
      href: "/app/vitaj",
      done: Boolean(profile?.onboarding_answers),
    },
    {
      key: "pitch",
      title: "Nahraj prvý pitch",
      detail: "Pitch pred kamerou. Tréner ti radí počas pitchu, na konci dostaneš spätnú väzbu.",
      href: "/app/nahravka",
      done: pitchAttempts.length > 0,
    },
  ];

  const last = rows.find((row) => row.status === "completed") ?? null;
  const recommendation = recommendNextStep({
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      hasDeck: (counts[project.id]?.documents ?? 0) > 0,
      factCount: counts[project.id]?.facts ?? 0,
    })),
    lastSession: last
      ? {
          id: last.id,
          projectId: last.project_id,
          mode: last.mode,
          investorKey: last.investor_key,
          scenarioKey: last.scenario_key,
          status: last.status,
          reportStatus: last.feedback_reports?.status ?? null,
        }
      : null,
    openReportExercises: exerciseRows
      .filter((exercise) => exercise.origin === "report" && exercise.status === "open")
      .map((exercise) => ({ id: exercise.id, title: exercise.title, sourceSessionId: exercise.source_session_id })),
    completedExercisesSinceLastSession: last
      ? exerciseRows.filter((exercise) => exercise.completed_at && exercise.completed_at > (last.ended_at ?? last.created_at)).length
      : 0,
  });

  const completed = sessions.filter((session) => session.status === "completed");
  const { subject, family, cards: sessionCards } = buildStatCards(completed);
  // AI investor je zamknutý: kým nie sú tréningy, karty ukazujú progres nahraných pitchov
  const pitchRows = progressRows(pitchAttempts);
  const cards = completed.length === 0 && pitchRows.length > 0 ? pitchStatCards(pitchRows) : sessionCards;
  const reports = buildRecentReports(completed);

  return (
    <DashboardView
      trainingHref={trainingHref(recommendation, firstProject?.id ?? null)}
      stats={cards}
      startup={
        firstProject
          ? {
              id: firstProject.id,
              name: firstProject.name,
              oneLiner: firstProject.one_liner,
              stage: firstProject.stage,
              traction: firstProject.traction,
              raiseAmount: toNumber(firstProject.raise_amount),
              raiseCurrency: firstProject.raise_currency,
            }
          : null
      }
      activity={buildActivity(completed, exercises)}
      reports={reports}
      progress={buildProgressSeries(completed, family)}
      tip={buildTip(subject, recommendation)}
      latestReportHref={reports[0]?.href ?? null}
      now={new Date().toISOString()}
      checklist={checklist}
      notice={params.heslo === "zmenene" ? <Notice tone="success">Heslo je zmenené.</Notice> : null}
    />
  );
}
