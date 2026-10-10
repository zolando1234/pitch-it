import { z } from "zod";
import { isMicCode, MAX_SDP_LENGTH, micLinkOwner, readMicLink, setMicAnswer, setMicOffer } from "@/lib/mic/relay";
import { apiError, apiOk, handleRouteError, parseJson, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/*
  Výmena spojenia medzi počítačom a mobilom. Počítač (prihlásený vlastník odkazu) zapisuje ponuku,
  mobil (ktokoľvek s odkazom) číta ponuku a zapisuje odpoveď.
*/

const sdpSchema = z.object({ sdp: z.string().min(1).max(MAX_SDP_LENGTH) });

const NOT_FOUND = "Odkaz na mikrofón neplatí. Vygeneruj na počítači nový.";

export async function GET(_request: Request, { params }: RouteContext<"/api/mikrofon/[code]">) {
  const { code } = await params;
  if (!isMicCode(code)) return apiError(404, "not_found", NOT_FOUND);
  try {
    const link = await readMicLink(code);
    if (!link.exists) return apiError(404, "not_found", NOT_FOUND);
    return apiOk({ offer: link.offer, answer: link.answer });
  } catch (error) {
    return handleRouteError(error, "mic.read");
  }
}

/** Ponuka z počítača. */
export async function PUT(request: Request, { params }: RouteContext<"/api/mikrofon/[code]">) {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const { code } = await params;
  if (!isMicCode(code)) return apiError(404, "not_found", NOT_FOUND);
  const body = await parseJson(request, sdpSchema);
  if (body instanceof Response) return body;
  try {
    if ((await micLinkOwner(code)) !== user.id) return apiError(404, "not_found", NOT_FOUND);
    await setMicOffer(code, body.sdp);
    return apiOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "mic.offer");
  }
}

/** Odpoveď z mobilu. */
export async function POST(request: Request, { params }: RouteContext<"/api/mikrofon/[code]">) {
  const { code } = await params;
  if (!isMicCode(code)) return apiError(404, "not_found", NOT_FOUND);
  const limited = rateLimited(code, "mic-answer", RATE_LIMITS.micAnswer);
  if (limited) return limited;
  const body = await parseJson(request, sdpSchema);
  if (body instanceof Response) return body;
  try {
    const link = await readMicLink(code);
    if (!link.exists || !link.offer) return apiError(404, "not_found", NOT_FOUND);
    if (!(await setMicAnswer(code, body.sdp))) return apiError(409, "conflict", "K počítaču je už pripojený iný mobil.");
    return apiOk({ ok: true });
  } catch (error) {
    return handleRouteError(error, "mic.answer");
  }
}
