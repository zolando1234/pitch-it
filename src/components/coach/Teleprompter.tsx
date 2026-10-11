"use client";

import { useEffect, useMemo, useRef, useState } from "react";

const CUE = /(\[[^\]]+\])/;
const MIN_WPM = 80;
const MAX_WPM = 220;

/** Počet slov na čítanie (bez pokynov v hranatých zátvorkách). */
function countWords(text: string) {
  return text.replace(/\[[^\]]+\]/g, " ").split(/\s+/).filter(Boolean).length;
}

type Props = {
  text: string;
  wpm: number;
  onWpmChange: (wpm: number) => void;
  /** text sa posúva len počas tréningu */
  running: boolean;
};

/**
 * Teleprompter hore na obrazovke (blízko kamery, aby pohľad smeroval k publiku).
 * Posúva sa rýchlosťou čítania; medzerník = pauza, šípky hore/dole = rýchlosť.
 */
export default function Teleprompter({ text, wpm, onWpmChange, running }: Props) {
  const viewRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const elapsed = useRef(0);
  const wpmRef = useRef(wpm);
  const words = useMemo(() => countWords(text), [text]);

  useEffect(() => {
    wpmRef.current = wpm;
  }, [wpm]);

  // posun textu priamo cez style.transform (bez prekresľovania Reactu)
  useEffect(() => {
    if (!running || paused) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      elapsed.current += now - last;
      last = now;
      const view = viewRef.current;
      const content = contentRef.current;
      if (view && content) {
        // čas potrebný na prečítanie pri aktuálnej rýchlosti; prepočítava sa pri zmene rýchlosti
        const totalMs = (words / wpmRef.current) * 60_000;
        const progress = Math.min(1, elapsed.current / Math.max(totalMs, 1));
        const readLine = view.clientHeight * 0.3;
        const y = readLine - progress * Math.max(content.scrollHeight - 40, 0);
        content.style.transform = `translateY(${y}px)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, paused, words]);

  // pri zmene rýchlosti zachováme aktuálnu pozíciu v texte
  const changeWpm = (next: number) => {
    const clamped = Math.min(MAX_WPM, Math.max(MIN_WPM, next));
    elapsed.current *= wpmRef.current / clamped;
    onWpmChange(clamped);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
      if (e.code === "Space") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.code === "ArrowUp") {
        e.preventDefault();
        changeWpm(wpmRef.current + 10);
      } else if (e.code === "ArrowDown") {
        e.preventDefault();
        changeWpm(wpmRef.current - 10);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const paragraphs = text.split(/\n\s*\n/);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-2xl border border-line bg-black/75 backdrop-blur-md">
      <div
        ref={viewRef}
        className="h-full w-full overflow-hidden px-8"
        style={{
          maskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 70%, transparent 100%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 18%, black 70%, transparent 100%)",
        }}
      >
        <div ref={contentRef} className="will-change-transform" style={{ transform: "translateY(30%)" }}>
          {paragraphs.map((p, i) => (
            <p key={i} className="mb-6 text-2xl font-semibold leading-snug text-white md:text-3xl xl:text-4xl">
              {p.split(CUE).map((part, j) =>
                CUE.test(part) ? (
                  <span key={j} className="mx-1 align-middle text-base font-bold uppercase tracking-wider text-signal md:text-lg">
                    {part.slice(1, -1)}
                  </span>
                ) : (
                  <span key={j}>{part}</span>
                ),
              )}
            </p>
          ))}
        </div>
      </div>

      {/* čítacia linka */}
      <div className="pointer-events-none absolute inset-x-0 top-[30%] border-t border-signal/40" />

      <div className="absolute bottom-2 right-3 flex items-center gap-2 text-xs text-white/70">
        {paused && <span className="font-bold uppercase tracking-widest text-marker">Pozastavené · medzerník</span>}
        <button onClick={() => changeWpm(wpm - 10)} className="rounded bg-line px-2 py-1 hover:bg-line-strong" aria-label="Pomalšie">
          −
        </button>
        <span className="w-20 text-center font-mono">{wpm} sl/min</span>
        <button onClick={() => changeWpm(wpm + 10)} className="rounded bg-line px-2 py-1 hover:bg-line-strong" aria-label="Rýchlejšie">
          +
        </button>
        <button onClick={() => setPaused((p) => !p)} className="rounded bg-line px-2 py-1 hover:bg-line-strong">
          {paused ? "Pokračovať" : "Pauza"}
        </button>
      </div>
    </div>
  );
}
