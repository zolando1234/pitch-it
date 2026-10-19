import { isStripeConfigured } from "@/lib/billing/stripe";
import { getPitchBalance } from "@/lib/db/pitch-wallet";
import { getMembership } from "@/lib/db/teams";
import { apiOk, handleRouteError, requireApiUser } from "@/lib/http/route";

/** Čo smie používateľ práve nahrať (plán, minúty zadarmo, týždenné a dokúpené minúty). */
export async function GET() {
  const user = await requireApiUser();
  if (user instanceof Response) return user;
  try {
    const [balance, membership] = await Promise.all([getPitchBalance(user.id), getMembership(user.id)]);
    const team = membership ? { name: membership.team.name, ownerEmail: membership.ownerEmail } : null;
    return apiOk({ balance, paymentsEnabled: isStripeConfigured(), team });
  } catch (error) {
    return handleRouteError(error, "billing.pitch_balance");
  }
}
