import "server-only";

import { getAdminDb } from "@/lib/store/client";

/*
  Interné produktové udalosti (bez tretích strán a cookies).
  Vlastnosti obsahujú iba vymenované hodnoty a čísla, nikdy text používateľa.
  Udalosti merajú používanie produktu, nie úspech foundera.
*/

export type ProductEventName =
  | "signup_completed"
  | "onboarding_completed"
  | "project_created"
  | "deck_processed"
  | "session_started"
  | "session_completed"
  | "report_viewed"
  | "session_repeated"
  | "exercise_completed"
  | "pitch_analyzed"
  | "pitch_shared"
  | "event_created"
  | "checkout_started"
  | "purchase_completed"
  | "plan_changed"
  | "account_deleted";

type EventProperties = Record<string, string | number | boolean | null>;

export async function trackEvent(
  userId: string | null,
  name: ProductEventName,
  properties: EventProperties = {},
): Promise<void> {
  try {
    const { error } = await getAdminDb()
      .from("product_events")
      .insert({ user_id: userId, name, properties });
    if (error) console.error("[events] zápis zlyhal:", error.code);
  } catch (error) {
    // Analytika nesmie zhodiť používateľskú akciu.
    console.error("[events] zápis zlyhal:", error instanceof Error ? error.message : "neznáma chyba");
  }
}
