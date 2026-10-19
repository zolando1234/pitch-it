/*
  Pravidlá stráženia ticha počas nahrávania (čistá funkcia, testovaná):
  po `silenceMs` bez hlasu sa opýtame, či je človek ešte tam, a ak neodpovie do `graceMs`, ukončíme.
*/

export const SILENCE_MS = 60_000;
export const GRACE_MS = 30_000;
/** hlasitosť (0–1), od ktorej sa berie, že človek hovorí; ticho v miestnosti býva pod 0,03 */
export const VOICE_LEVEL = 0.08;

export type SilenceStep =
  | { kind: "quiet" }
  | { kind: "ask" }
  | { kind: "wait"; secondsLeft: number }
  | { kind: "timeout"; idleMs: number };

export function silenceStep(input: { now: number; lastVoice: number; askedAt: number | null; silenceMs?: number; graceMs?: number }): SilenceStep {
  const silenceMs = input.silenceMs ?? SILENCE_MS;
  const graceMs = input.graceMs ?? GRACE_MS;
  if (input.askedAt === null) return input.now - input.lastVoice >= silenceMs ? { kind: "ask" } : { kind: "quiet" };
  const left = graceMs - (input.now - input.askedAt);
  if (left <= 0) return { kind: "timeout", idleMs: Math.round(input.now - input.lastVoice) };
  return { kind: "wait", secondsLeft: Math.ceil(left / 1000) };
}
