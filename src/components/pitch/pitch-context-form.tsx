"use client";

import { useRef, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { PasteTextDocument } from "@/components/pitch/paste-text-document";
import { extractDocument } from "@/lib/documents/extract-client";
import { sanitizeFileName } from "@/lib/documents/file-check";
import { ABOUT_MAX, MAX_DOCUMENTS, type PitchContext, type PitchDocument } from "@/lib/pitch/context";

/*
  Sekcia Dokumenty: jedno textové pole o firme či prezentácii a miesto na pretiahnutie PDF/PPTX.
  Text z dokumentov sa vytiahne v prehliadači, uloží sa iba text.
*/

const TX = {
  sk: {
    aboutLabel: "O firme a prezentácii",
    aboutHint: "Píš voľne: čo robíte, pre koho, čísla, ktoré chceš spomenúť, a o čom bude prezentácia.",
    aboutPlaceholder:
      "Napríklad: PitchIt je AI tréner prezentácií. Pomáhame zakladateľom a manažérom pripraviť sa na vystúpenie pred publikom. Máme 120 používateľov, pilot s dvomi firmami a hľadáme 150 000 € na rast.",
    docs: "Dokumenty",
    drop: "Pretiahni sem PDF, PPTX alebo DOCX",
    dropOr: "alebo klikni a vyber súbor",
    dropNote: `Najviac ${MAX_DOCUMENTS} dokumentov, každý do 25 MB. Súbor sa nikam nenahráva, uloží sa len jeho text.`,
    reading: (name: string) => `Čítam ${name}…`,
    pages: (n: number) => `${n} ${n === 1 ? "strana" : n < 5 ? "strany" : "strán"}`,
    chars: (n: number) => `${n.toLocaleString("sk-SK")} znakov`,
    remove: "Odstrániť",
    save: "Uložiť",
    saving: "Ukladám…",
    saved: "Uložené",
    unsaved: "Máš neuložené zmeny",
    errors: {
      type: "Toto nie je PDF, PPTX ani DOCX.",
      size: "Súbor má viac ako 25 MB.",
      empty: "V dokumente sme nenašli text (napríklad naskenované PDF). Dôležité veci napíš do poľa vyššie.",
      encrypted: "Dokument je chránený heslom.",
      invalid: "Dokument sa nepodarilo prečítať.",
      limit: `Najviac ${MAX_DOCUMENTS} dokumentov. Najprv nejaký odstráň.`,
      save: "Uloženie zlyhalo. Skús to znova.",
    },
  },
  en: {
    aboutLabel: "About your company and presentation",
    aboutHint: "Write freely: what you do, for whom, numbers you want to mention and what the presentation is about.",
    aboutPlaceholder:
      "For example: PitchIt is an AI presentation coach. We help founders and managers prepare for talks in front of an audience. We have 120 users, a pilot with two companies and we're raising €150,000 for growth.",
    docs: "Documents",
    drop: "Drop a PDF, PPTX or DOCX here",
    dropOr: "or click to choose a file",
    dropNote: `At most ${MAX_DOCUMENTS} documents, each up to 25 MB. The file isn't uploaded, only its text is saved.`,
    reading: (name: string) => `Reading ${name}…`,
    pages: (n: number) => `${n} ${n === 1 ? "page" : "pages"}`,
    chars: (n: number) => `${n.toLocaleString("en-GB")} characters`,
    remove: "Remove",
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    unsaved: "You have unsaved changes",
    errors: {
      type: "This is not a PDF, PPTX or DOCX.",
      size: "The file is larger than 25 MB.",
      empty: "We found no text in the document (e.g. a scanned PDF). Write the important points in the field above.",
      encrypted: "The document is password protected.",
      invalid: "The document couldn't be read.",
      limit: `At most ${MAX_DOCUMENTS} documents. Remove one first.`,
      save: "Saving failed. Try again.",
    },
  },
};

async function persist(context: PitchContext): Promise<boolean> {
  try {
    const response = await fetch("/api/kontext", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(context) });
    return response.ok;
  } catch {
    return false;
  }
}

