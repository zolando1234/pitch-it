/* Karta s metrikou na prehľade (posledná hodnota a zmena oproti predošlému pitchu). */

export type StatDelta = {
  text: string;
  sign: "up" | "down" | "flat";
  verdict: "better" | "worse" | "same";
  description: string;
};

export type StatCard = {
  key: string;
  label: string;
  icon: "star" | "gauge" | "chat" | "timer";
  tone: "lime" | "violet";
  value: string | null;
  unit: string | null;
  /** Upresnenie hodnoty pre title a čítačky obrazovky. */
  hint: string | null;
  delta: StatDelta | null;
  /** Text pod hodnotou, keď sa zmena nedá ukázať. */
  note: string;
};
