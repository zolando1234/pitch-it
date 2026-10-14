import { z } from "zod";
import { countFillers } from "@/lib/analytics/speech/text-metrics";
import type { PitchLanguage } from "@/lib/pitch/language";
import type { QaResult } from "@/lib/pitch/qa";
import type { SegmentWord } from "@/lib/pitch/segment-merge";

/*
  Skutočné stretnutie s klientom: nahrávka rozhovoru dvoch (alebo viacerých) ľudí. Prepis
  rozlíši rečníkov po úsekoch, AI určí, kto je rečník (ty) a kto klient. Hodnotí sa len tvoja reč
  a navyše to, ako si reagoval na otázky a námietky klienta. Čisté funkcie, testované.
*/

export type DialogRole = "me" | "client";
export type DialogLine = { role: DialogRole; text: string };

/** najviac znakov repliky v promptoch (dlhé monológy sa skrátia) */
const LINE_MAX = 400;
const DIALOG_MAX = 40_000;

export const rolesSchema = z.object({
  roles: z.array(z.object({ label: z.string().max(40), role: z.enum(["me", "client"]) })).max(400),
});

export const ROLES_SYSTEM = `Dostaneš prepis obchodného stretnutia, repliky sú označené kódom rečníka v hranatých zátvorkách, napr. [R3].
Rôzne kódy môžu patriť tomu istému človeku (nahrávka sa prepisovala po častiach), urči rolu pre každý kód zvlášť podľa obsahu.
Pre každé označenie urči rolu: me = človek, ktorý stretnutie vedie a vysvetľuje svoju ponuku, produkt alebo tému (hodnotíme ho);
client = klient alebo ktokoľvek iný (pýta sa, namieta, reaguje). Vráť rolu pre každý kód z prepisu, label = presne kód bez zátvoriek (napr. R3).`;

/** Krátke kódy rečníkov (R1, R2…) namiesto technických označení, ktoré AI ľahko pomýli. */
export function speakerCodes(turns: Array<{ label: string }>): Map<string, string> {
  const codes = new Map<string, string>();
  for (const t of turns) if (!codes.has(t.label)) codes.set(t.label, `R${codes.size + 1}`);
  return codes;
}

/** Roly z odpovede AI (podľa kódov) späť na označenia rečníkov. */
export function rolesFromCodes(codes: Map<string, string>, roles: Array<{ label: string; role: DialogRole }>): Array<{ label: string; role: DialogRole }> {
  const byCode = new Map(roles.map((r) => [r.label.replace(/[[\]\s]/g, "").toUpperCase(), r.role]));
  return [...codes.entries()].flatMap(([label, code]) => (byCode.has(code) ? [{ label, role: byCode.get(code)! }] : []));
}

export function buildRolesPrompt(turns: Array<{ label: string; text: string }>, topic: string | null): string {
  const codes = speakerCodes(turns);
  let length = 0;
  const lines: string[] = [];
  for (const t of turns) {
    const line = `[${codes.get(t.label)}] ${t.text.length > LINE_MAX ? `${t.text.slice(0, LINE_MAX)}…` : t.text}`;
    length += line.length;
    if (length > DIALOG_MAX) break;
    lines.push(line);
  }
  return [topic ? `Téma, ktorú rečník (me) prezentuje:\n"""${topic.slice(0, 1500)}"""` : null, `Prepis:\n${lines.join("\n")}`].filter(Boolean).join("\n\n");
}

/** Slová rečníka (ty) a rozhovor po replikách; označenie bez roly sa berie ako rečník. */
export function applyRoles(words: SegmentWord[], roles: Array<{ label: string; role: DialogRole }>): { mine: SegmentWord[]; dialog: DialogLine[] } {
  const byLabel = new Map(roles.map((r) => [r.label, r.role]));
  const roleOf = (w: SegmentWord): DialogRole => (w.speaker ? (byLabel.get(w.speaker) ?? "me") : "me");
  const mine = words.filter((w) => roleOf(w) === "me");
  const dialog: DialogLine[] = [];
  for (const w of words) {
    const role = roleOf(w);
    const last = dialog[dialog.length - 1];
    if (last && last.role === role) last.text += ` ${w.word}`;
    else dialog.push({ role, text: w.word });
  }
  return { mine, dialog };
}

