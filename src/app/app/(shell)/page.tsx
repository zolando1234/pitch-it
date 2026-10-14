import type { Metadata } from "next";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { Notice } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth/session";
import { listOwnPitchAttempts } from "@/lib/db/pitch";
import { getPitchContext } from "@/lib/db/pitch-context";
import { pitchStatCards, progressRows } from "@/lib/pitch/progress";
import { getLocale } from "@/lib/i18n/server";

// Stránka závisí od URL a dát používateľa: navigácia smie počkať na server.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Overview" : "Prehľad" };
}

export default async function DashboardPage({ searchParams }: PageProps<"/app">) {
  const user = await requireUser("/app");
  const params = await searchParams;
  const [pitchAttempts, context] = await Promise.all([listOwnPitchAttempts(user.id, 200), getPitchContext(user.id)]);
  const locale = await getLocale();
  const en = locale === "en";

  const checklist = [
    {
      key: "documents",
      title: en ? "Add what you'll talk about" : "Pridaj, o čom budeš hovoriť",
      detail: en
        ? "A few sentences about your company or a PDF of your presentation. The analysis and Q&A questions use it."
        : "Pár viet o firme alebo PDF prezentácie. Využije ich hodnotenie aj otázky v Q&A.",
      href: "/app/dokumenty",
      done: Boolean(context && (context.about.trim() || context.documents.length)),
    },
    {
      key: "pitch",
      title: en ? "Record your first pitch" : "Nahraj prvý pitch",
      detail: en
        ? "On camera or from a video. The coach gives you tips while you speak and you get feedback at the end."
        : "Kamerou alebo z videa. Tréner ti radí počas prejavu, na konci dostaneš spätnú väzbu.",
      href: "/app/nahravka",
      done: pitchAttempts.length > 0,
    },
  ];

  return (
    <DashboardView
      stats={pitchStatCards(progressRows(pitchAttempts), locale)}
      checklist={checklist}
      locale={locale}
      notice={params.heslo === "zmenene" ? <Notice tone="success">{en ? "Your password has been changed." : "Heslo je zmenené."}</Notice> : null}
    />
  );
}
