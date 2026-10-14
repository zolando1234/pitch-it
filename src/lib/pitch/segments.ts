import "server-only";

import { getKv } from "@/lib/store/kv";
import type { TranscribedSegment } from "@/lib/pitch/segment-merge";

/*
  Prepísané úseky rozpracovaného prejavu (Redis, 3 hodiny). Kľúč obsahuje id používateľa,
  takže cudzí koncept sa načítať nedá.
*/

const TTL_SECONDS = 3 * 60 * 60;
const key = (userId: string, draftId: string, index: number) => `pitch:draft:${userId}:${draftId}:${index}`;

export async function saveSegment(userId: string, draftId: string, segment: TranscribedSegment): Promise<void> {
  await getKv().set(key(userId, draftId, segment.index), JSON.stringify(segment), TTL_SECONDS);
}

export async function loadSegments(userId: string, draftId: string, count: number): Promise<TranscribedSegment[]> {
  if (count <= 0) return [];
  const values = await getKv().mget(Array.from({ length: count }, (_, i) => key(userId, draftId, i)));
  const segments: TranscribedSegment[] = [];
  for (const value of values) {
    if (!value) continue;
    try {
      segments.push(JSON.parse(value) as TranscribedSegment);
    } catch {
      // poškodený úsek sa berie ako chýbajúci
    }
  }
  return segments;
}

export async function dropSegments(userId: string, draftId: string, count: number): Promise<void> {
  if (count > 0) await getKv().del(Array.from({ length: count }, (_, i) => key(userId, draftId, i)));
}
