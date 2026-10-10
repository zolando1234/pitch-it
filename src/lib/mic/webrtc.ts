/*
  Spoločné nastavenie WebRTC pre mobil ako mikrofón (iba v prehliadači).
  Bez TURN servera: spojenie funguje na rovnakej Wi-Fi a vo väčšine bežných sietí.
*/

export const ICE_SERVERS: RTCIceServer[] = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

/** Počká, kým prehliadač nazbiera kandidátov spojenia (najviac `timeoutMs`), aby stačila jedna výmena. */
export function waitForIce(pc: RTCPeerConnection, timeoutMs = 4000): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === "complete") done();
    };
    const timer = setTimeout(done, timeoutMs);
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function readLink(code: string): Promise<{ offer: string | null; answer: string | null } | { error: string }> {
  try {
    const response = await fetch(`/api/mikrofon/${code}`, { cache: "no-store" });
    const data = (await response.json().catch(() => null)) as { offer?: string | null; answer?: string | null; error?: { message?: string } } | null;
    if (!response.ok) return { error: data?.error?.message ?? "Spojenie zlyhalo." };
    return { offer: data?.offer ?? null, answer: data?.answer ?? null };
  } catch {
    return { error: "Nepodarilo sa spojiť so serverom." };
  }
}
