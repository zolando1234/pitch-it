import { FREE_SECONDS, PRO_WEEKLY_SECONDS, type PlanId } from "@/lib/billing/pricing";

/*
  Prístup k nahrávaniu podľa plánu (cenník v pricing.ts):
  - Free: 10 minút zadarmo (raz navždy), ľubovoľne rozdelených. Starší kúpený balík pitchov
    (credits) platí ďalej: jeden kredit = jeden prejav do 30 minút.
  - Pro: 60 minút týždenne, potom dokúpené minúty.
  - Unlimited: bez limitu, prejavy až do hodiny.
  Prejav sa započíta, až keď je analýza hotová; zlyhaná analýza nič nemíňa. Čisté funkcie, testované.
*/

export const formatEur = (cents: number, locale: "sk" | "en" = "sk") => {
  const whole = cents % 100 === 0;
  // zlomky centa (cena minúty po zľave, napr. 15,3 centa) na tri desatinné miesta
  const value = whole ? String(cents / 100) : (cents / 100).toFixed(Number.isInteger(cents) ? 2 : 3);
  return locale === "en" ? `€${value}` : `${value.replace(".", ",")} €`;
};

export type PitchWallet = {
  /** staršie: počet použitých pitchov zadarmo (už sa nepoužíva) */
  free_used: number;
  /** starší kúpený balík pitchov */
  credits: number;
  /** dokúpené minúty k Pro (sekundy) */
  topup_seconds?: number;
  /** minuté sekundy zo zadarmo času */
  free_seconds_used?: number;
};

export type PitchBalance = {
  plan: PlanId;
  /** zostávajúci čas zadarmo (sekundy) */
  freeSecondsLeft: number;
  /** starší kúpený balík pitchov */
  credits: number;
  /** Pro: týždenný limit a čerpanie (sekundy); inak null */
  weekly: { limitSeconds: number; usedSeconds: number } | null;
  /** dokúpené minúty (sekundy) */
  topupSeconds: number;
  /** platený plán (alebo starší balík) */
  paid: boolean;
  /** najdlhšie nahrávanie, ktoré sa dá práve spustiť (sekundy) */
  maxSeconds: number;
  canPitch: boolean;
};

/** Predvolené dĺžky nahrávania (sekundy); vlastná dĺžka v celých minútach. */
export const RECORD_LENGTHS = [30, 60, 180, 240] as const;
export type RecordLength = number;
/** najkratšia a najdlhšia vlastná dĺžka */
export const CUSTOM_MIN_SECONDS = 60;
export const CUSTOM_MAX_SECONDS = 30 * 60;
/** Unlimited: prejavy až do hodiny (prednášky, dlhé stretnutia) */
export const UNLIMITED_MAX_SECONDS = 60 * 60;
/** kratší zostatok už na prejav nestačí */
export const MIN_RECORD_SECONDS = 30;

/** Týždenný limit Pro: 60 minút za každý zaplatený účet (tímový plán má spoločný limit). */
export const proWeeklyLimit = (seats = 1) => PRO_WEEKLY_SECONDS * Math.max(1, Math.floor(seats));

export function balanceFor(input: { plan: PlanId; wallet: PitchWallet | null; weeklyUsedSeconds?: number; seats?: number }): PitchBalance {
  const freeSecondsLeft = Math.max(0, FREE_SECONDS - (input.wallet?.free_seconds_used ?? 0));
  const credits = Math.max(0, input.wallet?.credits ?? 0);
  const topupSeconds = Math.max(0, input.wallet?.topup_seconds ?? 0);
  const base = { freeSecondsLeft, credits, topupSeconds };
  if (input.plan === "unlimited") {
    return { ...base, plan: "unlimited", weekly: null, paid: true, maxSeconds: UNLIMITED_MAX_SECONDS, canPitch: true };
  }
  if (input.plan === "pro") {
    const usedSeconds = Math.max(0, input.weeklyUsedSeconds ?? 0);
    const limitSeconds = proWeeklyLimit(input.seats);
    const remaining = Math.max(0, limitSeconds - usedSeconds) + topupSeconds;
    return {
      ...base,
      plan: "pro",
      weekly: { limitSeconds, usedSeconds },
      paid: true,
      maxSeconds: Math.min(CUSTOM_MAX_SECONDS, remaining),
      canPitch: remaining >= MIN_RECORD_SECONDS,
    };
  }
  const maxSeconds = credits > 0 ? CUSTOM_MAX_SECONDS : Math.min(CUSTOM_MAX_SECONDS, freeSecondsLeft);
  return { ...base, plan: "free", weekly: null, paid: credits > 0, maxSeconds, canPitch: maxSeconds >= MIN_RECORD_SECONDS };
}

/**
 * Zostatok člena firemného tímu: každý člen má vlastných 10 minút zadarmo (z vlastnej peňaženky),
 * potom trénuje z plánu vlastníka tímu. Keď vlastník plán nemá (Free), člen sa správa ako Free.
 */
export function memberBalance(owner: PitchBalance, ownWallet: PitchWallet | null): PitchBalance {
  if (owner.plan === "free") return pitchBalance({ free_used: 0, credits: 0, free_seconds_used: ownWallet?.free_seconds_used ?? 0 });
  const own = Math.max(0, FREE_SECONDS - (ownWallet?.free_seconds_used ?? 0));
  const maxSeconds = owner.plan === "unlimited" ? owner.maxSeconds : Math.min(CUSTOM_MAX_SECONDS, owner.maxSeconds + own);
  return { ...owner, freeSecondsLeft: own, maxSeconds, canPitch: owner.canPitch || own >= MIN_RECORD_SECONDS };
}

