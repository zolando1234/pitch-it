import { z } from "zod";
import { parseStoredCoach, storedCoachSchema } from "@/lib/coach/stored";
import { outlineInputSchema } from "@/lib/pitch/outline";
import { parseLanguage } from "@/lib/pitch/language";
import { parseLocale } from "@/lib/i18n/locale";
import { getLocale } from "@/lib/i18n/server";
import { analyzePitch, MAX_PITCH_AUDIO_BYTES, PitchServiceError } from "@/lib/pitch/service";
import { AUDIENCES } from "@/lib/onboarding/plan";
import { isValidLength, UNLIMITED_MAX_SECONDS } from "@/lib/billing/pitch-pack";
import { MAX_SEGMENTS } from "@/lib/pitch/segment-merge";
import { apiError, apiOk, handleRouteError, isUuid, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

// hodinový prejav: spojenie prepisu a rozbor trvajú dlhšie
export const maxDuration = 300;

const AUDIO_TYPES = new Set(["audio/wav", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "video/webm"]);

const metaSchema = z.object({
  durationMs: z.coerce.number().int().min(1_000).max(UNLIMITED_MAX_SECONDS * 1000 + 60_000),
  audience: z.enum(AUDIENCES),
  targetSeconds: z.coerce.number().int().refine(isValidLength),
  focus: z.enum(["tempo", "fillery", "obsah"]),
});

const visionSchema = z
  .array(
    z.object({
      t: z.number(),
      faceVisible: z.boolean(),
      faceCentered: z.boolean().nullable(),
      faceDistance: z.enum(["far", "ok", "close"]).nullable(),
      yawDeg: z.number().nullable(),
      pitchDeg: z.number().nullable(),
      facingCamera: z.boolean().nullable(),
      gazeTowardCamera: z.boolean().nullable(),
      headX: z.number().nullable(),
      headY: z.number().nullable(),
      upperBodyVisible: z.boolean().nullable(),
      shoulderX: z.number().nullable(),
      shoulderY: z.number().nullable(),
      handsVisible: z.boolean().nullable(),
      handMotion: z.number().nullable(),
    }),
  )
  .max(5_000);

/** Odmietnutie s dôvodom v logu (bez osobných údajov), aby sa dalo dohľadať, prečo nahrávka neprešla. */
function reject(status: number, code: string, message: string, detail: Record<string, unknown>) {
  console.warn(`[pitch] odmietnuté ${status} ${code}:`, JSON.stringify(detail));
  return apiError(status, code, message);
}

/** Nahraný pitch (multipart): audio + nastavenie + voliteľné signály z kamery. */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "pitch", RATE_LIMITS.exerciseAttempt);
  if (limited) return limited;

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_PITCH_AUDIO_BYTES + 1024 * 1024) return reject(413, "too_large", "Nahrávka je príliš dlhá.", { contentLength });

  try {
    const form = await request.formData();
    // nový klient posiela úseky priebežne (draftId), starší celú nahrávku naraz
    const draftId = String(form.get("draftId") ?? "");
    const segmentCount = Number(form.get("segments") ?? 0);
    const draft = isUuid(draftId) && Number.isInteger(segmentCount) && segmentCount >= 0 && segmentCount <= MAX_SEGMENTS ? { id: draftId, segments: segmentCount } : null;
    const rawAudio = form.get("audio");
    const audio = rawAudio instanceof Blob ? rawAudio : null;
    if (!audio && !draft) return reject(400, "invalid_request", "Chýba nahrávka.", { audio: typeof rawAudio });
    const baseType = audio ? audio.type.split(";")[0] : "audio/wav";
    if (audio && !AUDIO_TYPES.has(baseType)) return reject(415, "unsupported", "Nepodporovaný formát nahrávky.", { type: audio.type });
    const rawMeta = Object.fromEntries(["durationMs", "audience", "targetSeconds", "focus"].map((k) => [k, form.get(k)]));
    const meta = metaSchema.safeParse(rawMeta);
    if (!meta.success) {
      return reject(400, "invalid_request", "Neplatné nastavenie nahrávky.", { meta: rawMeta, issues: meta.error.issues.map((i) => i.path.join(".")) });
    }

    let vision = null;
    const rawVision = form.get("vision");
    if (typeof rawVision === "string" && rawVision) {
      try {
        const parsed = visionSchema.safeParse(JSON.parse(rawVision));
        vision = parsed.success ? parsed.data : null;
      } catch {
        vision = null;
      }
    }

    let coach = null;
    const rawCoach = form.get("coach");
    if (typeof rawCoach === "string" && rawCoach && rawCoach.length < 200_000) {
      try {
        const json = JSON.parse(rawCoach);
        coach = parseStoredCoach(json);
        if (!coach) {
          const issues = storedCoachSchema.safeParse(json).error?.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
          console.warn("[pitch] súhrn reči tela sa nedal prečítať:", JSON.stringify(issues));
        }
      } catch {
        console.warn("[pitch] súhrn reči tela nie je platný JSON");
        coach = null;
      }
    } else if (typeof rawCoach === "string" && rawCoach.length >= 200_000) {
      console.warn("[pitch] súhrn reči tela je príliš veľký:", rawCoach.length);
    }

    let outline = null;
    const rawOutline = form.get("outline");
    if (typeof rawOutline === "string" && rawOutline && rawOutline.length < 10_000) {
      try {
        const parsed = outlineInputSchema.safeParse(JSON.parse(rawOutline));
        outline = parsed.success ? parsed.data : null;
      } catch {
        outline = null;
      }
    }

    const extension = baseType === "audio/mp4" || baseType === "audio/x-m4a" ? "m4a" : baseType.split("/")[1];
    const attempt = await analyzePitch(user.id, {
      audio,
      draft,
      fileName: `pitch.${extension}`,
      durationMs: meta.data.durationMs,
      audience: meta.data.audience,
      targetSeconds: meta.data.targetSeconds,
      focus: meta.data.focus,
      vision,
      coach,
      outline,
      language: parseLanguage(form.get("language")),
      uiLocale: parseLocale(form.get("uiLocale")) ?? (await getLocale()),
      mode: form.get("mode") === "client" ? "client" : form.get("mode") === "meeting" ? "meeting" : "public",
    });
    // celý výsledok ide aj klientovi, feedback sa tak zobrazí aj bez trvalého úložiska
    return apiOk({ attemptId: attempt.id, attempt }, 201);
  } catch (error) {
    if (error instanceof PitchServiceError) return reject(error.status, error.code, error.message, { reason: error.message });
    return handleRouteError(error, "pitch.analyze");
  }
}
