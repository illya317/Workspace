import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import type { MarketStockCatalogItem } from "../types/market-intelligence";
import { validateMarketStockCatalogCacheWrite } from "./domain/market-cache-validation";
import { marketHistoryCacheDirectory } from "./market-intelligence-cache";

const CACHE_VERSION = 1;
const CACHE_FILE_NAME = "stock-catalog-v1.json";
const MAX_CACHE_FILE_BYTES = 12 * 1024 * 1024;
const MAX_CACHE_ITEMS = 40_000;

export type MarketStockCatalogCacheRecord = {
  updatedAt: string;
  expiresAt: number;
  items: MarketStockCatalogItem[];
};

type CacheOptions = {
  cacheDir?: string | null;
};

type MarketStockCatalogCacheFile = MarketStockCatalogCacheRecord & {
  version: typeof CACHE_VERSION;
};

export function marketStockCatalogCacheDirectory(env: NodeJS.ProcessEnv = process.env) {
  const base = marketHistoryCacheDirectory(env);
  return base ? path.join(base, "catalog") : null;
}

export async function readMarketStockCatalogCache(options: CacheOptions = {}) {
  const cacheDir = resolvedCacheDirectory(options);
  if (!cacheDir) return null;
  const filePath = path.join(cacheDir, CACHE_FILE_NAME);
  try {
    const fileStat = await stat(filePath);
    if (fileStat.size > MAX_CACHE_FILE_BYTES) return null;
    const parsed = JSON.parse(await readFile(filePath, "utf8")) as unknown;
    if (!validCacheFile(parsed)) return null;
    return { updatedAt: parsed.updatedAt, expiresAt: parsed.expiresAt, items: parsed.items };
  } catch {
    return null;
  }
}

export async function writeMarketStockCatalogCache(
  record: MarketStockCatalogCacheRecord,
  options: CacheOptions = {},
) {
  const cacheDir = resolvedCacheDirectory(options);
  const validated = validateMarketStockCatalogCacheWrite({ ...record, maxItems: MAX_CACHE_ITEMS });
  if (!cacheDir || !validated.ok) return false;
  record = validated.data;
  const filePath = path.join(cacheDir, CACHE_FILE_NAME);
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  const payload: MarketStockCatalogCacheFile = { version: CACHE_VERSION, ...record };
  const serialized = `${JSON.stringify(payload)}\n`;
  if (Buffer.byteLength(serialized) > MAX_CACHE_FILE_BYTES) return false;
  try {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(temporaryPath, serialized, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, filePath);
    return true;
  } catch {
    await unlink(temporaryPath).catch(() => undefined);
    return false;
  }
}

function resolvedCacheDirectory(options: CacheOptions) {
  return Object.prototype.hasOwnProperty.call(options, "cacheDir")
    ? options.cacheDir ?? null
    : marketStockCatalogCacheDirectory();
}

function validCacheFile(value: unknown): value is MarketStockCatalogCacheFile {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<MarketStockCatalogCacheFile>;
  return record.version === CACHE_VERSION
    && typeof record.updatedAt === "string"
    && Number.isFinite(Date.parse(record.updatedAt))
    && typeof record.expiresAt === "number"
    && Number.isFinite(record.expiresAt)
    && Array.isArray(record.items)
    && record.items.length <= MAX_CACHE_ITEMS
    && record.items.every(validCatalogItem);
}

function validCatalogItem(value: unknown): value is MarketStockCatalogItem {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as Partial<MarketStockCatalogItem>;
  return (item.market === "CN" || item.market === "HK" || item.market === "US")
    && typeof item.symbol === "string"
    && Boolean(item.symbol)
    && typeof item.name === "string"
    && Boolean(item.name)
    && typeof item.sourceLabel === "string"
    && Boolean(item.sourceLabel);
}
