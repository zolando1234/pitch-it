import "server-only";

import { getLlmProvider } from "@/lib/ai/llm/anthropic";
import { LlmError } from "@/lib/ai/llm/types";
import { documentsForSummary, SUMMARY_MAX, SUMMARY_SYSTEM, summarySchema, type PitchContext } from "@/lib/pitch/context";

/** Krátky výťah faktov z dokumentov; pri chybe prázdny (prompty potom vezmú začiatok textov). */
export async function summarizeContext(context: PitchContext): Promise<string> {
  const llm = getLlmProvider();
  if (!llm) return "";
  try {
    const result = await llm.generateStructured({
      purpose: "context_summary",
      system: SUMMARY_SYSTEM,
      messages: [{ role: "user", content: documentsForSummary(context.documents) }],
      schema: summarySchema,
      effort: "low",
      maxTokens: 800,
      speed: "interactive",
    });
    return result.data.facts.slice(0, SUMMARY_MAX);
  } catch (error) {
    console.error("[kontext] výťah zlyhal:", error instanceof LlmError ? error.code : error);
    return "";
  }
}

