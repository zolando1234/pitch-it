import "server-only";

import { z } from "zod";
import { fitToSchema } from "@/lib/ai/llm/fit-schema";
import { getMistralLlmConfig } from "@/config/server-env";
import { LlmError, type LlmProvider, type StructuredRequest, type StructuredResult } from "@/lib/ai/llm/types";

/*
  Mistral cez Chat Completions API. Štruktúrovaný výstup: JSON schéma zo zod,
  odpoveď sa overí zod schémou a pri neplatnom JSON sa raz zopakuje.
*/

const ENDPOINT = "https://api.mistral.ai/v1/chat/completions";
const TIMEOUT_MS = 90_000;

type ChatMessage = { role: "system" | "user" | "assistant"; content: string | Array<Record<string, unknown>> };

type ChatResponse = {
  model?: string;
  choices?: Array<{ message?: { content?: string | Array<{ type: string; text?: string }> }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export class MistralLlmProvider implements LlmProvider {
  readonly id = "mistral";

  private readonly config: { apiKey: string; model: string; fastModel: string };

  constructor(config: { apiKey: string; model: string; fastModel: string }) {
    this.config = config;
  }

  async generateStructured<T>(request: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const model = request.speed === "interactive" ? this.config.fastModel : this.config.model;
    const jsonSchema = z.toJSONSchema(request.schema, { unrepresentable: "any" }) as Record<string, unknown>;
    delete jsonSchema.$schema;

    const messages: ChatMessage[] = [
      { role: "system", content: `${request.system}\n\nOdpovedz iba platným JSON objektom podľa zadanej schémy.` },
      ...request.messages.map((message, index): ChatMessage => {
        // PDF dokumenty idú pred text prvej správy používateľa
        if (index === 0 && message.role === "user" && request.documents?.length) {
          return {
            role: "user",
            content: [
              ...request.documents.map((document) => ({ type: "document_url", document_url: `data:application/pdf;base64,${document.base64}`, document_name: document.title })),
              { type: "text", text: message.content },
            ],
          };
        }
        return { role: message.role, content: message.content };
      }),
    ];

    let lastError = "";
    for (let attempt = 0; attempt < 2; attempt++) {
      const response = await this.call({
        model,
        messages: attempt === 0 ? messages : [...messages, { role: "user", content: `Predchádzajúca odpoveď nebola platná (${lastError}). Vráť opravený JSON.` }],
        max_tokens: request.maxTokens ?? 16_000,
        temperature: 0.3,
        response_format: { type: "json_schema", json_schema: { name: "output", schema: jsonSchema, strict: false } },
      });
      const choice = response.choices?.[0];
      if (choice?.finish_reason === "length") throw new LlmError("invalid_output", "Odpoveď modelu bola príliš dlhá a skrátila sa.");
      const raw = choice?.message?.content;
      const text = typeof raw === "string" ? raw : (raw ?? []).map((part) => part.text ?? "").join("");
      let json: unknown;
      try {
        json = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        lastError = "neplatný JSON";
        continue;
      }
      // drobné prekročenia limitov (dlhší text, viac položiek) sa opravia, nezahodí sa celý výstup
      const parsed = request.schema.safeParse(fitToSchema(json, jsonSchema));
      if (!parsed.success) {
        lastError = parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ");
        continue;
      }
      return {
        data: parsed.data,
        model: response.model ?? model,
        usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
      };
    }
    throw new LlmError("invalid_output", `Model nevrátil platný štruktúrovaný výstup (${lastError}).`);
  }

  private async call(body: Record<string, unknown>): Promise<ChatResponse> {
    let response: Response;
    try {
      response = await fetch(ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new LlmError("unavailable", "Spojenie s AI zlyhalo.");
    }
    if (response.status === 429) throw new LlmError("rate_limited", "Limit volaní AI je dočasne vyčerpaný.");
    if (response.status === 401 || response.status === 403) throw new LlmError("not_configured", "Kľúč pre Mistral API je neplatný.");
    if (response.status === 400 || response.status === 422) throw new LlmError("bad_request", `Mistral API ${response.status}: ${(await response.text()).slice(0, 300)}`);
    if (!response.ok) throw new LlmError("unavailable", `Mistral API ${response.status}`);
    return (await response.json()) as ChatResponse;
  }
}

export function createMistralProvider(): MistralLlmProvider | null {
  const config = getMistralLlmConfig();
  return config ? new MistralLlmProvider(config) : null;
}
