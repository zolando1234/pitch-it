import Link from "next/link";

export type ChecklistItem = { key: string; title: string; detail: string; href: string; done: boolean };

/** Kontrolný zoznam prvých krokov. Zmizne, keď je všetko hotové. */
export function GettingStarted({ items, href = (path) => path, en = false }: { items: ChecklistItem[]; href?: (path: string) => string; en?: boolean }) {
  const done = items.filter((item) => item.done).length;
  if (items.length === 0 || done === items.length) return null;
  const next = items.find((item) => !item.done);
  return (
    <section aria-labelledby="getting-started" className="surface-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 id="getting-started" className="font-semibold text-paper">
            {en ? "Getting started" : "Začíname"}
          </h2>
          <p className="mt-0.5 text-sm text-mute">{en ? `${done} of ${items.length} steps done` : `${done} z ${items.length} krokov hotových`}</p>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line sm:w-48" aria-hidden="true">
          <div className="h-full rounded-full bg-mint" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      </div>
      <ol className="divide-y divide-line">
        {items.map((item) => {
          const current = item === next;
          return (
            <li key={item.key}>
              <Link
                href={href(item.href)}
                className={`flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-panel-2 ${item.done ? "opacity-70" : ""}`}
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex size-5 shrink-0 items-center justify-center rounded-full border ${
                    item.done ? "border-mint bg-mint/15 text-mint" : current ? "border-signal" : "border-line-strong"
                  }`}
                >
                  {item.done ? (
                    <svg viewBox="0 0 16 16" className="size-3">
                      <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-sm font-medium ${item.done ? "text-mute line-through" : "text-paper"}`}>
                    <span className="sr-only">{item.done ? (en ? "Done: " : "Hotové: ") : en ? "To do: " : "Čaká: "}</span>
                    {item.title}
                  </span>
                  {!item.done ? <span className="mt-0.5 block text-sm text-mute">{item.detail}</span> : null}
                </span>
                {current ? <span className="shrink-0 text-sm font-medium text-signal-soft">{en ? "Continue →" : "Pokračovať →"}</span> : null}
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
