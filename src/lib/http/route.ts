import "server-only";

import { NextResponse } from "next/server";
import type { z } from "zod";
import { getCurrentUser, type AuthUser } from "@/lib/auth/session";
import { DbError } from "@/lib/db/core";
import { consumeRateLimit, type RateLimitRule } from "@/lib/security/rate-limit";

/*
  Spoločné správanie API: overenie používateľa, validácia tela, limit pokusov
  a preklad chýb na HTTP odpovede bez úniku interných detailov.
*/

export type ApiError = { error: { code: string; message: string } };

export function apiError(status: number, code: string, message: string): NextResponse<ApiError> {
  return NextResponse.json({ error: { code, message } }, { status, headers: { "Cache-Control": "no-store" } });
}

export function apiOk<T>(data: T, status = 200): NextResponse<T> {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export async function requireApiUser(): Promise<AuthUser | NextResponse<ApiError>> {
  const user = await getCurrentUser();
  if (!user) return apiError(401, "unauthorized", "Prihlás sa znova.");
  return user;
}

export function rateLimited(userId: string, scope: string, rule: RateLimitRule): NextResponse<ApiError> | null {
  if (consumeRateLimit(`${scope}:${userId}`, rule)) return null;
  return apiError(429, "rate_limited", "Príliš veľa požiadaviek za krátky čas. Skús to o chvíľu.");
}

export async function parseJson<T>(request: Request, schema: z.ZodType<T>): Promise<T | NextResponse<ApiError>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, "invalid_json", "Neplatné telo požiadavky.");
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return apiError(400, "invalid_request", "Neplatné údaje v požiadavke.");
  return parsed.data;
}

export { isUuid } from "@/lib/validation/ids";

/** Známe chyby → zrozumiteľná odpoveď; neznáme → 500 bez detailov (detail iba do logu). */
export function handleRouteError(error: unknown, context: string): NextResponse<ApiError> {
  if (error instanceof DbError) {
    if (error.code === "not_found") return apiError(404, "not_found", "Záznam neexistuje.");
    if (error.code === "forbidden") return apiError(403, "forbidden", "Na túto akciu nemáš oprávnenie.");
    if (error.code === "conflict") return apiError(409, "conflict", "Záznam už existuje.");
  }
  console.error(`[api] ${context}:`, error instanceof Error ? error.message.slice(0, 300) : error);
  return apiError(500, "internal", "Niečo sa pokazilo. Skús to znova.");
}
