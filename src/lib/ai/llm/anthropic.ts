import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { getAnthropicConfig, type AnthropicConfig } from "@/config/server-env";
import { fitToSchema } from "@/lib/ai/llm/fit-schema";
import { LlmError, type LlmProvider, type StructuredRequest, type StructuredResult } from "@/lib/ai/llm/types";

/*
  Claude (Sonnet 5.5) cez oficiálne SDK. Štruktúrovaný výstup: JSON schéma zo zod. Odpoveď sa pred
  kontrolou schémou opraví (príliš dlhý text sa skráti, nadbytočné položky sa vynechajú), aby kvôli
  prekročeniu limitu o pár znakov nepadol celý rozbor; neplatný výstup sa raz zopakuje.
  Server-side fallback pri odmietnutí z bezpečnostných dôvodov ("default" podľa kategórie).
*/

const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export class AnthropicLlmProvider implements LlmProvider {
  readonly id = "anthropic";
  private readonly config: AnthropicConfig;
  private readonly client: Anthropic;

  constructor(config: AnthropicConfig) {
    this.config = config;
    this.client = new Anthropic({
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
      maxRetries: 2,
      timeout: 5 * 60 * 1000,
    });
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const model = request.speed === "interactive" ? this.config.fastModel : this.config.model;
    // schéma pre API (bez nepodporovaných obmedzení) a pôvodná schéma s limitmi na opravu výstupu
    const apiSchema = betaZodOutputFormat(request.schema).schema;
    const fullSchema = z.toJSONSchema(request.schema, { unrepresentable: "any" }) as Record<string, unknown>;
    delete fullSchema.$schema;

    const content = (message: StructuredRequest<T>["messages"][number], index: number) => {
      // Dokumenty patria pred text prvej správy používateľa.
      if (index === 0 && message.role === "user" && request.documents?.length) {
        return [
          ...request.documents.map((document) => ({
            type: "document" as const,
            title: document.title,
            source: { type: "base64" as const, media_type: "application/pdf" as const, data: document.base64 },
          })),
          { type: "text" as const, text: message.content },
        ];
      }
      return message.content;
    };
    const baseMessages = request.messages.map((message, index) => ({ role: message.role, content: content(message, index) }));

    try {
      let lastError = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        const messages =
          attempt === 0 ? baseMessages : [...baseMessages, { role: "user" as const, content: `Predchádzajúca odpoveď nebola platná (${lastError}). Vráť opravený JSON.` }];
        const response = await this.client.beta.messages.create({
          model,
          max_tokens: request.maxTokens ?? 16_000,
          betas: [FALLBACK_BETA],
          fallbacks: "default",
          system: request.system,
          messages,
          output_config: { effort: request.effort ?? "medium", format: { type: "json_schema", schema: apiSchema } },
        });

        if (response.stop_reason === "refusal") throw new LlmError("refusal", "Model požiadavku odmietol.");
        if (response.stop_reason === "max_tokens") throw new LlmError("invalid_output", "Odpoveď modelu bola príliš dlhá a skrátila sa.");

        const text = response.content.map((block) => (block.type === "text" ? block.text : "")).join("");
        let json: unknown;
        try {
          json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        } catch {
          lastError = "neplatný JSON";
          continue;
        }
        const parsed = request.schema.safeParse(fitToSchema(json, fullSchema));
        if (!parsed.success) {
          lastError = parsed.error.issues
            .slice(0, 3)
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");
          continue;
        }
        return {
          data: parsed.data,
          model: response.model,
          usage: { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens },
        };
      }
      throw new LlmError("invalid_output", `Model nevrátil platný štruktúrovaný výstup (${lastError}).`);
    } catch (error) {
      if (error instanceof LlmError) throw error;
      if (error instanceof Anthropic.RateLimitError) throw new LlmError("rate_limited", "Limit volaní AI je dočasne vyčerpaný.");
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        throw new LlmError("not_configured", "Kľúč pre Anthropic API je neplatný.");
      }
      if (error instanceof Anthropic.BadRequestError) throw new LlmError("bad_request", error.message);
      if (error instanceof Anthropic.APIError) throw new LlmError("unavailable", `Anthropic API ${error.status ?? ""}`);
      if (error instanceof Anthropic.APIConnectionError) throw new LlmError("unavailable", "Spojenie s AI zlyhalo.");
      throw new LlmError("invalid_output", error instanceof Error ? error.message : "Neznáma chyba AI.");
    }
  }
}

let provider: LlmProvider | null | undefined;

/** Aktuálny LLM poskytovateľ (Claude) alebo null, ak nie je nakonfigurovaný. */
export function getLlmProvider(): LlmProvider | null {
  if (provider !== undefined) return provider;
  const config = getAnthropicConfig();
  provider = config ? new AnthropicLlmProvider(config) : null;
  return provider;
}

export function requireLlmProvider(): LlmProvider {
  const llm = getLlmProvider();
  if (!llm) throw new LlmError("not_configured", "AI analýza nie je nakonfigurovaná (chýba ANTHROPIC_API_KEY).");
  return llm;
}