/** Rozhovor ako text pre AI: TY / KLIENT. */
export function dialogForPrompt(dialog: DialogLine[]): string {
  let length = 0;
  const lines: string[] = [];
  for (const d of dialog) {
    const line = `${d.role === "me" ? "TY" : "KLIENT"}: ${d.text.length > LINE_MAX * 3 ? `${d.text.slice(0, LINE_MAX * 3)}…` : d.text}`;
    length += line.length;
    if (length > DIALOG_MAX) break;
    lines.push(line);
  }
  return lines.join("\n");
}

export const meetingSchema = z.object({
  summary: z.string().min(1).max(600),
  reactions: z
    .array(
      z.object({
        client: z.string().max(300),
        response: z.string().max(500),
        score: z.number().int().min(0).max(10),
        strength: z.string().max(280),
        improve: z.string().min(1).max(280),
      }),
    )
    .max(10),
});
export type MeetingReview = z.infer<typeof meetingSchema>;

export const MEETING_SYSTEM = `Si kouč obchodných stretnutí. Dostaneš prepis skutočného stretnutia: TY = rečník, ktorého hodnotíš, KLIENT = klient.
Zhodnoť, ako stretnutie prebehlo (summary: 2–3 vety: či rečník viedol rozhovor, či počúval, ako klient reagoval a kam sa stretnutie posunulo).
Potom vyber najviac 10 najdôležitejších momentov, keď klient položil otázku, vzniesol námietku alebo vyjadril pochybnosť, a ohodnoť,
ako na to rečník zareagoval (reactions): client = krátky citát klienta, response = krátky citát odpovede rečníka (alebo „(bez odpovede)“),
score 0–10 (0 = ignoroval alebo odbočil, 5 = odpovedal vágne alebo okolo, 8+ = priamo, s pochopením potreby klienta a konkrétne),
strength = čo bolo dobré (môže byť prázdne), improve = jedna konkrétna rada, ako reagovať lepšie.
Hodnotíš iba to, čo v prepise naozaj zaznelo; prepis je automatický, drobné chyby rozpoznávania neber ako chybu. Tón vľúdny, koučovací, v tykaní.`;

export function buildMeetingPrompt(input: { dialog: string; topic: string | null; feedbackLocale: "sk" | "en"; context: string | null; language: string }): string {
  return [
    input.feedbackLocale === "en" ? "IMPORTANT: Write summary, strength and improve in English (informal, friendly second person)." : "Texty summary, strength a improve píš po slovensky.",
    `Jazyk stretnutia: ${input.language}. Citáty nechaj v pôvodnom jazyku.`,
    input.topic ? `Čo chcel rečník na stretnutí predstaviť:\n"""${input.topic.slice(0, 1500)}"""` : null,
    input.context ? `Fakty o firme rečníka:\n"""${input.context}"""` : null,
    `Prepis stretnutia:\n${input.dialog}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Reakcie na klienta v tvare Q&A (zobrazia sa v reporte ako sekcia s odpoveďami). */
export function meetingToQa(review: MeetingReview, language: PitchLanguage): QaResult {
  const answers = review.reactions.map((r) => ({
    question: r.client,
    transcript: r.response,
    durationMs: 0,
    fillers: countFillers(r.response, language).total,
    score: r.score,
    strength: r.strength,
    improve: r.improve,
  }));
  return {
    version: 1,
    language,
    answers,
    score: answers.length ? Math.round((answers.reduce((s, a) => s + (a.score ?? 0), 0) / answers.length) * 10) / 10 : null,
    summary: review.summary,
  };
}
