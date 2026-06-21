import path from "path";
import { readFile } from "fs/promises";
import type { QcRecommendedRange } from "./types";

export type LayoutParams = Record<string, unknown>;

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }

export function values(value: unknown): unknown[] {
  return Array.isArray(value) ? value : Object.values(asRecord(value));
}

export function asString(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

export async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await readFile(filePath, "utf8")) as unknown;
}

export async function readOptionalJson(filePath: string): Promise<unknown> {
  const raw = await readFile(filePath, "utf8").catch(() => "");
  return raw ? JSON.parse(raw) as unknown : undefined;
}

export function asBoolean(value: unknown) { return typeof value === "boolean" ? value : undefined; }

export function asNumber(value: unknown, fallback = 1) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

export function maybeNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function maybePositiveNumber(value: unknown) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : undefined;
}

export function stringRecord(value: unknown): Record<string, string> | undefined {
  const record = asRecord(value);
  const entries = Object.entries(record)
    .map(([key, val]) => [key, asString(val)] as const)
    .filter(([, val]) => !!val);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function stringArrayRecord(value: unknown): Record<string, string[]> | undefined {
  const record = asRecord(value);
  const entries = Object.entries(record)
    .map(([key, val]) => [key, asArray(val).map((item) => asString(item)).filter(Boolean)] as const)
    .filter(([, val]) => val.length > 0);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export function asRange(value: unknown): QcRecommendedRange | undefined {
  if (Array.isArray(value)) {
    return { min: maybeNumber(value[0]) ?? null, max: maybeNumber(value[1]) ?? null };
  }
  const range = asRecord(value);
  const min = maybeNumber(range.min);
  const max = maybeNumber(range.max);
  return min === undefined && max === undefined ? undefined : { min: min ?? null, max: max ?? null };
}

export function normalizeKey(key: string) {
  const clean = path.posix.normalize(key.replace(/\\/g, "/").replace(/\.json$/, ""));
  if (!clean || clean.startsWith("../") || clean === ".." || path.isAbsolute(clean)) {
    throw new Error("Invalid QC layout key");
  }
  return clean;
}

export function safeFile(root: string, key: string) {
  const filePath = path.resolve(root, `${normalizeKey(key)}.json`);
  if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
    throw new Error("Invalid QC layout key");
  }
  return filePath;
}

export function widthFromChars(value: unknown) {
  const chars = Number(value);
  if (!Number.isFinite(chars) || chars <= 0) return undefined;
  return `${Math.max(2.5, chars * 0.62)}rem`;
}

export function paramString(params: LayoutParams, name: string) {
  const value = params[name];
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

export function formatText(text: string, params: LayoutParams) {
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}|\{\s*([\w.-]+)\s*\}/g, (match, a, b) => {
    const key = a || b;
    const value = params[key];
    return value === undefined || typeof value === "object" ? match : String(value);
  });
}

export function substitute(value: unknown, params: LayoutParams): unknown {
  if (typeof value === "string") return formatText(value, params);
  if (Array.isArray(value)) return value.map((item) => substitute(item, params));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, val]) => [key, substitute(val, params)]));
  }
  return value;
}
