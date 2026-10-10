"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ICE_SERVERS, readLink, sleep, waitForIce } from "@/lib/mic/webrtc";

/*
  Počítač: vytvorí odkaz pre mobil, pošle WebRTC ponuku a čaká, kým sa mobil pripojí.
  Výsledkom je MediaStream so zvukom z mobilu, ktorý nahráva usePitchRecorder.
*/

export type PhoneMicState = "idle" | "creating" | "waiting" | "connected" | "lost" | "failed";

const POLL_MS = 1500;

export function usePhoneMic() {
  const [state, setState] = useState<PhoneMicState>("idle");
  const [link, setLink] = useState<string | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runRef = useRef(0);

  const stop = useCallback(() => {
    runRef.current++;
    pcRef.current?.close();
    pcRef.current = null;
    if (audioRef.current) audioRef.current.srcObject = null;
    setStream(null);
    setLink(null);
    setError(null);
    setState("idle");
  }, []);

  useEffect(() => () => {
    runRef.current++;
    pcRef.current?.close();
  }, []);

  const start = useCallback(async () => {
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    pcRef.current?.close();
    setStream(null);
    setError(null);
    setState("creating");

    const fail = (message: string) => {
      if (!alive()) return;
      setError(message);
      setState("failed");
    };

    let code: string;
    try {
      const response = await fetch("/api/mikrofon", { method: "POST" });
      const data = (await response.json().catch(() => null)) as { code?: string; error?: { message?: string } } | null;
      if (!response.ok || !data?.code) return fail(data?.error?.message ?? "Odkaz pre mobil sa nepodarilo vytvoriť.");
      code = data.code;
    } catch {
      return fail("Nepodarilo sa spojiť so serverom.");
    }
    if (!alive()) return;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pcRef.current = pc;
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (event) => {
      if (!alive()) return;
      const remote = event.streams[0] ?? new MediaStream([event.track]);
      // Chrome pustí zvuk zo vzdialeného spojenia do Web Audio (vlna) až keď ho prehráva prvok audio
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.muted = true;
      audio.srcObject = remote;
      void audio.play().catch(() => {});
      setStream(remote);
      setState("connected");
    };
    pc.onconnectionstatechange = () => {
      if (!alive()) return;
      if (pc.connectionState === "failed") fail("Mobil sa nepodarilo pripojiť. Skús, či sú mobil aj počítač na rovnakej Wi-Fi.");
      else if (pc.connectionState === "disconnected" || pc.connectionState === "closed") setState((s) => (s === "connected" ? "lost" : s));
      else if (pc.connectionState === "connected") setState("connected");
    };

    await pc.setLocalDescription(await pc.createOffer());
    await waitForIce(pc);
    if (!alive()) return;
    try {
      const response = await fetch(`/api/mikrofon/${code}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sdp: pc.localDescription?.sdp ?? "" }),
      });
      if (!response.ok) return fail("Odkaz pre mobil sa nepodarilo pripraviť.");
    } catch {
      return fail("Nepodarilo sa spojiť so serverom.");
    }
    if (!alive()) return;
    setLink(`${window.location.origin}/mikrofon/${code}`);
    setState("waiting");

    // čakáme na odpoveď mobilu
    while (alive()) {
      await sleep(POLL_MS);
      if (!alive()) return;
      const data = await readLink(code);
      if ("error" in data) return fail(data.error);
      if (data.answer) {
        try {
          await pc.setRemoteDescription({ type: "answer", sdp: data.answer });
        } catch {
          return fail("Mobil poslal neplatné spojenie. Vygeneruj nový odkaz.");
        }
        return;
      }
    }
  }, []);

  return { state, link, stream, error, start, stop };
}
