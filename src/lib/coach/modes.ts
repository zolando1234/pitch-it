import type { FeedbackState } from "./pose/feedback";
import type { Highlight, Metrics } from "./pose/metrics";

// ── Režimy tréningu ─────────────────────────────────────────

export type TalkMode = {
  kind: "talk";
  id: string;
  title: string;
  subtitle: string;
  /** null = bez časového limitu */
  durationMs: number | null;
};

type DrillMeasure =
  | { type: "zone-share" }
  | { type: "palm-share" }
  | { type: "highlight-count"; highlight: Highlight }
  | { type: "gesture-rate" };

export type Drill = {
  kind: "drill";
  id: string;
  title: string;
  goal: string;
  howTo: string[];
  durationMs: number;
  /** počas cvičenia sa ozývajú len tieto pravidlá (plus nastavenie záberu) */
  focusRules: string[];
  measure: DrillMeasure;
  target: number;
  /** ako zobraziť hodnotu metriky */
  unit: "percent" | "count" | "per-min";
};

export type SessionMode = TalkMode | Drill;

const MIN = 60_000;

export const TALK_MODES: TalkMode[] = [
  { kind: "talk", id: "free", title: "Voľný tréning", subtitle: "Bez časového limitu", durationMs: null },
  { kind: "talk", id: "pitch", title: "Elevator pitch", subtitle: "1 minúta", durationMs: 1 * MIN },
  { kind: "talk", id: "short", title: "Krátky prejav", subtitle: "4 minúty", durationMs: 4 * MIN },
  { kind: "talk", id: "ted", title: "TED prednáška", subtitle: "18 minút", durationMs: 18 * MIN },
];

export const DRILLS: Drill[] = [
  {
    kind: "drill",
    id: "power-zone",
    title: "Power zóna",
    goal: "Drž ruky medzi pásom a hrudníkom aspoň 80 % času.",
    howTo: [
      "Hovor o čomkoľvek a celý čas gestikuluj.",
      "Každé gesto začína aj končí v prerušovanom rámčeku.",
      "Medzi gestami nenechaj ruky padnúť k telu.",
    ],
    durationMs: 1 * MIN,
    focusRules: ["hands-low", "hands-high", "hands-hidden", "one-hidden", "frozen", "frozen-long", "crossed", "clasped", "fig-leaf", "hands-on-hips"],
    measure: { type: "zone-share" },
    target: 0.8,
    unit: "percent",
  },
  {
    kind: "drill",
    id: "open-palms",
    title: "Otvorené dlane",
    goal: "Ukazuj publiku dlane aspoň 60 % času, keď gestikuluješ.",
    howTo: [
      "Gestikuluj otvorenými rukami, prsty uvoľnené a pri sebe.",
      "Otoč dlane ku kamere, akoby si niečo ponúkal.",
      "Žiadne päste ani ukazovák. Pre lepšie sledovanie prstov sa postav bližšie.",
    ],
    durationMs: 1 * MIN,
    focusRules: ["palms-away", "fists", "pointing", "crossed", "clasped", "fig-leaf", "hands-hidden", "closed"],
    measure: { type: "palm-share" },
    target: 0.6,
    unit: "percent",
  },
  {
    kind: "drill",
    id: "eye-contact",
    title: "Pohľad po celej miestnosti",
    goal: "Prejdi pohľadom z jednej strany miestnosti na druhú 6-krát.",
    howTo: [
      "Predstav si publikum v troch častiach: vľavo, v strede, vpravo.",
      "Pri každej časti zostaň 3 až 5 sekúnd, jedna myšlienka na človeka.",
      "Otáčaj hlavu, nielen oči. Bradu drž rovno.",
    ],
    durationMs: 1 * MIN,
    focusRules: ["gaze-stuck", "gaze-darting", "head-down", "nodding", "turned"],
    measure: { type: "highlight-count", highlight: "sweep" },
    target: 6,
    unit: "count",
  },
  {
    kind: "drill",
    id: "step-plant",
    title: "Krok a zastavenie",
    goal: "Urob 5 zámerných presunov: prejdi na nové miesto, zastav a povedz pointu.",
    howTo: [
      "Pri novej myšlienke urob 2 až 3 kroky.",
      "Úplne zastav, pevne sa postav a až potom hovor.",
      "Využi ľavú stranu, stred aj pravú stranu priestoru. Žiadne chodenie sem a tam.",
    ],
    durationMs: 1.5 * MIN,
    focusRules: ["pacing", "sway", "edge", "turned"],
    measure: { type: "highlight-count", highlight: "planted" },
    target: 5,
    unit: "count",
  },
  {
    kind: "drill",
    id: "gesture-rate",
    title: "Viac gest",
    goal: "Dosiahni aspoň 20 gest za minútu ako najsledovanejší TED rečníci.",
    howTo: [
      "Ilustruj všetko: veľkosť, smer, čísla, kontrast.",
      "Každé gesto nech je iné, nie jedno opakované mávnutie.",
      "Gestá drž v power zóne a každé nechaj doznieť.",
    ],
    durationMs: 1 * MIN,
    focusRules: ["few-gestures", "frozen", "frozen-long", "over-gesture", "fidget", "repetitive", "one-hand"],
    measure: { type: "gesture-rate" },
    target: 20,
    unit: "per-min",
  },
  {
    kind: "drill",
    id: "hold",
    title: "Podrž gesto",
    goal: "Pri pointe podrž 8 gest na chvíľu v pokoji.",
    howTo: [
      "Na kľúčovom slove sa presuň do gesta.",
      "Na sekundu ho zmraz, kým dokončíš vetu.",
      "Potom sa pokojne vráť do power zóny.",
    ],
    durationMs: 1 * MIN,
    focusRules: ["no-hold", "fidget", "over-gesture", "frozen", "frozen-long"],
    measure: { type: "highlight-count", highlight: "hold" },
    target: 8,
    unit: "count",
  },
];

