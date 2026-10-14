import { CLIENT_MAX_QUESTIONS } from "@/lib/pitch/qa";

/*
  Stretnutie s klientom: klient prerušuje výklad otázkami v náhodných chvíľach. Otázky sa
  rozložia po celej dĺžke stretnutia, prvá najskôr po chvíli výkladu, posledná nie tesne pred
  koncom a medzi nimi je vždy kus výkladu. Čisté funkcie, testované.
*/

/** výklad pred prvou otázkou */
const FIRST_AFTER_MS = 45_000;
/** po odpovedi pokračuje výklad aspoň takto dlho */
export const GAP_AFTER_ANSWER_MS = 30_000;
/** posledná otázka nie tesne pred koncom */
const TAIL_MS = 20_000;
/** na každú otázku treba aspoň toľko výkladu */
const PER_QUESTION_MS = 40_000;

/** Koľko otázok sa zmestí do stretnutia danej dĺžky. */
export function maxQuestionsFor(durationMs: number): number {
  return Math.max(0, Math.min(CLIENT_MAX_QUESTIONS, Math.floor((durationMs - TAIL_MS) / PER_QUESTION_MS)));
}

/** Kedy (ms výkladu) príde ktorá otázka: rovnomerne s náhodným posunom, vždy rastúco. */
export function planQuestionTimes(durationMs: number, count: number, random: () => number = Math.random): number[] {
  const n = Math.min(count, maxQuestionsFor(durationMs));
  if (n <= 0) return [];
  const end = durationMs - TAIL_MS;
  const start = Math.min(FIRST_AFTER_MS, end / (n + 1));
  const slot = (end - start) / n;
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    // náhodne v druhej polovici vlastného úseku, aby to nebolo v pravidelnom rytme
    let t = start + slot * i + slot * (0.35 + random() * 0.6);
    if (times.length) t = Math.max(t, times[times.length - 1] + GAP_AFTER_ANSWER_MS);
    times.push(Math.round(Math.min(t, end)));
  }
  return times;
}
