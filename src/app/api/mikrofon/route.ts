import { createMicLink } from "@/lib/mic/relay";
import { apiOk, handleRouteError, rateLimited, requireApiUser } from "@/lib/http/route";
import { RATE_LIMITS } from "@/lib/security/rate-limit";

/** Nový odkaz, cez ktorý sa mobil pripojí ako mikrofón. */
export async function POST() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  const limited = rateLimited(user.id, "mic-link", RATE_LIMITS.micLink);
  if (limited) return limited;
  try {
    return apiOk({ code: await createMicLink(user.id) }, 201);
  } catch (error) {
    return handleRouteError(error, "mic.create");
  }
}