/** pravidlá, ktoré platia vždy (nastavenie kamery a mikrofónu) */
const ALWAYS_ON = new Set(["too-close", "too-far", "mic-away"]);

/**
 * Pri stretnutí za stolom sa sedí: neplatí pohyb po pódiu, postoj a nohy, ani ruky dole
 * (na stole ležia nižšie ako power zóna na pódiu).
 */
export const SEATED_OFF = new Set(["edge", "pacing", "sway", "rooted", "legs-crossed", "narrow-stance", "hands-low"]);

/** Ktoré pravidlá sa v danom režime ozývajú. */
export function ruleFilterFor(mode: SessionMode, teleprompter: boolean, seated = false): (id: string) => boolean {
  const focus = mode.kind === "drill" ? new Set(mode.focusRules) : null;
  return (id) => {
    if (seated && SEATED_OFF.has(id)) return false;
    // pri čítaní z telepromptra sa prirodzene pozeráš stále do stredu
    if (teleprompter && id === "gaze-stuck") return false;
    if (!focus) return true;
    return ALWAYS_ON.has(id) || focus.has(id);
  };
}

export function formatDrillValue(drill: Drill, v: number): string {
  if (drill.unit === "percent") return `${Math.round(v * 100)} %`;
  if (drill.unit === "per-min") return `${Math.round(v)}/min`;
  return String(Math.round(v));
}

export type DrillProgress = { value: number; ratio: number; text: string; targetText: string; passed: boolean };

/** Počas cvičenia priebežne meria jeho cieľovú metriku. */
export class DrillTracker {
  private num = 0;
  private den = 0;
  private count = 0;
  private rate = 0;

  readonly drill: Drill;

  constructor(drill: Drill) {
    this.drill = drill;
  }

  update(m: Metrics | null, fb: FeedbackState, dtMs: number) {
    const ms = this.drill.measure;
    switch (ms.type) {
      case "zone-share":
        if (m && m.visibleWrists > 0) {
          this.den += dtMs;
          if (m.wristsInZone === m.visibleWrists) this.num += dtMs;
        } else if (m) {
          // skryté ruky sa počítajú ako mimo zóny
          this.den += dtMs;
        }
        break;
      case "palm-share": {
        const hands = [m?.leftHand, m?.rightHand].filter((h) => !!h);
        if (hands.length) {
          this.den += dtMs;
          if (hands.some((h) => h!.palmFacing)) this.num += dtMs;
        }
        break;
      }
      case "highlight-count":
        if (fb.highlight === ms.highlight) this.count++;
        break;
      case "gesture-rate":
        if (m?.gesturesPerMin != null) this.rate = m.gesturesPerMin;
        break;
    }
  }

  progress(): DrillProgress {
    const d = this.drill;
    const value =
      d.measure.type === "highlight-count"
        ? this.count
        : d.measure.type === "gesture-rate"
          ? this.rate
          : this.den
            ? this.num / this.den
            : 0;
    return {
      value,
      ratio: Math.min(1, value / d.target),
      text: formatDrillValue(d, value),
      targetText: formatDrillValue(d, d.target),
      passed: value >= d.target,
    };
  }
}
