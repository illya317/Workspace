import "server-only";
import path from "path";
import { readFile } from "fs/promises";
import type { QcLayoutBlock, QcLayoutCell, QcLayoutPart } from "./types";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = "") {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown, fallback = 1) {
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : fallback;
}

function normalizeLayoutKey(key: string) {
  const clean = path.posix.normalize(key.replace(/\\/g, "/").replace(/\.json$/, ""));
  if (!clean || clean.startsWith("../") || clean === ".." || path.isAbsolute(clean)) {
    throw new Error("Invalid QC layout key");
  }
  return clean;
}

function mapPart(value: unknown): QcLayoutPart {
  const part = asRecord(value);
  return {
    type: asString(part.type, "text"),
    text: asString(part.text) || undefined,
    fieldKey: asString(part.field_key || part.fieldKey) || undefined,
    options: asArray(part.options).map((option) => asString(option)).filter(Boolean),
    width: asString(part.width) || undefined,
    withTime: asBoolean(part.with_time ?? part.withTime),
  };
}

function mapCell(value: unknown): QcLayoutCell {
  const cell = asRecord(value);
  return {
    rawText: asString(cell.raw_text || cell.rawText),
    parts: asArray(cell.parts).map(mapPart),
    colspan: asNumber(cell.colspan),
    rowspan: asNumber(cell.rowspan),
    isEmpty: cell.is_empty === true || cell.isEmpty === true,
    className: asString(cell.className) || undefined,
  };
}

function mapBlock(value: unknown): QcLayoutBlock | null {
  const block = asRecord(value);
  const rows = asArray(block.rows).map((row) => asArray(asRecord(row).cells).map(mapCell));
  if (rows.length === 0) return null;
  return {
    type: asString(block.type, "table"),
    label: asString(block.label) || undefined,
    rows,
  };
}

export async function loadQcLayoutBlocks(configRoot: string, key?: string): Promise<QcLayoutBlock[] | undefined> {
  if (!key) return undefined;
  const layoutKey = normalizeLayoutKey(key);
  const layoutRoot = path.resolve(configRoot, "table_layouts");
  const filePath = path.resolve(layoutRoot, `${layoutKey}.json`);
  if (filePath !== layoutRoot && !filePath.startsWith(`${layoutRoot}${path.sep}`)) {
    throw new Error("Invalid QC layout key");
  }
  const raw = await readFile(filePath, "utf8").catch(() => "");
  if (!raw) return undefined;
  const data = JSON.parse(raw) as unknown;
  const blocks = asArray(asRecord(data).blocks).map(mapBlock).filter((block): block is QcLayoutBlock => !!block);
  return blocks.length ? blocks : undefined;
}
