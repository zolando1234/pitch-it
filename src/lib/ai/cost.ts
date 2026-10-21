/*
  Ceny AI služieb v USD (verejné cenníky, odhad: skutočnú faktúru určuje dodávateľ).
  Čisté funkcie, testované.
*/

/** USD za 1 milión tokenov: [vstup, výstup] */
const LLM_USD_PER_MTOK: Array<{ match: RegExp; input: number; output: number }> = [
  { match: /opus/i, input: 4, output: 20 },
  { match: /haiku-5/i, input: 0.1, output: 0.5 },
  { match: /haiku/i, input: 1, output: 5 },
  { match: /sonnet/i, input: 2, output: 10 },
];
const LLM_FALLBACK = { input: 2, output: 10 };

/** ElevenLabs Scribe: USD za hodinu zvuku (odhad podľa cenníka) */
export const STT_USD_PER_HOUR = 0.4;

export function llmCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = LLM_USD_PER_MTOK.find((p) => p.match.test(model)) ?? LLM_FALLBACK;
  return (inputTokens * price.input + outputTokens * price.output) / 1_000_000;
}

export function sttCostUsd(seconds: number): number {
  return (Math.max(0, seconds) / 3600) * STT_USD_PER_HOUR;
}
