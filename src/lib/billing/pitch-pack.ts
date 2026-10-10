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

export const formatEur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

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
