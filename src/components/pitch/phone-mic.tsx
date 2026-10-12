"use client";

import "@/styles/screens/record.css";
import { useEffect, useRef, useState } from "react";
import { PI_BACKGROUND } from "@/components/pitch/pi-topbar";
import { useLocale } from "@/components/i18n/locale-provider";
import { Wordmark } from "@/components/wordmark";
import { ICE_SERVERS, readLink, sleep, waitForIce } from "@/lib/mic/webrtc";

/*
  Mobil ako mikrofón: zapne mikrofón a pošle zvuk priamo do prehliadača počítača (WebRTC).
  Nič sa neukladá, nahráva až počítač.
*/

type State = "idle" | "connecting" | "live" | "ended" | "error";

const OFFER_WAIT_MS = 60_000;

type WakeLockSentinelLike = { release: () => Promise<void> };

export function PhoneMic({ code }: { code: string }) {
  const en = useLocale() === "en";
  const L = (sk: string, enText: string) => (en ? enText : sk);
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const ctxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef(0);
  const wakeRef = useRef<WakeLockSentinelLike | null>(null);

  const cleanup = () => {
    cancelAnimationFrame(rafRef.current);
    pcRef.current?.close();
    pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    void wakeRef.current?.release().catch(() => {});
    wakeRef.current = null;
    setLevel(0);
  };

  useEffect(() => cleanup, []);

  const fail = (text: string) => {
    cleanup();
    setMessage(text);
    setState("error");
  };

  const connect = async () => {
    setMessage(null);
    setState("connecting");

    if (!navigator.mediaDevices?.getUserMedia) {
      return fail(L("Tento prehliadač nevie zapnúť mikrofón. Otvor odkaz v Safari alebo Chrome (stránka musí byť cez https).", "This browser can't turn on the microphone. Open the link in Safari or Chrome (the page must use https)."));
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch {
      return fail(L("Prístup k mikrofónu je zamietnutý. Povoľ ho v nastaveniach prehliadača a skús znova.", "Microphone access is denied. Allow it in your browser settings and try again."));
    }
    streamRef.current = stream;

    // úroveň hlasu, aby bolo vidno, že mobil počuje
    const ctx = new AudioContext();
    ctxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let last = 0;
    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick);
      if (now - last < 60) return;
      last = now;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += ((v - 128) / 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) * 4));
    };
    rafRef.current = requestAnimationFrame(tick);

    // ponuka od počítača
    let offer: string | null = null;
    const until = Date.now() + OFFER_WAIT_MS;
    while (!offer && Date.now() < until) {
      const link = await readLink(code);
      if ("error" in link) return fail(link.error);
      if (link.answer) return fail(L("K počítaču je už pripojený iný mobil. Na počítači vygeneruj nový odkaz.", "Another phone is already connected to the computer. Create a new link on the computer."));
      offer = link.offer;
      if (!offer) await sleep(1500);
    }
    if (!offer) return fail(L("Počítač zatiaľ nie je pripravený. Nechaj na ňom otvorenú obrazovku nahrávania a skús znova.", "The computer isn't ready yet. Keep the recording screen open on it and try again."));

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    stream.getAudioTracks().forEach((track) => pc.addTrack(track, stream));
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setState("live");
      else if (pc.connectionState === "failed") fail(L("Spojenie s počítačom zlyhalo. Skús, či sú mobil aj počítač na rovnakej Wi-Fi.", "The connection to the computer failed. Check that the phone and the computer are on the same Wi-Fi."));
      else if (pc.connectionState === "disconnected") {
        cleanup();
        setMessage(L("Počítač sa odpojil.", "The computer disconnected."));
        setState("ended");
      }
    };
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: offer });
      await pc.setLocalDescription(await pc.createAnswer());
    } catch {
      return fail(L("Spojenie s počítačom sa nepodarilo pripraviť. Na počítači vygeneruj nový odkaz.", "The connection to the computer couldn't be prepared. Create a new link on the computer."));
    }
    await waitForIce(pc);
    try {
      const response = await fetch(`/api/mikrofon/${code}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: pc.localDescription?.sdp ?? "" }),
      });
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      if (!response.ok) return fail(data?.error?.message ?? L("Spojenie s počítačom zlyhalo.", "The connection to the computer failed."));
    } catch {
      return fail(L("Nepodarilo sa spojiť so serverom.", "Could not connect to the server."));
    }

    // obrazovka mobilu nesmie zhasnúť, inak sa mikrofón vypne
    try {
      const wake = (navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinelLike> } }).wakeLock;
      wakeRef.current = (await wake?.request("screen")) ?? null;
    } catch {
      // bez wake lock treba nechať obrazovku zapnutú ručne
    }
  };

  const disconnect = () => {
    cleanup();
    setMessage(L("Mikrofón je vypnutý.", "The microphone is off."));
    setState("ended");
  };

  const live = state === "live";

  return (
    <div className="pi-rec flex min-h-dvh flex-col" style={{ background: PI_BACKGROUND, color: "var(--color-paper)" }}>
      <header className="px-6 py-5">
        <Wordmark />
      </header>
      <main id="obsah" className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 pb-16">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.3em] text-accent">{L("Mobil ako mikrofón", "Phone as microphone")}</p>
          <h1 className="h mt-3 text-4xl leading-tight">
            {live ? L("Mikrofón je zapnutý.", "The microphone is on.") : state === "connecting" ? L("Pripájam k počítaču…", "Connecting to the computer…") : L("Zapni mikrofón.", "Turn on the microphone.")}
          </h1>
          <p className="mt-3 text-lg text-mute">
            {live
              ? L("Hovor normálne, zvuk ide do počítača. Mobil drž pri ústach alebo si ho daj do vrecka na hrudi a nechaj obrazovku zapnutú.", "Speak normally, the sound goes to the computer. Hold the phone at your mouth or put it in a chest pocket, and keep the screen on.")
              : L("Zvuk z mobilu pôjde priamo do počítača, kde beží nahrávanie. Nikam sa neukladá.", "The sound from your phone goes straight to the computer where the recording runs. It isn't stored anywhere.")}
          </p>
        </div>

        <div className="h-3 overflow-hidden rounded-full bg-line" aria-hidden="true">
          <div className="h-full rounded-full bg-signal transition-[width] duration-75" style={{ width: `${Math.round(level * 100)}%` }} />
        </div>

        {message ? (
          <p role={state === "error" ? "alert" : "status"} className={state === "error" ? "text-coral" : "text-mute"}>
            {message}
          </p>
        ) : null}

        {live ? (
          <button type="button" className="btn" onClick={disconnect} style={{ minHeight: "56px" }}>{L("Vypnúť mikrofón", "Turn off microphone")}</button>
        ) : (
          <button type="button" className="btn btn-p" onClick={() => void connect()} disabled={state === "connecting"} style={{ minHeight: "56px", opacity: state === "connecting" ? 0.6 : 1 }}>
            {state === "connecting" ? L("Pripájam…", "Connecting…") : state === "idle" ? L("Zapnúť mikrofón", "Turn on microphone") : L("Pripojiť znova", "Connect again")}
          </button>
        )}
      </main>
    </div>
  );
}
