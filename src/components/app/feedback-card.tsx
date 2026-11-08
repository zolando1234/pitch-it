import { hasAppFeedback, hasReadyPitch } from "@/lib/db/app-feedback";

/** Ponuka dotazníka v karte plánu: len kto už má vyhodnotený pitch a dotazník ešte nevyplnil. */
export async function offersFeedback(userId: string): Promise<boolean> {
  return Promise.all([hasReadyPitch(userId), hasAppFeedback(userId)])
    .then(([tried, answered]) => tried && !answered)
    .catch((error: unknown) => {
      // ponuka nesmie zhodiť bočný panel
      console.error("[feedback-card]", error instanceof Error ? error.message.slice(0, 200) : error);
      return false;
    });
}