/** Prejav člena pri platenom pláne vlastníka: najprv sa míňa člen vlastný čas zadarmo, zvyšok plán. */
export function splitMemberSpeech(seconds: number, ownFreeSecondsUsed: number): { fromOwnFree: number; fromPlan: number } {
  const left = Math.max(0, FREE_SECONDS - ownFreeSecondsUsed);
  const fromOwnFree = Math.min(seconds, left);
  return { fromOwnFree, fromPlan: seconds - fromOwnFree };
}

/** Zostatok bez predplatného (plán Free). */
export function pitchBalance(wallet: PitchWallet | null): PitchBalance {
  return balanceFor({ plan: "free", wallet });
}

/**
 * Peňaženka po prejave v pláne Free: ak sa prejav zmestí do času zadarmo, míňa sa čas;
 * inak (dlhší prejav so starším balíkom) jeden kredit.
 */
export function afterFreeSpeech(wallet: PitchWallet | null, seconds: number): PitchWallet {
  const w: PitchWallet = { ...wallet, free_used: wallet?.free_used ?? 0, credits: wallet?.credits ?? 0 };
  const used = w.free_seconds_used ?? 0;
  const left = Math.max(0, FREE_SECONDS - used);
  if (seconds <= left || w.credits <= 0) return { ...w, free_seconds_used: Math.min(FREE_SECONDS, used + seconds) };
  return { ...w, credits: w.credits - 1 };
}

/** Pro: koľko dokúpených sekúnd ostane po prejave (najprv sa míňa týždenný limit). */
export function topupAfter(input: { weeklyUsedSeconds: number; topupSeconds: number; seconds: number; seats?: number }): number {
  const weeklyLeft = Math.max(0, proWeeklyLimit(input.seats) - input.weeklyUsedSeconds);
  const fromTopup = Math.max(0, input.seconds - weeklyLeft);
  return Math.max(0, input.topupSeconds - fromTopup);
}

const minutes = (seconds: number) => Math.floor(seconds / 60);

export function balanceLabel(balance: PitchBalance, locale: "sk" | "en" = "sk"): string {
  const en = locale === "en";
  if (balance.plan === "unlimited") return en ? "Unlimited: no time limit." : "Unlimited: bez časového limitu.";
  if (balance.plan === "pro" && balance.weekly) {
    const left = minutes(Math.max(0, balance.weekly.limitSeconds - balance.weekly.usedSeconds));
    const topup = minutes(balance.topupSeconds);
    const week = en ? `${left} of ${minutes(balance.weekly.limitSeconds)} min left this week` : `Tento týždeň zostáva ${left} z ${minutes(balance.weekly.limitSeconds)} min`;
    return topup > 0 ? (en ? `${week}, plus ${topup} extra min.` : `${week}, k tomu ${topup} dokúpených min.`) : `${week}.`;
  }
  const free = minutes(balance.freeSecondsLeft);
  const parts: string[] = [];
  if (free > 0) parts.push(en ? `${free} free min` : `${free} min zadarmo`);
  if (balance.credits > 0) parts.push(en ? `${balance.credits} purchased ${balance.credits === 1 ? "talk" : "talks"}` : `${balance.credits} zakúpených prejavov`);
  if (en) return parts.length ? `You have ${parts.join(" and ")} left.` : "Your free minutes are used up.";
  return parts.length ? `Zostáva ti ${parts.join(" a ")}.` : "Minúty zadarmo sú minuté.";
}

/** Zostatok člena firemného tímu: vlastné minúty zadarmo a potom plán tímu. */
export function teamBalanceLabel(balance: PitchBalance, locale: "sk" | "en" = "sk"): string {
  const en = locale === "en";
  const free = minutes(balance.freeSecondsLeft);
  if (balance.plan === "free") return balanceLabel(balance, locale);
  const plan = balanceLabel(balance, locale);
  if (free <= 0) return en ? `Team plan: ${plan}` : `Plán tímu: ${plan}`;
  return en ? `You have ${free} free min of your own, then you train on the team plan. ${plan}` : `Máš ešte ${free} min zadarmo, potom trénuješ z plánu tímu. ${plan}`;
}

export function lengthLabel(seconds: number): string {
  return seconds >= 60 ? `${Math.round((seconds / 60) * 10) / 10} min` : `${seconds} s`;
}

/** Platná dĺžka nahrávania: predvolená alebo vlastná v celých minútach (do hodiny; či ju plán dovolí, určuje zostatok). */
export function isValidLength(seconds: number): boolean {
  if ((RECORD_LENGTHS as readonly number[]).includes(seconds)) return true;
  return Number.isInteger(seconds) && seconds % 60 === 0 && seconds >= CUSTOM_MIN_SECONDS && seconds <= UNLIMITED_MAX_SECONDS;
}

/** Smie teraz nahrať prejav tejto dĺžky? (null = bez paywallu) */
export function canUseLength(seconds: number, balance: PitchBalance | null): boolean {
  return balance === null || seconds <= balance.maxSeconds;
}

/** Najdlhšia povolená dĺžka, ktorá nepresiahne zvolenú (napr. keď zostáva pár minút). */
export function fitLength(seconds: number, balance: PitchBalance | null): number {
  if (canUseLength(seconds, balance) || !balance) return seconds;
  const limit = Math.min(seconds, balance.maxSeconds);
  const wholeMinutes = Math.floor(limit / 60) * 60;
  const preset = [...RECORD_LENGTHS].reverse().find((l) => l <= limit) ?? RECORD_LENGTHS[0];
  return wholeMinutes >= CUSTOM_MIN_SECONDS && wholeMinutes > preset ? wholeMinutes : preset;
}
