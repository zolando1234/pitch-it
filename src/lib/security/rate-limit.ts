/*
  Rýchly limit v pamäti jednej inštancie servera (posuvné okno).
  Na serverless nie je zdieľaný medzi inštanciami: pre drahé operácie ho
  dopĺňajú limity v databáze (spotreba, počet pripojení relácie).
*/

export type RateLimitRule = { limit: number; windowMs: number };

const MAX_KEYS = 10_000;
const buckets = new Map<string, number[]>();

export function consumeRateLimit(key: string, rule: RateLimitRule, now = Date.now()): boolean {
  const recent = (buckets.get(key) ?? []).filter((time) => now - time < rule.windowMs);
  if (recent.length >= rule.limit) {
    buckets.set(key, recent);
    return false;
  }
  recent.push(now);
  buckets.set(key, recent);

  if (buckets.size > MAX_KEYS) {
    for (const [storedKey, times] of buckets) {
      if (times.every((time) => now - time >= rule.windowMs)) buckets.delete(storedKey);
    }
    while (buckets.size > MAX_KEYS) {
      const oldest = buckets.keys().next().value;
      if (oldest === undefined) break;
      buckets.delete(oldest);
    }
  }
  return true;
}

export const RATE_LIMITS = {
  realtimeConnect: { limit: 12, windowMs: 60 * 60 * 1000 },
  textTurn: { limit: 40, windowMs: 10 * 60 * 1000 },
  hint: { limit: 15, windowMs: 10 * 60 * 1000 },
  upload: { limit: 10, windowMs: 60 * 60 * 1000 },
  exerciseAttempt: { limit: 30, windowMs: 60 * 60 * 1000 },
  auth: { limit: 10, windowMs: 10 * 60 * 1000 },
  report: { limit: 10, windowMs: 60 * 60 * 1000 },
  micLink: { limit: 20, windowMs: 60 * 60 * 1000 },
  pitchContext: { limit: 60, windowMs: 60 * 60 * 1000 },
  pitchSegment: { limit: 400, windowMs: 60 * 60 * 1000 },
  pitchQuestions: { limit: 30, windowMs: 60 * 60 * 1000 },
  micAnswer: { limit: 10, windowMs: 10 * 60 * 1000 },
  /** odoslania pozvánok do tímu (každé môže mať viac e-mailov) */
  teamInvite: { limit: 15, windowMs: 60 * 60 * 1000 },
} as const satisfies Record<string, RateLimitRule>;
