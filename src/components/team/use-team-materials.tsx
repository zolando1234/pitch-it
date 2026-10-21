"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";

/*
  Voľba člena tímu: hodnotiť prejavy podľa materiálov, ktoré nahral vedúci tímu (predvolené),
  alebo len podľa vlastných podkladov.
*/

export function UseTeamMaterials({ initial, documentNames }: { initial: boolean; documentNames: string[] }) {
  const en = useLocale() === "en";
  const [use, setUse] = useState(initial);
  const [error, setError] = useState(false);

  const change = async (next: boolean) => {
    setUse(next);
    setError(false);
    try {
      const response = await fetch("/api/tim/materialy/predvolba", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ use: next }) });
      if (!response.ok) throw new Error("save");
    } catch {
      setUse(!next);
      setError(true);
    }
  };

  return (
    <section className="dash-card max-w-3xl p-5 md:p-6" aria-labelledby="tim-podklady">
      <h2 id="tim-podklady" className="text-[17px] font-bold text-paper">
        {en ? "Team materials" : "Materiály tímu"}
      </h2>
      <label className="mt-3 flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={use} onChange={(e) => void change(e.target.checked)} className="mt-1 size-5 shrink-0 accent-[var(--color-accent)]" />
        <span className="text-[15px] leading-relaxed text-paper">
          {en ? "Assess my talks against the team's materials" : "Hodnotiť moje prejavy podľa materiálov tímu"}
          <span className="mt-1 block text-[13.5px] text-mute">
            {en
              ? "Default: your talks are checked against what the team lead uploaded. Untick it if your talk shouldn't stick to those materials; your own documents below are still used."
              : "Predvolene sa tvoje prejavy kontrolujú podľa toho, čo nahral vedúci tímu. Odškrtni, ak sa tvoja prezentácia nemá držať týchto materiálov; vlastné dokumenty nižšie sa použijú vždy."}
          </span>
        </span>
      </label>
      {documentNames.length ? <p className="mt-3 text-[13px] text-faint">{documentNames.join(" · ")}</p> : null}
      {error ? (
        <p role="alert" className="mt-2 text-sm text-coral">
          {en ? "Saving failed. Try again." : "Uloženie zlyhalo. Skús to znova."}
        </p>
      ) : null}
    </section>
  );
}
