import { createHash } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

/** Stable digest used to prove that an idempotency key is replaying the same business command. */
export function businessTemporalRequestFingerprint(value: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function businessTemporalIdempotencyMatches(stored: string | null | undefined, requested: string) {
  return Boolean(stored) && stored === requested;
}
