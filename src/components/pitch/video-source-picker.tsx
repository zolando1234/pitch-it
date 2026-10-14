"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/i18n/locale-provider";

/*
  Zdroj prejavu: živá kamera alebo nahraté video zo súboru. Video sa nikam neposiela:
  reč tela sa analyzuje v prehliadači počas prehrávania, na server ide len zvuk a súhrn.
  Pri videu sa dá vybrať, či ho chce človek sledovať so živými radami, alebo len výsledok.
*/

export type VideoAnalysis = "quick" | "live";

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Dĺžka videa v sekundách (prečíta sa z metadát bez prehrávania). */
function readDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    video.preload = "metadata";
    video.onloadedmetadata = () => done(Number.isFinite(video.duration) ? video.duration : null);
    video.onerror = () => done(null);
    video.src = url;
  });
}

export function VideoSourcePicker({
  file,
  onFile,
  useVideo,
  onUseVideo,
  maxSeconds,
  analysis,
  onAnalysis,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  /** true = nahraté video, false = kamera */
  useVideo: boolean;
  onUseVideo: (on: boolean) => void;
  /** najdlhšie analyzované video (podľa plánu) */
  maxSeconds: number;
  analysis: VideoAnalysis;
  onAnalysis: (value: VideoAnalysis) => void;
}) {
  const en = useLocale() === "en";
  const [duration, setDuration] = useState<number | null>(null);
  const [unreadable, setUnreadable] = useState(false);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    void readDuration(file).then((d) => {
      if (!alive) return;
      setDuration(d);
      setUnreadable(d === null);
    });
    return () => {
      alive = false;
    };
  }, [file]);

  const option = (active: boolean, title: string, text: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-w-0 flex-col rounded-2xl border-2 p-4 text-left transition ${active ? "border-signal bg-signal/10" : "border-line hover:border-faint"}`}
    >
      <span className="text-lg font-bold">{title}</span>
      <span className="mt-1 text-sm leading-snug text-mute">{text}</span>
    </button>
  );

  return (
    <section className="w-full rounded-3xl border border-line p-5 md:p-6" aria-labelledby="zdroj-nadpis">
      <h2 id="zdroj-nadpis" className="text-sm font-bold uppercase tracking-widest text-mute">
        {en ? "Recording" : "Nahrávka"}
      </h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {option(!useVideo, en ? "Record with camera now" : "Nahrať kamerou teraz", en ? "The coach gives you live tips while you pitch." : "Tréner ti radí naživo počas pitchu.", () => {
          onUseVideo(false);
          onFile(null);
        })}
        {option(
          useVideo,
          en ? "Upload a finished video" : "Nahrať hotové video",
          en ? "MP4, MOV or WebM from a phone or camera." : "MP4, MOV alebo WebM z mobilu či kamery.",
          () => onUseVideo(true),
        )}
      </div>

      {useVideo ? (
        <div className="mt-5">
          <div className="mb-5 grid gap-3 sm:grid-cols-2">
            {option(
              analysis === "quick",
              en ? "Just analyze" : "Len analyzovať",
              en ? "No need to watch. The video runs in the background and the report opens when it's done." : "Nemusíš pozerať. Video beží na pozadí a report sa otvorí, keď bude hotový.",
              () => onAnalysis("quick"),
            )}
            {option(
              analysis === "live",
              en ? "Live analysis" : "Živá analýza",
              en ? "Watch the video with the coach's tips and body tracking in real time." : "Pozeráš video so živými radami trénera a sledovaním tela.",
              () => onAnalysis("live"),
            )}
          </div>
          <label htmlFor="pitch-video" className="text-sm font-bold">
            {en ? "Choose a video" : "Vyber video"}
          </label>
          <input
            id="pitch-video"
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            onChange={(e) => {
              const next = e.target.files?.[0] ?? null;
              setDuration(null);
              setUnreadable(false);
              onFile(next);
            }}
            className="mt-2 block w-full text-sm text-mute file:mr-4 file:rounded-full file:border-0 file:bg-signal file:px-5 file:py-2.5 file:font-bold file:text-on-signal hover:file:bg-signal-hover"
          />
          {file ? (
            <p className="mt-3 text-sm text-paper">
              <b>{file.name}</b>
              {duration !== null ? <span className="text-mute"> · {fmt(duration)}</span> : null}
            </p>
          ) : (
            <p className="mt-3 text-xs text-faint">
              {en
                ? "The speaker should face the camera, at least down to the waist. The video is not uploaded, it is analyzed in your browser."
                : "Rečník by mal byť v zábere spredu, aspoň po pás. Video sa nikam neposiela, analyzuje sa v tvojom prehliadači."}
            </p>
          )}
          {unreadable ? (
            <p role="alert" className="mt-2 text-sm text-coral">
              {en ? "The browser can't open this video. Try MP4 (H.264), for example an export from your phone." : "Toto video prehliadač nevie otvoriť. Skús MP4 (H.264), napríklad export z mobilu."}
            </p>
          ) : duration !== null && duration > maxSeconds ? (
            <p className="mt-2 text-sm text-marker" role="status">
              {en
                ? `The video is ${fmt(duration)} long. We analyze the first ${fmt(maxSeconds)}${maxSeconds <= 180 ? ", longer videos are in the paid version" : ""}.`
                : `Video má ${fmt(duration)}. Analyzujeme prvé ${fmt(maxSeconds)}${maxSeconds <= 180 ? ", dlhšie videá sú v platenej verzii" : ""}.`}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
