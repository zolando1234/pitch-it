import "server-only";

import { llmCostUsd, sttCostUsd } from "@/lib/ai/cost";
import { getAdminDb } from "@/lib/store/client";

/*
  Denník nákladov na AI: každé volanie Claude (tokeny) a každý prepis reči (sekundy zvuku).
  Zápis nikdy nezhodí požiadavku používateľa.
*/

async function insert(row: Record<string, unknown>) {
  try {
    const { error } = await getAdminDb().from("ai_usage").insert(row);
    if (error) console.error("[ai_usage]", error.message);
  } catch (error) {
    console.error("[ai_usage]", error instanceof Error ? error.message : error);
  }
}

export function logLlmUsage(input: { purpose: string; model: string; inputTokens: number; outputTokens: number }): Promise<void> {
  return insert({
    kind: "llm",
    purpose: input.purpose,
    model: input.model,
    input_tokens: input.inputTokens,
    output_tokens: input.outputTokens,
    seconds: 0,
    cost_usd: llmCostUsd(input.model, input.inputTokens, input.outputTokens),
  });
}

export function logSttUsage(input: { model: string; seconds: number }): Promise<void> {
  return insert({ kind: "stt", purpose: "stt", model: input.model, input_tokens: 0, output_tokens: 0, seconds: input.seconds, cost_usd: sttCostUsd(input.seconds) });
}
