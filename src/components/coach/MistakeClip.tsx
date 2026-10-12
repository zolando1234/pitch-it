"use client";

import { useRef, useState } from "react";

/** pred chybou ukážeme ešte kúsok, aby bolo vidno, ako vznikla */
const LEAD_MS = 1500;
const TAIL_MS = 1000;
/** dlhé chyby (napr. ruky dole celú minútu) skrátime */
const MAX_CLIP_MS = 12_000;

type Props = {
  src: string;
  /** fotka z momentu chyby (so siluetou), zobrazí sa, kým klip nehrá */
  snapshot: string | null;
  startMs: number;
  endMs: number;
  alt: string;
};

/** Prehrá z nahrávky tréningu len úsek s chybou, dookola, kým ho nezastavíš. */
export default function MistakeClip({ src, snapshot, startMs, endMs, alt }: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle");
  const [progress, setProgress] = useState(0);
  const from = Math.max(0, startMs - LEAD_MS) / 1000;
  const to = Math.min(endMs + TAIL_MS, startMs + MAX_CLIP_MS) / 1000;

  const play = async () => {
    const v = ref.current;
    if (!v) return;
    if (state === "playing") {
      v.pause();
      setState("idle");
      return;
    }
    setState("loading");
    if (v.readyState < 1) {
      v.load();
      await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
    }
    v.currentTime = from;
    try {
      await v.play();
      setState("playing");
    } catch {
      setState("idle");
    }
  };

  const onTime = () => {
    const v = ref.current;
    if (!v) return;
    setProgress(Math.min(1, Math.max(0, (v.currentTime - from) / (to - from))));
    // na konci úseku sa vrátime na začiatok a hráme ďalej (slučka)
    if (v.currentTime >= to) v.currentTime = from;
  };

  return (
    <button onClick={play} className="group relative block aspect-video w-full overflow-hidden bg-panel" aria-label={alt}>
      {/* nahrávka je nezrkadlená, zobrazíme ju zrkadlovo ako počas tréningu */}
      <video
        ref={ref}
        src={src}
        preload="none"
        muted
        playsInline
        onTimeUpdate={onTime}
        className="absolute inset-0 h-full w-full -scale-x-100 object-cover"
      />
      {state !== "playing" &&
        (snapshot ? (
          // eslint-disable-next-line @next/next/no-img-element -- lokálny data URL z kamery
          <img src={snapshot} alt={alt} className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-panel" />
        ))}
      {state !== "playing" && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-black/70 text-2xl text-paper ring-2 ring-white/70 transition group-hover:scale-110 group-hover:bg-signal group-hover:text-on-signal">
            {state === "loading" ? "…" : "▶"}
          </span>
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 h-1 bg-black/50">
        <span className="block h-full bg-signal" style={{ width: `${progress * 100}%` }} />
      </span>
    </button>
  );
}
