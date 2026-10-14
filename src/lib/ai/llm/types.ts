import type { z } from "zod";

/*
  Rozhranie jazykového modelu. Aplikácia volá iba toto rozhranie; konkrétny
  poskytovateľ (dnes Anthropic) je za ním vymeniteľný.
*/

export type LlmMessage = { role: "user" | "assistant"; content: string };

export type LlmDocument = { kind: "pdf"; base64: string; title: string };

export type LlmEffort = "low" | "medium" | "high";

export type StructuredRequest<T> = {
  /** Na čo volanie slúži (pre logy a metriky, nie pre model). */
  purpose: "deck_analysis" | "report" | "hint" | "text_investor" | "exercise_evaluation" | "exercise_generation" | "pitch_content" | "pitch_outline" | "qa_questions" | "qa_evaluation" | "context_summary";
  system: string;
  messages: LlmMessage[];
  schema: z.ZodType<T>;
  effort?: LlmEffort;
  maxTokens?: number;
  documents?: LlmDocument[];
  /** Rýchlejší model pre interaktívne volania (nápoveda, textový investor). */
  speed?: "default" | "interactive";
};

export type StructuredResult<T> = {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
};

export class LlmError extends Error {
  constructor(
    readonly code: "not_configured" | "refusal" | "invalid_output" | "rate_limited" | "unavailable" | "bad_request",
    message: string,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmProvider {
  readonly id: string;
  generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>>;
}