export function PitchContextForm({ initial }: { initial: PitchContext }) {
  const tx = TX[useLocale()];
  const [about, setAbout] = useState(initial.about);
  const [savedAbout, setSavedAbout] = useState(initial.about);
  const [documents, setDocuments] = useState<PitchDocument[]>(initial.documents);
  const [reading, setReading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const dirty = about !== savedAbout;

  const save = async (next: { about: string; documents: PitchDocument[] }) => {
    setState("saving");
    setError(null);
    const ok = await persist(next);
    setState(ok ? "saved" : "idle");
    if (ok) setSavedAbout(next.about);
    else setError(tx.errors.save);
    return ok;
  };

  const addFiles = async (files: FileList | File[]) => {
    let next = documents;
    for (const file of Array.from(files)) {
      if (next.length >= MAX_DOCUMENTS) {
        setError(tx.errors.limit);
        break;
      }
      const name = sanitizeFileName(file.name);
      setReading(name);
      setError(null);
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
      // dokument sa uloží hneď (text v poli len ak je aj on uložený, aby sa neuložil rozpísaný)
      await save({ about: savedAbout, documents: next });
    }
  };

  const addText = async (doc: PitchDocument) => {
    if (documents.length >= MAX_DOCUMENTS) {
      setError(tx.errors.limit);
      return;
    }
    setError(null);
    const next = [...documents, doc];
    setDocuments(next);
    await save({ about: savedAbout, documents: next });
  };

  const remove = async (id: string) => {
    const next = documents.filter((d) => d.id !== id);
    setDocuments(next);
    await save({ about: savedAbout, documents: next });
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <section className="dash-card p-5 md:p-6">
        <label htmlFor="kontext-o-firme" className="text-[17px] font-bold text-paper">
          {tx.aboutLabel}
        </label>
        <p className="mt-1 text-[14px] text-mute">{tx.aboutHint}</p>
        <textarea
          id="kontext-o-firme"
          value={about}
          onChange={(e) => {
            setAbout(e.target.value);
            setState("idle");
          }}
          maxLength={ABOUT_MAX}
          rows={9}
          placeholder={tx.aboutPlaceholder}
          className="mt-4 min-h-56 w-full resize-y rounded-2xl border border-line bg-transparent px-5 py-4 text-base leading-relaxed text-paper placeholder:text-faint focus:border-signal focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-faint">
            {about.length} / {ABOUT_MAX}
          </span>
          <div className="flex items-center gap-3">
            <span className="text-sm text-mute" role="status">
              {state === "saved" && !dirty ? tx.saved : dirty ? tx.unsaved : ""}
            </span>
            <button
              type="button"
              disabled={!dirty || state === "saving"}
              onClick={() => void save({ about, documents })}
              className="inline-flex h-10 items-center rounded-full bg-signal px-6 text-[14px] font-bold text-on-signal hover:brightness-105 disabled:opacity-40"
            >
              {state === "saving" ? tx.saving : tx.save}
            </button>
          </div>
        </div>
      </section>

      <section className="dash-card p-5 md:p-6" aria-labelledby="dokumenty-nadpis">
        <h2 id="dokumenty-nadpis" className="text-[17px] font-bold text-paper">
          {tx.docs}
        </h2>
        <button
          type="button"
          onClick={() => input.current?.click()}
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
          disabled={!!reading}
          className={`mt-4 flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${
            over ? "border-signal bg-signal/10" : "border-line hover:border-faint"
          }`}
        >
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
            <path d="M12 16V4M7 9l5-5 5 5M5 20h14" />
          </svg>
          <span className="mt-2 text-[16px] font-bold text-paper">{reading ? tx.reading(reading) : tx.drop}</span>
          {!reading ? <span className="text-sm text-mute">{tx.dropOr}</span> : null}
        </button>
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
        <div className="mt-3">
          <PasteTextDocument disabled={!!reading} onAdd={addText} />
        </div>
        <p className="mt-2 text-xs text-faint">{tx.dropNote}</p>
        {error ? (
          <p role="alert" className="mt-3 text-sm text-coral">
            {error}
          </p>
        ) : null}
        {documents.length ? (
          <ul className="mt-4 divide-y divide-line/70">
            {documents.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-semibold text-paper">{doc.name}</p>
                  <p className="text-[13px] text-mute">
                    {doc.kind === "text" ? "TXT" : doc.kind.toUpperCase()} · {tx.pages(doc.pages)} · {tx.chars(doc.text.length)}
                  </p>
                </div>
                <button type="button" onClick={() => void remove(doc.id)} className="shrink-0 text-sm font-semibold text-coral hover:underline">
                  {tx.remove}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
