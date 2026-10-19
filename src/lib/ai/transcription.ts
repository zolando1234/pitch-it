import "server-only";

import { getElevenLabsSttConfig, getOpenAiRealtimeConfig } from "@/config/server-env";
import { LANGUAGE_INFO, sttOrder, type PitchLanguage, type SttProvider } from "@/lib/pitch/language";

/*
  Prepis krátkej nahrávky z cvičenia (OpenAI Audio API, bez kľúča ElevenLabs Scribe).
  Nahrávka sa neukladá: pošle sa na prepis a zahodí sa.
*/

export class TranscriptionError extends Error {
  constructor(readonly code: "not_configured" | "unavailable" | "rejected", message: string) {
    super(message);
    this.name = "TranscriptionError";
  }
}

export function isTranscriptionConfigured(): boolean {
  return getOpenAiRealtimeConfig() !== null || getElevenLabsSttConfig() !== null;
}

export async function transcribeAudio(audio: Blob, fileName: string, language: "sk" | "en"): Promise<string> {
  const config = getOpenAiRealtimeConfig();
  if (!config) return (await transcribeWithElevenLabs(audio, fileName, language)).text;

  const form = new FormData();
  form.set("file", audio, fileName);
  form.set("model", config.transcriptionModel);
  form.set("language", language);
  form.set("response_format", "json");

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    throw new TranscriptionError("unavailable", "Služba prepisu je nedostupná.");
  }
  if (!response.ok) {
    throw new TranscriptionError(response.status >= 500 ? "unavailable" : "rejected", `Prepis zlyhal (${response.status}).`);
  }
  const data = (await response.json()) as { text?: unknown };
  return typeof data.text === "string" ? data.text.trim() : "";
}

/** speaker: rečník slova (len pri rozpoznávaní rečníkov, napr. „speaker_0“) */
export type TimedTranscript = { text: string; words: Array<{ word: string; start: number; end: number; speaker?: string }> };

/** Nápoveda pre Whisper, aby zachoval zaváhania (inak ich vynecháva). */
const HESITATION_HINT: Partial<Record<PitchLanguage, string>> = {
  sk: "Ehm, takže, akože… vlastne, no, eee.",
  cs: "Ehm, takže, jakoby… vlastně, no, eee.",
  en: "Um, uh, so, like… you know, basically.",
  de: "Äh, ähm, also, halt… sozusagen, quasi.",
  pl: "Yyy, eee, no, jakby… w sumie, generalnie.",
  hu: "Ööö, hát, szóval… izé, ugye.",
};

/**
 * Prepis nahraného pitchu so slovnými časmi (pauzy a tempo). Model sa vyberie podľa jazyka
 * (pozri LANGUAGE_INFO.stt); keď zlyhá, skúsi sa ďalší nakonfigurovaný.
 */
export async function transcribeWithWords(
  audio: Blob,
  fileName: string,
  language: PitchLanguage,
  /** skutočné stretnutie: rozlíšiť rečníkov (vie len ElevenLabs Scribe) */
  options: { diarize?: boolean } = {},
): Promise<TimedTranscript & { provider: SttProvider }> {
  const order = sttOrder(language, {
    elevenlabs: getElevenLabsSttConfig() !== null,
    openai: getOpenAiRealtimeConfig() !== null,
  });
  if (!order.length) throw new TranscriptionError("not_configured", "Prepis reči nie je nakonfigurovaný.");
  let lastError: unknown = null;
  for (const provider of order) {
    try {
      const result =
        provider === "elevenlabs"
          ? await transcribeWithElevenLabs(audio, fileName, language, options.diarize ?? false)
          : await transcribeWithWhisper(audio, fileName, language);
      return { ...result, provider };
    } catch (error) {
      lastError = error;
      console.warn(`[prepis] ${provider} zlyhal, skúšam ďalší model:`, error instanceof TranscriptionError ? error.code : error);
    }
  }
  throw lastError instanceof TranscriptionError ? lastError : new TranscriptionError("unavailable", "Služba prepisu je nedostupná.");
}

/** ElevenLabs Scribe: zadaný jazyk aj časy slov v jednej požiadavke. */
async function transcribeWithElevenLabs(audio: Blob, fileName: string, language: PitchLanguage, diarize = false): Promise<TimedTranscript> {
  const config = getElevenLabsSttConfig();
  if (!config) throw new TranscriptionError("not_configured", "Prepis reči nie je nakonfigurovaný.");
  const form = new FormData();
  form.set("file", audio, fileName);
  form.set("model_id", config.model);
  form.set("language_code", LANGUAGE_INFO[language].scribe);
  form.set("timestamps_granularity", "word");
  form.set("tag_audio_events", "false");
  if (diarize) form.set("diarize", "true");

  let response: Response;
  try {
    response = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
      method: "POST",
      headers: { "xi-api-key": config.apiKey },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new TranscriptionError("unavailable", "Služba prepisu je nedostupná.");
  }
  if (!response.ok) {
    throw new TranscriptionError(response.status >= 500 || response.status === 429 ? "unavailable" : "rejected", `Prepis zlyhal (${response.status}).`);
  }
  const data = (await response.json()) as { text?: unknown; words?: unknown };
  const words = Array.isArray(data.words)
    ? data.words
        .filter(
          (w): w is { text: string; start: number; end: number; type?: string; speaker_id?: string | null } =>
            typeof w === "object" &&
            w !== null &&
            typeof (w as { text?: unknown }).text === "string" &&
            typeof (w as { start?: unknown }).start === "number" &&
            typeof (w as { end?: unknown }).end === "number",
        )
        .filter((w) => (w.type ?? "word") === "word")
        .map((w) => ({ word: w.text.trim(), start: w.start, end: w.end, ...(diarize && w.speaker_id ? { speaker: w.speaker_id } : {}) }))
        .filter((w) => w.word)
    : [];
  return { text: typeof data.text === "string" ? data.text.trim() : "", words };
}

/** OpenAI Whisper (verbose_json). Model gpt-4o-transcribe časy slov nevracia, preto pevne whisper-1. */
async function transcribeWithWhisper(audio: Blob, fileName: string, language: PitchLanguage): Promise<TimedTranscript> {
  const config = getOpenAiRealtimeConfig();
  if (!config) throw new TranscriptionError("not_configured", "Prepis reči nie je nakonfigurovaný.");

  const form = new FormData();
  form.set("file", audio, fileName);
  form.set("model", "whisper-1");
  form.set("language", language);
  form.set("response_format", "verbose_json");
  form.append("timestamp_granularities[]", "word");
  form.append("timestamp_granularities[]", "segment");
  // Nápoveda, aby model zachoval zaváhania (inak ich vynecháva).
  const hint = HESITATION_HINT[language];
  if (hint) form.set("prompt", hint);

  let response: Response;
  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new TranscriptionError("unavailable", "Služba prepisu je nedostupná.");
  }
  if (!response.ok) {
    throw new TranscriptionError(response.status >= 500 ? "unavailable" : "rejected", `Prepis zlyhal (${response.status}).`);
  }
  const data = (await response.json()) as { text?: unknown; words?: unknown };
  const words = Array.isArray(data.words)
    ? data.words
        .filter((w): w is { word: string; start: number; end: number } =>
          typeof w === "object" && w !== null && typeof (w as { word?: unknown }).word === "string" && typeof (w as { start?: unknown }).start === "number" && typeof (w as { end?: unknown }).end === "number",
        )
        .map((w) => ({ word: w.word.trim(), start: w.start, end: w.end }))
    : [];
  return { text: typeof data.text === "string" ? data.text.trim() : "", words };
}
