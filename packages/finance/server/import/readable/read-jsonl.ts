import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { createInterface } from "node:readline";

export type JsonRow = Record<string, unknown>;

export async function readJsonLines(filePath: string): Promise<JsonRow[]> {
  try {
    await access(filePath);
  } catch {
    return [];
  }
  const rows: JsonRow[] = [];
  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    rows.push(JSON.parse(line) as JsonRow);
  }
  return rows;
}

export function value(row: JsonRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  const lower = new Map(Object.entries(row).map(([key, item]) => [key.toLowerCase(), item]));
  for (const key of keys) {
    if (lower.has(key.toLowerCase())) return lower.get(key.toLowerCase());
  }
  return undefined;
}

export function textValue(row: JsonRow, ...keys: string[]): string {
  const item = value(row, ...keys);
  return item === null || item === undefined ? "" : String(item).trim();
}

export function numberValue(row: JsonRow, ...keys: string[]): number {
  const item = value(row, ...keys);
  if (item === null || item === undefined || item === "") return 0;
  const parsed = Number(item);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function booleanValue(row: JsonRow, ...keys: string[]): boolean {
  const item = value(row, ...keys);
  return item === true || item === 1 || item === "1" || item === "true";
}

export function nullableBooleanValue(row: JsonRow, ...keys: string[]): boolean | null {
  const item = value(row, ...keys);
  if (item === null || item === undefined || item === "") return null;
  return item === true || item === 1 || item === "1" || item === "true";
}

export function optionalText(row: JsonRow, ...keys: string[]): string | undefined {
  return textValue(row, ...keys) || undefined;
}

export function dateText(item: unknown): string | undefined {
  if (item === null || item === undefined) return undefined;
  const raw = String(item).trim();
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0];
}

export function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

export function splitBalance(amount: number, direction: "debit" | "credit") {
  const normalized = roundMoney(amount);
  if (normalized === 0) return { debit: 0, credit: 0 };
  const effective = normalized > 0 ? direction : direction === "debit" ? "credit" : "debit";
  return effective === "debit"
    ? { debit: Math.abs(normalized), credit: 0 }
    : { debit: 0, credit: Math.abs(normalized) };
}
