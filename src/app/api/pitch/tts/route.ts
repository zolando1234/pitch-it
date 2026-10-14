import { z } from "zod";
import { getElevenLabsTtsConfig } from "@/config/server-env";
import { apiError, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { PITCH_LANGUAGES } from "@/lib/pitch/language";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

const bodySchema = z.object({ text: z.string().trim().min(1).max(400), language: z.enum(PITCH_LANGUAGES) });

/** Otázka v Q&A nahlas (ElevenLabs). Bez služby prehliadač použije vlastný hlas. */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "pitch-tts", RATE_LIMITS.pitchQuestions);
  if (limited) return limited;
  const body = await parseJson(request, bodySchema);
  if (body instanceof Response) return body;
  const config = getElevenLabsTtsConfig();
  if (!config) return apiError(503, "not_configured", "Hlas nie je nakonfigurovaný.");
  try {
    const speak = (withLanguage: boolean) =>
      fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voiceId)}?output_format=mp3_44100_64`, {
        method: "POST",
        headers: { "xi-api-key": config.apiKey, "Content-Type": "application/json", Accept: "audio/mpeg" },
        body: JSON.stringify({ text: body.text, model_id: config.model, ...(withLanguage ? { language_code: body.language } : {}) }),
        signal: AbortSignal.timeout(30_000),
      });
    let response = await speak(true);
    // jazyk, ktorý model nepozná: hlas jazyk odhadne z textu
    if (response.status === 400 || response.status === 422) response = await speak(false);
    if (!response.ok || !response.body) {
      console.warn("[qa] hlas zlyhal:", response.status);
      return apiError(502, "unavailable", "Hlas sa nepodarilo pripraviť.");
    }
    return new Response(response.body, { headers: { "Content-Type": "audio/mpeg", "Cache-Control": "no-store" } });
  } catch (error) {
    return handleRouteError(error, "pitch.tts");
  }
}
