import type { VisionSample } from "@/lib/analytics/vision/types";
import type { StoredCoach } from "@/lib/coach/stored";

/*
  Súhrn reči tela z kamery pre feedback. Iba odvodené hodnoty zo snímok, nikdy obraz.
  Udalosti sú orientačné a hovoria „pozor“, nie „chyba“.
*/

export type BodyEventKind = "restless_hands" | "looking_away" | "steady_eye_contact" | "calm_hands";
export type BodyEvent = { t: number; kind: BodyEventKind };

export type BodySummary = {
  version: 1;
  frames: number;
  /** Podiel snímok s tvárou, keď pohľad smeruje ku kamere (0–100). */
  eyeContactPct: number | null;
  /** Priemerná aktivita rúk (relatívna). */
  gestureActivity: number | null;
  events: BodyEvent[];
  /** Súhrn živého trénera reči tela (nahrávanie s kamerou). */
  coach?: StoredCoach | null;
};

export const BODY_EVENT_LABELS: Record<BodyEventKind, { label: string; tone: "good" | "warn" }> = {
  restless_hands: { label: "Nepokojné ruky", tone: "warn" },
  looking_away: { label: "Odvracanie pohľadu", tone: "warn" },
  steady_eye_contact: { label: "Dobrý očný kontakt", tone: "good" },
  calm_hands: { label: "Pokojné ruky", tone: "good" },
};

const RESTLESS_MOTION = 0.12;
const WINDOW_MS = 3_000;

/** Rozdelí snímky do 3 s okien a z každého vyvodí najviac jednu udalosť. */
export function summarizeBody(samples: VisionSample[]): BodySummary {
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const withFace = sorted.filter((s) => s.faceVisible && s.gazeTowardCamera !== null);
  const eye = withFace.length ? Math.round((withFace.filter((s) => s.gazeTowardCamera).length / withFace.length) * 100) : null;
  const motion = sorted.map((s) => s.handMotion).filter((m): m is number => m !== null);
  const gesture = motion.length ? motion.reduce((a, b) => a + b, 0) / motion.length : null;

  const events: BodyEvent[] = [];
  if (sorted.length) {
    const start = sorted[0].t;
    for (let from = start; from <= sorted[sorted.length - 1].t; from += WINDOW_MS) {
      const win = sorted.filter((s) => s.t >= from && s.t < from + WINDOW_MS);
      if (win.length < 3) continue;
      const m = win.map((s) => s.handMotion).filter((x): x is number => x !== null);
      const avgMotion = m.length ? m.reduce((a, b) => a + b, 0) / m.length : 0;
      const gaze = win.filter((s) => s.gazeTowardCamera !== null);
      const gazeRatio = gaze.length ? gaze.filter((s) => s.gazeTowardCamera).length / gaze.length : null;
      const t = from - start;
      if (avgMotion > RESTLESS_MOTION) events.push({ t, kind: "restless_hands" });
      else if (gazeRatio !== null && gazeRatio < 0.4) events.push({ t, kind: "looking_away" });
      else if (gazeRatio !== null && gazeRatio > 0.8) events.push({ t, kind: "steady_eye_contact" });
    }
  }
  return { version: 1, frames: sorted.length, eyeContactPct: eye, gestureActivity: gesture === null ? null : Math.round(gesture * 1000) / 1000, events: events.slice(0, 60) };
}

/** Krátky popis do karty Reč tela. */
export const BODY_EVENT_LABELS_EN: Record<BodyEventKind, string> = {
  restless_hands: "Restless hands",
  looking_away: "Looking away",
  steady_eye_contact: "Good eye contact",
  calm_hands: "Calm hands",
};

export function bodyNarrative(body: BodySummary, locale: "sk" | "en" = "sk"): string {
  const warn = body.events.filter((e) => BODY_EVENT_LABELS[e.kind].tone === "warn").length;
  const parts: string[] = [];
  if (locale === "en") {
    if (body.eyeContactPct !== null) {
      parts.push(
        body.eyeContactPct >= 70
          ? "You keep eye contact with the camera most of the time."
          : body.eyeContactPct >= 45
            ? "Your eye contact comes and goes. Try to look straight into the camera on key sentences."
            : "Your gaze often leaves the camera. Put your notes closer to the lens.",
      );
    }
    parts.push(warn === 0 ? "Your posture is calm and your hands don't distract." : "A few moments are worth a look, they are marked below.");
    return parts.join(" ");
  }
  if (body.eyeContactPct !== null) {
    parts.push(
      body.eyeContactPct >= 70
        ? "Očný kontakt s kamerou držíš väčšinu času."
        : body.eyeContactPct >= 45
          ? "Očný kontakt je striedavý. Skús sa pri kľúčových vetách dívať priamo do kamery."
          : "Pohľad často odchádza mimo kameru. Polož si poznámky bližšie k objektívu.",
    );
  }
  parts.push(warn === 0 ? "Držanie tela je pokojné a ruky ti nerušia." : "Pár momentov stojí za pozretie, sú označené nižšie.");
  return parts.join(" ");
}

/** Čas v tvare m:ss. */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
