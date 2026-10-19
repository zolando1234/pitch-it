import "server-only";

import type { StoreError as PostgrestError } from "@/lib/store/db";

// bez TS „parameter properties“: testy bežia v Node strip-only režime
export class DbError extends Error {
  readonly code: "not_found" | "forbidden" | "conflict" | "query_failed";
  constructor(code: DbError["code"], message: string) {
    super(message);
    this.code = code;
    this.name = "DbError";
  }
}

/** Preloží chybu úložiska na DbError. Správu nelogujeme s údajmi používateľa. */
export function toDbError(error: PostgrestError, context: string): DbError {
  if (error.code === "23505") return new DbError("conflict", `${context}: duplicitný záznam`);
  if (error.code === "42501") return new DbError("forbidden", `${context}: prístup zamietnutý`);
  if (error.code === "PGRST116") return new DbError("not_found", `${context}: záznam neexistuje`);
  return new DbError("query_failed", `${context}: ${error.code ?? ""} ${error.message}`);
}

export function must<T>(result: { data: T | null; error: PostgrestError | null }, context: string): T {
  if (result.error) throw toDbError(result.error, context);
  if (result.data === null) throw new DbError("not_found", `${context}: prázdna odpoveď`);
  return result.data;
}

export function check(result: { error: PostgrestError | null }, context: string): void {
  if (result.error) throw toDbError(result.error, context);
}
