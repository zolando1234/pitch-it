import type { Locale } from "@/lib/i18n/locale";
import type { Highlight } from "./metrics";
import { GROUPS, HIGHLIGHTS, PRAISE, RULE_BY_ID, type GroupId } from "./rules";

/*
  Texty trénera reči tela v jazyku rozhrania. Slovenčina je priamo v pravidlách (rules.ts),
  angličtina tu podľa id pravidla. Chýbajúci preklad = slovenský text.
*/

type Copy = { title: string; tip: string };

const RULES_EN: Record<string, Copy> = {
  "too-close": { title: "You're too close", tip: "Step back so the camera sees your whole torso and hands." },
  "too-far": { title: "You're too far", tip: "Move closer to the camera." },
  edge: { title: "You're at the edge", tip: "Move back towards the centre. From the edge the audience can barely see you." },
  "mic-away": { title: "Mic too far from your mouth", tip: "Hold the mic at your chin, two or three fingers from your mouth, or the audience will stop hearing you." },
  "hands-hidden": { title: "Hands in pockets or behind your back", tip: "Hidden hands look closed and unsure. Take them out and show your palms, they build trust." },
  "one-hidden": { title: "One hand in a pocket", tip: "A hand in the pocket looks casual, even disengaged. Take it out and gesture with it." },
  "hands-on-hips": { title: "Hands on hips", tip: "Hands on hips look arrogant or defensive. Drop them and gesture in the power zone." },
  crossed: { title: "Arms crossed", tip: "Crossed arms put a barrier between you and the audience. Relax them and open up." },
  "face-touch": { title: "Touching your face", tip: "Touching your face, hair or neck shows nerves. Bring your hands back to the power zone." },
  frozen: { title: "Standing like a statue", tip: "Let your hands talk too: show size, direction, numbers. A gesture should illustrate what you say." },
  "fig-leaf": { title: "Fig leaf", tip: "Hands clasped low in front of you is a defensive pose. Raise them to the power zone and open up." },
  pointing: { title: "Pointing your finger", tip: "A pointing finger feels accusing. Gesture with an open palm instead: an invitation, not a reproach." },
  fists: { title: "Clenched fists", tip: "Fists reveal tension. Relax your fingers and gesture with open palms." },
  wringing: { title: "Wringing your hands", tip: "Fiddling with your fingers and rubbing your hands shows nerves. Separate them and make a deliberate gesture." },
  "palms-away": { title: "Show your palms", tip: "The audience only sees the backs of your hands. Turn your palms towards them, open palms build trust." },
  "few-gestures": { title: "Too few gestures", tip: "The most watched TED talks have about 25 gestures a minute. Illustrate more of what you say with your hands." },
  pacing: { title: "Pacing back and forth", tip: "Like a tiger in a cage. Move to a new spot, stop, and deliver the point standing still." },
  "hands-low": { title: "Hands hanging down", tip: "Raise your hands to the power zone, between waist and chest. Gestures there look confident." },
  fidget: { title: "Restless hands", tip: "Small jerky hand movements show nerves. Make one calm, deliberate gesture and let it land." },
  clasped: { title: "Hands clasped", tip: "Hands clasped in front of you close you off. Separate them and let them talk." },
  closed: { title: "Closed gestures", tip: "Your hands are too close together. Widen your gestures to shoulder width and turn your palms to the audience." },
  "t-rex": { title: "Elbows glued to your body", tip: "Gesturing only with your forearms looks cramped. Free your elbows and use your whole arm." },
  "over-gesture": { title: "Too much movement", tip: "Less is more. Use gestures to stress key ideas and rest your hands in the power zone in between." },
  "no-hold": { title: "Hold the gesture", tip: "Your hands never stop. When you make a point, hold the gesture for a second." },
  repetitive: { title: "Same gesture over and over", tip: "You keep repeating one movement. Vary your gestures: show size, direction, numbers or contrast." },
  "one-hand": { title: "Gesturing with one hand", tip: "Your other hand just hangs. Use it too, for example when you compare two things." },
  "hands-high": { title: "Hands above your head", tip: "Save gestures above your head for big emphasis. Most of the time keep your hands between waist and chest." },
  "head-down": { title: "Looking at the floor", tip: "Lift your chin and look for eye contact with the audience." },
  "chin-up": { title: "Chin too high", tip: "A raised chin looks condescending. Keep your head level and look people in the eye." },
  "gaze-darting": { title: "Darting eyes", tip: "Don't jump around the room with your eyes. Stay with one person for 3 to 5 seconds." },
  "gaze-stuck": { title: "Looking at one spot", tip: "The audience also sits left and right. Alternate between the left, centre and right." },
  nodding: { title: "Constant nodding", tip: "A calm head looks confident. Nod only when you agree with something." },
  turned: { title: "Standing sideways", tip: "Turn your shoulders to the audience. Your body points where your attention goes." },
  tilt: { title: "Leaning", tip: "Spread your weight evenly on both feet and level your shoulders." },
  "legs-crossed": { title: "Legs crossed", tip: "Crossed legs look unsure and you can lose balance. Stand on both feet, hip-width apart." },
  "narrow-stance": { title: "Feet too close together", tip: "Feet right next to each other look cramped and make you sway. Stand hip-width apart." },
  sway: { title: "Shifting your weight", tip: "Shifting from foot to foot is distracting. Stand firm, and when you want to move, take a deliberate step." },
  rooted: { title: "Use the space", tip: "When you move to a new idea, take a few steps. Movement separates the parts of your talk." },
};

