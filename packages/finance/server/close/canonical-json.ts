import { createHash } from "node:crypto";

function canonicalValue(value: unknown, seen: Set<object>): unknown {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical JSON only accepts finite numbers");
    return value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => canonicalValue(item, seen));
  if (typeof value !== "object") throw new Error("Value is not JSON serializable");
  if (seen.has(value)) throw new Error("Canonical JSON does not accept circular values");

  seen.add(value);
  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    if (record[key] !== undefined) normalized[key] = canonicalValue(record[key], seen);
  }
  seen.delete(value);
  return normalized;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(canonicalValue(value, new Set()));
}

export function sha256CanonicalJson(value: unknown) {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
