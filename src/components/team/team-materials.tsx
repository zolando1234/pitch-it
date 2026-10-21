"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { PasteTextDocument } from "@/components/pitch/paste-text-document";
import { extractDocument } from "@/lib/documents/extract-client";
import { sanitizeFileName } from "@/lib/documents/file-check";
import type { PitchDocument } from "@/lib/pitch/context";
import { CRITERIA, CRITERION_LABELS, MATERIAL_MAX_DOCUMENTS, type Criterion } from "@/lib/pitch/team-materials";

/*
  Materiály tímu: vlastník nahrá prezentácie, produktové listy či skripty (text sa vytiahne
  v prehliadači, súbor sa nikam nenahráva) a vyberie, čo sa pri prejavoch členov hodnotí.
*/

const TX = {
  sk: {
    title: "Materiály tímu",
    sub: "Členov hodnotíme podľa toho, čo tu nahráš. Člen si to môže odškrtnúť a použiť vlastné podklady.",
    drop: "Nahraj prezentácie, produktové listy alebo skripty",
    dropNote: "PDF, PPTX, DOCX · max 25 MB. Súbor sa nikam nenahráva, uloží sa len jeho text.",
    choose: "Vybrať súbory",
    reading: (name: string) => `Čítam ${name}…`,
    pages: (n: number) => `${n} ${n === 1 ? "strana" : n < 5 ? "strany" : "strán"}`,
    added: (date: string) => `nahrané ${date}`,
    everyone: "Všetci členovia",
    remove: "Odobrať",
    judge: "Hodnotiť:",
    saving: "Ukladám…",
    errors: {
      type: "Toto nie je PDF, PPTX ani DOCX.",
      size: "Súbor má viac ako 25 MB.",
      empty: "V dokumente sme nenašli text (napríklad naskenované PDF).",
      encrypted: "Dokument je chránený heslom.",
      invalid: "Dokument sa nepodarilo prečítať.",
      limit: `Najviac ${MATERIAL_MAX_DOCUMENTS} dokumentov. Najprv nejaký odober.`,
      save: "Uloženie zlyhalo. Skús to znova.",
    },
  },
  en: {
    title: "Team materials",
    sub: "Members are assessed against what you upload here. A member can untick it and use their own materials.",
    drop: "Upload presentations, product sheets or scripts",
    dropNote: "PDF, PPTX, DOCX · max 25 MB. The file isn't uploaded, only its text is saved.",
    choose: "Choose files",
    reading: (name: string) => `Reading ${name}…`,
    pages: (n: number) => `${n} ${n === 1 ? "page" : "pages"}`,
    added: (date: string) => `added ${date}`,
    everyone: "All members",
    remove: "Remove",
    judge: "Assess:",
    saving: "Saving…",
    errors: {
      type: "This is not a PDF, PPTX or DOCX.",
      size: "The file is larger than 25 MB.",
      empty: "We found no text in the document (e.g. a scanned PDF).",
      encrypted: "The document is password protected.",
      invalid: "The document couldn't be read.",
      limit: `At most ${MATERIAL_MAX_DOCUMENTS} documents. Remove one first.`,
      save: "Saving failed. Try again.",
    },
  },
};

