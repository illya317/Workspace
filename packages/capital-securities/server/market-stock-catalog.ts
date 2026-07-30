import "server-only";

import type {
  MarketStockCatalogSearchResult,
  MarketStockRegion,
} from "../types/market-intelligence";
import {
  mergeMarketStockCatalogs,
  normalizeAStockCatalog,
  normalizeHkStockCatalog,
  parseNasdaqTraderCatalog,
  searchMarketStockCatalogItems,
} from "./domain/market-stock-catalog";
import {
  readMarketStockCatalogCache,
  writeMarketStockCatalogCache,
  type MarketStockCatalogCacheRecord,
} from "./market-stock-catalog-cache";

const CATALOG_CACHE_MS = 24 * 60 * 60_000;
const AKTOOLS_TIMEOUT_MS = 95_000;
const REFERENCE_TIMEOUT_MS = 20_000;
const SEARCH_RESULT_LIMIT = 80;
const NASDAQ_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt";
const OTHER_LISTED_URL = "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt";

let memoryCache: MarketStockCatalogCacheRecord | null = null;
let cacheRead: Promise<MarketStockCatalogCacheRecord | null> | null = null;
let refresh: Promise<MarketStockCatalogCacheRecord> | null = null;

export async function searchMarketStockCatalog(input: {
  query: string;
  market?: MarketStockRegion;
}): Promise<MarketStockCatalogSearchResult> {
  const cached = await currentCatalog();
  const now = Date.now();
  if (cached && cached.expiresAt <= now) void refreshCatalog().catch(() => undefined);
  const catalog = cached ?? await refreshCatalog();
  const result = searchMarketStockCatalogItems({
    items: catalog.items,
    query: input.query,
    market: input.market,
    limit: SEARCH_RESULT_LIMIT,
  });
  return {
    generatedAt: new Date(now).toISOString(),
    updatedAt: catalog.updatedAt,
    nextRefreshAt: new Date(catalog.expiresAt).toISOString(),
    stale: catalog.expiresAt <= now,
    total: catalog.items.length,
    matchCount: result.matchCount,
    marketTotals: marketTotals(catalog.items),
    matches: result.matches,
  };
}

export async function warmMarketStockCatalog() {
  const cached = await currentCatalog();
  if (!cached || cached.expiresAt <= Date.now()) await refreshCatalog();
}

async function currentCatalog() {
  if (memoryCache) return memoryCache;
  cacheRead ??= readMarketStockCatalogCache();
  memoryCache = await cacheRead;
  return memoryCache;
}

async function refreshCatalog() {
  if (refresh) return refresh;
  refresh = (async () => {
    const baseUrl = configuredBaseUrl();
    if (!baseUrl) throw new Error("市场目录 provider 未配置");
    const [aRows, hkRows, nasdaqListed, otherListed] = await Promise.all([
      loadAkToolsRows(baseUrl, "stock_info_a_code_name"),
      loadAkToolsRows(baseUrl, "stock_hk_spot"),
      loadReferenceText(NASDAQ_LISTED_URL),
      loadReferenceText(OTHER_LISTED_URL),
    ]);
    const items = mergeMarketStockCatalogs([
      normalizeAStockCatalog(aRows),
      normalizeHkStockCatalog(hkRows),
      parseNasdaqTraderCatalog(nasdaqListed),
      parseNasdaqTraderCatalog(otherListed),
    ]);
    if (items.length < 10_000) throw new Error("市场目录数据不完整");
    const now = Date.now();
    const record = {
      updatedAt: new Date(now).toISOString(),
      expiresAt: now + CATALOG_CACHE_MS,
      items,
    } satisfies MarketStockCatalogCacheRecord;
    memoryCache = record;
    await writeMarketStockCatalogCache(record);
    return record;
  })().finally(() => {
    refresh = null;
  });
  return refresh;
}

async function loadAkToolsRows(baseUrl: URL, endpoint: string) {
  const url = new URL(`api/public/${endpoint}`, ensureTrailingSlash(baseUrl));
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(AKTOOLS_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`股票目录 provider 请求失败: ${endpoint}`);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error(`股票目录 provider 响应无效: ${endpoint}`);
  return payload.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
}

async function loadReferenceText(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "text/plain", "User-Agent": "Workspace market catalog/1.0" },
    cache: "no-store",
    signal: AbortSignal.timeout(REFERENCE_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("美股证券目录请求失败");
  return response.text();
}

function configuredBaseUrl() {
  const raw = process.env.MARKET_INTELLIGENCE_AKTOOLS_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function ensureTrailingSlash(url: URL) {
  const normalized = new URL(url);
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  return normalized;
}

function marketTotals(items: readonly { market: MarketStockRegion }[]) {
  const totals: Record<MarketStockRegion, number> = { CN: 0, HK: 0, US: 0 };
  for (const item of items) totals[item.market] += 1;
  return totals;
}
