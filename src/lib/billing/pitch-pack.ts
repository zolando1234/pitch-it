/*
  Paywall nahraného pitchu: prvé 3 pitche sú zadarmo (raz navždy), potom sa kupujú balíky.
  Pitch sa započíta, až keď je analýza hotová; zlyhaná analýza kredit nemíňa.
*/

export const FREE_PITCHES = 3;

export const PITCH_PACK = {
  credits: 10,
  /** cena v centoch; zľavový kód (napr. SWZA) sa zadáva priamo v Stripe Checkoute */
  priceCents: 1999,
  currency: "eur",
  name: "PitchIt: 10 pitchov",
} as const;

/** Zľavový kód zo Startup Weekendu Žilina (kupón v Stripe: −18,99 €). Zákazník ho zadá v Stripe Checkoute. */
export const PITCH_PROMO = { code: "SWZA", priceCents: 100 } as const;

export const formatEur = (cents: number, locale: "sk" | "en" = "sk") =>
  locale === "en" ? `€${(cents / 100).toFixed(2)}` : `${(cents / 100).toFixed(2).replace(".", ",")} €`;

export type PitchWallet = { free_used: number; credits: number };

export type PitchBalance = {
  /** zostávajúce pitche zadarmo */
  freeLeft: number;
  /** zakúpené pitche */
  credits: number;
  canPitch: boolean;
};

export function pitchBalance(wallet: PitchWallet | null): PitchBalance {
  const freeLeft = Math.max(0, FREE_PITCHES - (wallet?.free_used ?? 0));
  const credits = Math.max(0, wallet?.credits ?? 0);
  return { freeLeft, credits, canPitch: freeLeft + credits > 0 };
}

/** Stav peňaženky po jednom analyzovanom pitchi: najprv sa míňajú pitche zadarmo. */
export function afterPitch(wallet: PitchWallet | null): PitchWallet {
  const w = { free_used: wallet?.free_used ?? 0, credits: wallet?.credits ?? 0 };
  if (w.free_used < FREE_PITCHES) return { ...w, free_used: w.free_used + 1 };
  return { ...w, credits: Math.max(0, w.credits - 1) };
}

export function balanceLabel(balance: PitchBalance, locale: "sk" | "en" = "sk"): string {
  const parts: string[] = [];
  if (locale === "en") {
    if (balance.freeLeft > 0) parts.push(`${balance.freeLeft} free ${balance.freeLeft === 1 ? "pitch" : "pitches"}`);
    if (balance.credits > 0) parts.push(`${balance.credits} purchased`);
    return parts.length ? `You have ${parts.join(" and ")} left.` : "You have no pitches left.";
  }
  if (balance.freeLeft > 0) parts.push(`${balance.freeLeft} ${balance.freeLeft === 1 ? "pitch" : "pitche"} zadarmo`);
  if (balance.credits > 0) parts.push(`${balance.credits} zakúpených`);
  return parts.length ? `Zostáva ti ${parts.join(" a ")}.` : "Nemáš žiadne pitche.";
}

/** Predvolené dĺžky nahrávania (sekundy). Dlhšie ako 3 minúty sú len pre platiacich (kúpený balík). */
export const RECORD_LENGTHS = [30, 60, 180, 240] as const;
export type RecordLength = number;
export const PAID_LENGTH = 240;
/** najdlhšie bezplatné nahrávanie */
export const FREE_MAX_SECONDS = 180;
/** vlastná dĺžka (platená verzia): celé minúty */
export const CUSTOM_MIN_SECONDS = 60;
export const CUSTOM_MAX_SECONDS = 30 * 60;

export function lengthLabel(seconds: number): string {
  return seconds >= 60 ? `${Math.round((seconds / 60) * 10) / 10} min` : `${seconds} s`;
}

/** Platná dĺžka nahrávania: predvolená alebo vlastná v celých minútach. */
export function isValidLength(seconds: number): boolean {
  if ((RECORD_LENGTHS as readonly number[]).includes(seconds)) return true;
  return Number.isInteger(seconds) && seconds % 60 === 0 && seconds >= CUSTOM_MIN_SECONDS && seconds <= CUSTOM_MAX_SECONDS;
}

/** Dlhšie ako 3 minúty smie nahrať, kto má kúpené pitche (null = bez paywallu). */
export function canUseLength(seconds: number, balance: PitchBalance | null): boolean {
  return seconds <= FREE_MAX_SECONDS || balance === null || balance.credits > 0;
}
