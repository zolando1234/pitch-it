import type { Metadata } from "next";
import { UseTeamMaterials } from "@/components/team/use-team-materials";
import { PitchContextForm } from "@/components/pitch/pitch-context-form";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth/session";
import { getPitchContext } from "@/lib/db/pitch-context";
import { getAvailableTeamMaterials, getUseTeamMaterials } from "@/lib/db/team-materials";
import { getLocale } from "@/lib/i18n/server";

// Stránka závisí od dát používateľa: navigácia smie počkať na server.
export const instant = false;

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getLocale()) === "en" ? "Documents" : "Dokumenty" };
}

export default async function DocumentsPage() {
  const user = await requireUser("/app/dokumenty");
  const [context, locale, teamMaterials, useTeam] = await Promise.all([getPitchContext(user.id), getLocale(), getAvailableTeamMaterials(user.id), getUseTeamMaterials(user.id)]);
  const en = locale === "en";
  return (
    <>
      <PageHeader
        title={en ? "Documents" : "Dokumenty"}
        description={
          en
            ? "What you talk about: your company, product or presentation. The analysis checks your talk against it and Q&A questions are generated from it."
            : "O čom hovoríš: firma, produkt alebo prezentácia. Hodnotenie podľa toho posúdi tvoj prejav a z toho vzniknú aj otázky v Q&A."
        }
      />
      {teamMaterials ? (
        <div className="mb-6">
          <UseTeamMaterials initial={useTeam} documentNames={teamMaterials.documents.map((d) => d.name)} />
        </div>
      ) : null}
      <PitchContextForm initial={context ?? { about: "", documents: [] }} />
    </>
  );
}
