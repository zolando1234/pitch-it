"use client";

import { useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";
import { DOCUMENT_TEXT_MAX, type PitchDocument } from "@/lib/pitch/context";

/*
  Vloženie textu ako dokumentu (poznámky, skript, popis produktu): bez súboru, rovno text.
  Pridá sa medzi dokumenty a uloží sa rovnako ako nahraný súbor.
*/

const TX = {
  sk: { open: "Vložiť text", name: "Názov (napr. Skript prezentácie)", text: "Vlož alebo napíš text", add: "Pridať", cancel: "Zrušiť", untitled: "Vložený text", empty: "Najprv vlož nejaký text.", count: (n: number) => `${n.toLocaleString("sk-SK")} / ${DOCUMENT_TEXT_MAX.toLocaleString("sk-SK")}` },
  en: { open: "Paste text", name: "Name (e.g. Presentation script)", text: "Paste or write text", add: "Add", cancel: "Cancel", untitled: "Pasted text", empty: "Paste some text first.", count: (n: number) => `${n.toLocaleString("en-GB")} / ${DOCUMENT_TEXT_MAX.toLocaleString("en-GB")}` },
};

export function PasteTextDocument({ disabled, onAdd }: { disabled?: boolean; onAdd: (doc: PitchDocument) => void | Promise<void> }) {
  const tx = TX[useLocale()];
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="inline-flex h-11 items-center rounded-full border border-line-strong px-5 text-[14px] font-bold text-paper hover:bg-panel disabled:opacity-50"
      >
        {tx.open}
      </button>
    );
  }

  const add = async () => {
    const clean = text.trim();
    if (!clean) {
      setError(true);
      return;
    }
    const words = clean.split(/\s+/).length;
    await onAdd({ id: crypto.randomUUID(), name: name.trim().slice(0, 160) || tx.untitled, kind: "text", pages: Math.max(1, Math.round(words / 500)), text: clean.slice(0, DOCUMENT_TEXT_MAX), added_at: new Date().toISOString() });
    setName("");
    setText("");
    setError(false);
    setOpen(false);
  };

  return (
    <div className="w-full rounded-2xl border border-line bg-panel/60 p-4">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={160}
        placeholder={tx.name}
        aria-label={tx.name}
        className="min-h-[44px] w-full rounded-xl border border-line bg-transparent px-4 text-[15px] text-paper placeholder:text-faint focus:border-signal focus:outline-none"
      />
      <textarea
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError(false);
        }}
        maxLength={DOCUMENT_TEXT_MAX}
        rows={8}
        placeholder={tx.text}
        aria-label={tx.text}
        className="mt-3 w-full resize-y rounded-xl border border-line bg-transparent px-4 py-3 text-[15px] leading-relaxed text-paper placeholder:text-faint focus:border-signal focus:outline-none"
      />
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className={`text-xs ${error ? "text-coral" : "text-faint"}`}>{error ? tx.empty : tx.count(text.length)}</span>
        <div className="flex gap-2">
          <button type="button" onClick={() => setOpen(false)} className="inline-flex h-10 items-center rounded-full px-4 text-[14px] font-semibold text-mute hover:text-paper">
            {tx.cancel}
          </button>
          <button type="button" onClick={() => void add()} className="inline-flex h-10 items-center rounded-full bg-signal px-6 text-[14px] font-bold text-on-signal hover:brightness-105">
            {tx.add}
          </button>
        </div>
      </div>
    </div>
  );
}