async function persist(documents: PitchDocument[], criteria: Criterion[]): Promise<boolean> {
  try {
    const response = await fetch("/api/tim/materialy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documents, criteria }) });
    return response.ok;
  } catch {
    return false;
  }
}

export function TeamMaterials({ initialDocuments, initialCriteria }: { initialDocuments: PitchDocument[]; initialCriteria: Criterion[] }) {
  const locale = useLocale();
  const tx = TX[locale];
  const [documents, setDocuments] = useState(initialDocuments);
  const [criteria, setCriteria] = useState(initialCriteria);
  const [reading, setReading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const save = async (nextDocs: PitchDocument[], nextCriteria: Criterion[]) => {
    setSaving(true);
    const ok = await persist(nextDocs, nextCriteria);
    setSaving(false);
    if (!ok) setError(tx.errors.save);
    return ok;
  };

  const addFiles = async (files: FileList | File[]) => {
    let next = documents;
    setError(null);
    for (const file of Array.from(files)) {
      if (next.length >= MATERIAL_MAX_DOCUMENTS) {
        setError(tx.errors.limit);
        break;
      }
      const name = sanitizeFileName(file.name);
      setReading(name);
      const result = await extractDocument(file);
      if (!result.ok) {
        setError(`${name}: ${tx.errors[result.reason]}`);
        continue;
      }
      next = [...next, { id: crypto.randomUUID(), name, kind: result.kind, pages: result.pages, text: result.text, added_at: new Date().toISOString() }];
    }
    setReading(null);
    if (next !== documents) {
      setDocuments(next);
      await save(next, criteria);
    }
  };

  const addText = async (doc: PitchDocument) => {
    if (documents.length >= MATERIAL_MAX_DOCUMENTS) {
      setError(tx.errors.limit);
      return;
    }
    setError(null);
    const next = [...documents, doc];
    setDocuments(next);
    await save(next, criteria);
  };

  const remove = async (id: string) => {
    const next = documents.filter((d) => d.id !== id);
    setDocuments(next);
    await save(next, criteria);
  };

  const toggle = async (criterion: Criterion) => {
    const next = criteria.includes(criterion) ? criteria.filter((c) => c !== criterion) : CRITERIA.filter((c) => c === criterion || criteria.includes(c));
    setCriteria(next);
    await save(documents, next);
  };

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale === "en" ? "en-GB" : "sk-SK", { day: "numeric", month: "numeric" });

  return (
    <section aria-labelledby="materialy">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h2 id="materialy" className="type-heading text-[1.25rem]">
          {tx.title}
        </h2>
        <p className="text-[13.5px] text-mute" role="status">
          {saving ? tx.saving : tx.sub}
        </p>
      </div>

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
        className={`mt-4 flex flex-wrap items-center gap-4 rounded-[18px] border border-dashed px-5 py-5 transition ${over ? "border-accent bg-accent/10" : "border-line-strong"}`}
      >
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-paper">{reading ? tx.reading(reading) : tx.drop}</p>
          <p className="mt-1 text-[13px] text-mute">{tx.dropNote}</p>
        </div>
        <button
          type="button"
          disabled={!!reading}
          onClick={() => input.current?.click()}
          className="inline-flex h-11 shrink-0 items-center rounded-full border border-line-strong px-5 text-[14px] font-bold text-paper hover:bg-panel disabled:opacity-50"
        >
          {tx.choose}
        </button>
        <PasteTextDocument disabled={!!reading} onAdd={addText} />
        <input
          ref={input}
          type="file"
          accept=".pdf,.pptx,.docx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-coral">
          {error}
        </p>
      ) : null}

      {documents.length ? (
        <ul className="mt-4 divide-y divide-line/60 overflow-hidden rounded-[18px] border border-line bg-panel/60">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-4 px-5 py-4">
              <span aria-hidden="true" className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-panel-2 text-[11px] font-bold text-mute">
                {doc.kind === "text" ? "TXT" : doc.kind.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-paper">{doc.name}</p>
                <p className="text-[12.5px] text-faint">
                  {tx.pages(doc.pages)} · {tx.added(date(doc.added_at))}
                </p>
              </div>
              <span className="hidden text-[13px] text-mute sm:block">{tx.everyone}</span>
              <button type="button" onClick={() => void remove(doc.id)} className="shrink-0 text-[13.5px] font-semibold text-mute hover:text-coral">
                {tx.remove}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[13.5px] text-mute">{tx.judge}</span>
        {CRITERIA.map((c) => {
          const on = criteria.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => void toggle(c)}
              className={`rounded-full border px-3.5 py-1.5 text-[13.5px] font-semibold transition ${on ? "border-accent/50 bg-lime-tint text-accent" : "border-line-strong text-mute hover:text-paper"}`}
            >
              {on ? "✓ " : ""}
              {CRITERION_LABELS[c][locale]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
