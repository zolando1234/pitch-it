import "server-only";

/*
  Serverové tajomstvá. Tento modul sa nesmie dostať do klientskeho bundlu.
  Nikdy nedávaj týmto premenným prefix NEXT_PUBLIC_.
*/

function read(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export type AnthropicConfig = { apiKey: string | null; model: string; fastModel: string };

/**
 * Claude: analýza decku, reporty, nápoveda, textový investor, hodnotenie cvičení.
 * apiKey môže byť null, ak sa SDK autentifikuje inak (napr. `ant auth login` lokálne);
 * pre produkciu nastav ANTHROPIC_API_KEY.
 */
export function getAnthropicConfig(): AnthropicConfig | null {
  const apiKey = read("ANTHROPIC_API_KEY");
  const enabled = apiKey !== null || read("ANTHROPIC_ENABLED") === "true";
  if (!enabled) return null;
  return {
    apiKey,
    model: read("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
    fastModel: read("ANTHROPIC_FAST_MODEL") ?? read("ANTHROPIC_MODEL") ?? "claude-opus-5-5",
  };
}

export type OpenAiRealtimeConfig = {
  apiKey: string;
  model: string;
  transcriptionModel: string;
  voice: string;
};

/** OpenAI Realtime: živý hlasový rozhovor a prepis. */
export function getOpenAiRealtimeConfig(): OpenAiRealtimeConfig | null {
  const apiKey = read("OPENAI_API_KEY");
  if (!apiKey) return null;
  return {
    apiKey,
    model: read("OPENAI_REALTIME_MODEL") ?? "gpt-realtime-2.1",
    transcriptionModel: read("OPENAI_TRANSCRIPTION_MODEL") ?? "gpt-4o-transcribe",
    voice: read("OPENAI_REALTIME_VOICE") ?? "cedar",
  };
}

/** ElevenLabs Scribe: prepis so zadaným jazykom aj časmi slov (slovenčina, čeština, …). */
export function getElevenLabsSttConfig(): { apiKey: string; model: string } | null {
  const apiKey = read("ELEVENLABS_API_KEY");
  return apiKey ? { apiKey, model: read("ELEVENLABS_STT_MODEL") ?? "scribe_v2" } : null;
}

/** Mistral (Voxtral): náhradný prepis, keď chýba OPENAI_API_KEY. */
export function getMistralTranscriptionConfig(): { apiKey: string; model: string } | null {
  const apiKey = read("MISTRAL_API_KEY");
  return apiKey ? { apiKey, model: read("MISTRAL_TRANSCRIPTION_MODEL") ?? "voxtral-mini-latest" } : null;
}

/** Mistral ako jazykový model, keď chýba ANTHROPIC_API_KEY. */
export function getMistralLlmConfig(): { apiKey: string; model: string; fastModel: string } | null {
  const apiKey = read("MISTRAL_API_KEY");
  if (!apiKey) return null;
  const model = read("MISTRAL_MODEL") ?? "mistral-medium-latest";
  return { apiKey, model, fastModel: read("MISTRAL_FAST_MODEL") ?? model };
}

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  /** mesačné predplatné Pro (voliteľné; balíky pitchov ho nepotrebujú) */
  proPriceId: string | null;
};

export function getStripeConfig(): StripeConfig | null {
  const secretKey = read("STRIPE_SECRET_KEY");
  const webhookSecret = read("STRIPE_WEBHOOK_SECRET");
  const proPriceId = read("STRIPE_PRICE_ID_PRO");
  return secretKey && webhookSecret ? { secretKey, webhookSecret, proPriceId } : null;
}

/** Tajomstvo na HMAC (napr. hash IP pri rate limite). */
export function getHashSalt(): string | null {
  return read("IP_HASH_SALT");
}
