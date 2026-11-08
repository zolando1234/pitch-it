import { hasReadyPitch, saveAppFeedback } from "@/lib/db/app-feedback";
import { addFeedbackBonus } from "@/lib/db/pitch-wallet";
import { FEEDBACK_BONUS_SECONDS, feedbackSchema } from "@/lib/feedback/survey";
import { getLocale } from "@/lib/i18n/server";
import { apiError, apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Dotazník spokojnosti: uloží hviezdičky a komentár a raz pripíše 5 minút zadarmo. */
export async function POST(request: Request) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "app-feedback", RATE_LIMITS.appFeedback);
  if (limited) return limited;
  const body = await parseJson(request, feedbackSchema);
  if (body instanceof Response) return body;

  try {
    const en = (await getLocale()) === "en";
    if (!(await hasReadyPitch(user.id))) {
      return apiError(403, "no_pitch", en ? "Record your first pitch, then tell us how it went." : "Najprv nahraj prvý pitch, potom nám povedz, ako to šlo.");
    }
    const saved = await saveAppFeedback(user.id, body);
    // aj pri opakovanom odoslaní: ak odmena predtým zlyhala, pripíše sa teraz (pripisuje sa najviac raz)
    await addFeedbackBonus(user.id, FEEDBACK_BONUS_SECONDS);
    return apiOk({ saved, bonusSeconds: FEEDBACK_BONUS_SECONDS });
  } catch (error) {
    return handleRouteError(error, "app_feedback.submit");
  }
}