const HIGHLIGHTS_EN: Record<Highlight, Copy & { label: string }> = {
  wide: { label: "Wide gestures", title: "Wide gesture!", tip: "Wide open arms look confident and friendly." },
  hold: { label: "Held gestures", title: "Held gesture", tip: "A gesture you hold for a moment underlines the idea. Exactly." },
  planted: { label: "Step and stop", title: "Great move", tip: "Move and stop, just like on a TED stage. Now deliver the point standing still." },
  palms: { label: "Open palms", title: "Open palms", tip: "Palms to the audience say: I have nothing to hide. Excellent." },
  count: { label: "Counting on fingers", title: "Counting on fingers", tip: "“First, second…” on your fingers helps the audience remember the structure." },
  sweep: { label: "Looking at the whole audience", title: "You reached the whole room", tip: "Looking left and right makes everyone feel you are talking to them." },
};

const PRAISE_EN: Copy[] = [
  { title: "Great!", tip: "Open gestures in the power zone. This is what confidence looks like." },
  { title: "Flowing nicely", tip: "Your gestures support what you say. Keep going." },
  { title: "Exactly", tip: "Calm, deliberate movement. The audience is with you." },
];

const GROUPS_EN: Record<GroupId, string> = {
  setup: "Framing",
  gestures: "Gestures and hands",
  head: "Head and gaze",
  stage: "Moving on stage",
  posture: "Posture",
};

export function ruleCopy(id: string, locale: Locale): Copy {
  const rule = RULE_BY_ID[id];
  if (locale === "en" && RULES_EN[id]) return RULES_EN[id];
  return { title: rule?.title ?? id, tip: rule?.tip ?? "" };
}

export function highlightCopy(id: Highlight, locale: Locale): Copy & { label: string } {
  return locale === "en" ? HIGHLIGHTS_EN[id] : HIGHLIGHTS[id];
}

export function praiseCopy(index: number, locale: Locale): Copy {
  const list = locale === "en" ? PRAISE_EN : PRAISE;
  return list[index % list.length];
}

export function groupTitle(id: GroupId, locale: Locale): string {
  if (locale === "en") return GROUPS_EN[id];
  return GROUPS.find((g) => g.id === id)?.title ?? (id === "setup" ? "Záber" : id);
}

export const IDLE_COPY: Record<Locale, Copy> = {
  sk: { title: "Postav sa pred kameru", tip: "Postav sa 2 až 3 m od kamery, aby bolo vidno aspoň trup po pás." },
  en: { title: "Step in front of the camera", tip: "Stand 2 to 3 m from the camera so it sees at least your upper body." },
};
