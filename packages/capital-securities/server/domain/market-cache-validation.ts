import { failCommand, okCommand } from "@workspace/platform/server/domain-validation";
import type { MarketStockCatalogItem } from "../../types/market-intelligence";

export function validateMarketHistoryCacheWrite(input: {
  key: string;
  rows: readonly Record<string, unknown>[];
  expiresAt: number;
  maxRows: number;
}) {
  if (!input.key.trim() || input.key.length > 1_024) return failCommand("行情缓存键无效", 400, "key");
  if (!Number.isFinite(input.expiresAt)) return failCommand("行情缓存过期时间无效", 400, "expiresAt");
  if (input.rows.length > input.maxRows) return failCommand("行情缓存记录数超过上限", 400, "rows");
  if (input.rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) {
    return failCommand("行情缓存记录格式无效", 400, "rows");
  }
  return okCommand({ key: input.key, rows: input.rows, expiresAt: input.expiresAt });
}

export function validateMarketStockCatalogCacheWrite(input: {
  updatedAt: string;
  expiresAt: number;
  items: readonly MarketStockCatalogItem[];
  maxItems: number;
}) {
  if (!Number.isFinite(Date.parse(input.updatedAt))) return failCommand("股票目录更新时间无效", 400, "updatedAt");
  if (!Number.isFinite(input.expiresAt)) return failCommand("股票目录过期时间无效", 400, "expiresAt");
  if (input.items.length > input.maxItems) return failCommand("股票目录记录数超过上限", 400, "items");
  if (input.items.some((item) => !validCatalogItem(item))) return failCommand("股票目录记录格式无效", 400, "items");
  return okCommand({ updatedAt: input.updatedAt, expiresAt: input.expiresAt, items: [...input.items] });
}

function validCatalogItem(item: MarketStockCatalogItem) {
  return (item.market === "CN" || item.market === "HK" || item.market === "US")
    && Boolean(item.symbol.trim())
    && Boolean(item.name.trim())
    && Boolean(item.sourceLabel.trim());
}
