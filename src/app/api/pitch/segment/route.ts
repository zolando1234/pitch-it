import { TranscriptionError, transcribeWithWords } from "@/lib/ai/transcription";
import { getPitchAttempt } from "@/lib/db/pitch";
import { getPitchBalance } from "@/lib/db/pitch-wallet";
import { apiError, apiOk, handleRouteError, isUuid, rateLimited, requireApiUser } from "@/lib/http/route";
import { parseLanguage } from "@/lib/pitch/language";
import { MAX_SEGMENTS } from "@/lib/pitch/segment-merge";
import { implausibleTranscript, wavSeconds } from "@/lib/pitch/transcript-sanity";
import { saveSegment } from "@/lib/pitch/segments";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

export const maxDuration = 120;

/** Úsek zvuku (~30 s WAV) najviac 4 MB, aby prešiel limitom požiadavky na Verceli. */
const MAX_SEGMENT_BYTES = 4 * 1024 * 1024;

/** Q&A sa nahráva po prejave, keď už môže byť posledný pitch minutý. */
async function isFreshOwnAttempt(userId: string, attemptId: string): Promise<boolean> {
  if (!isUuid(attemptId)) return false;
  const attempt = await getPitchAttempt(attemptId);
  return !!attempt && attempt.user_id === userId && Date.now() - Date.parse(attempt.created_at) < 3 * 60 * 60 * 1000;
}

/**
 * Priebežný prepis: úsek nahrávky sa prepíše hneď počas prejavu a uloží sa ku konceptu.
 * Analýza na konci tak čaká len na posledný úsek.
 */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "pitch-segment", RATE_LIMITS.pitchSegment);
  if (limited) return limited;

  try {
    const form = await request.formData();
    const audio = form.get("audio");
    const draftId = String(form.get("draftId") ?? "");
    const index = Number(form.get("index"));
    const offsetMs = Number(form.get("offsetMs"));
    if (!(audio instanceof Blob) || audio.size === 0 || audio.size > MAX_SEGMENT_BYTES) return apiError(400, "invalid_request", "Neplatný úsek nahrávky.");
    if (!isUuid(draftId) || !Number.isInteger(index) || index < 0 || index >= MAX_SEGMENTS || !Number.isFinite(offsetMs) || offsetMs < 0) {
      return apiError(400, "invalid_request", "Neplatný úsek nahrávky.");
    }
    // prepis stojí peniaze: len pre toho, kto ešte môže pitchovať, alebo odpovede v Q&A k vlastnému čerstvému pitchu
    const attemptId = String(form.get("attemptId") ?? "");
    if (!(attemptId ? await isFreshOwnAttempt(user.id, attemptId) : (await getPitchBalance(user.id)).canPitch)) {
      return apiError(402, "limit_reached", "Nemáš žiadne pitche.");
    }

    const language = parseLanguage(form.get("language"));
    let transcript: Awaited<ReturnType<typeof transcribeWithWords>>;
    try {
      // skutočné stretnutie: rozlíšiť rečníkov (ty a klient)
      const transcribe = () => transcribeWithWords(audio, `segment-${index}.wav`, language, { diarize: form.get("diarize") === "1" });
      transcript = await transcribe();
      // zmes náhodných slov (nemožne veľa slov za sekundu): raz zopakujeme, potom necháme prehliadač skúsiť úsek znova
      const seconds = wavSeconds(audio.size);
      if (implausibleTranscript(transcript.words.length, seconds)) {
        console.warn(`[pitch] podozrivý prepis úseku (${transcript.words.length} slov za ${Math.round(seconds)} s), opakujem`);
        transcript = await transcribe();
        if (implausibleTranscript(transcript.words.length, seconds)) return apiError(503, "transcription_failed", "Úsek sa nepodarilo prepísať.");
      }
    } catch (error) {
      console.warn("[pitch] prepis úseku zlyhal:", error instanceof TranscriptionError ? error.code : error);
      return apiError(503, "transcription_failed", "Úsek sa nepodarilo prepísať.");
    }
    await saveSegment(user.id, draftId, { index, offsetMs, text: transcript.text, words: transcript.words, provider: transcript.provider });
    return apiOk({ ok: true, words: transcript.words.length });
  } catch (error) {
    return handleRouteError(error, "pitch.segment");
  }
}
