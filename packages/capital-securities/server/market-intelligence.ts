import "server-only";

import type {
  MarketFinancialSummary,
  MarketInstrumentSnapshot,
  MarketIntelligenceSnapshot,
  MarketNewsItem,
  MarketProviderStatus,
  MarketReportReminder,
} from "../types/market-intelligence";
import {
  MARKET_INSTRUMENT_CATALOG,
  createMarketStockDefinitions,
  marketFinancialSummary,
  marketNewsItems,
  marketStockId,
  marketTrendRequest,
  marketTrendPoints,
  matchAStockDisclosureReminder,
  matchGlobalReportReminder,
  matchMarketQuoteRow,
  normalizeMarketInstrumentIds,
  normalizeMarketStockSubscriptions,
  publicInstrument,
  requestKey,
  stockFinancialRequest,
  stockNewsRequest,
  type AkToolsRequest,
  type MarketInstrumentDefinition,
} from "./domain/market-intelligence";
import { createMarketTrendSeries, emptyMarketTrendSeries } from "./domain/market-trend-periods";
import { readMarketHistoryCache, writeMarketHistoryCache } from "./market-intelligence-cache";
import { warmMarketStockCatalog } from "./market-stock-catalog";

const PROVIDER_CACHE_MS = 90_000;
const STOCK_HISTORY_CACHE_MS = 30 * 60_000;
const NEWS_CACHE_MS = 5 * 60_000;
const REFERENCE_CACHE_MS = 6 * 60 * 60_000;
const PROVIDER_TIMEOUT_MS = 20_000;
const REPORT_REMINDER_WINDOW_DAYS = 14;
const STOCK_HISTORY_LOOKBACK_DAYS = 3_660;
const STOCK_HISTORY_POINT_LIMIT = 2_800;

type DatasetCacheEntry = { expiresAt: number; rows: Record<string, unknown>[] };
type StockDetail = {
  financial: MarketFinancialSummary | null;
  reportReminder: MarketReportReminder | null;
  news: MarketNewsItem[];
};

const datasetCache = new Map<string, DatasetCacheEntry>();

export async function getMarketIntelligenceSnapshot(input: {
  instrumentIds?: readonly string[];
  stocks?: readonly unknown[];
} = {}): Promise<MarketIntelligenceSnapshot> {
  const generatedAt = new Date().toISOString();
  const requestedStocks = normalizeMarketStockSubscriptions(input.stocks ?? []);
  const dynamicDefinitions = createMarketStockDefinitions(requestedStocks);
  const catalog = [...MARKET_INSTRUMENT_CATALOG, ...dynamicDefinitions];
  const requestedInstrumentIds = Array.from(new Set([
    ...normalizeMarketInstrumentIds(input.instrumentIds ?? []),
    ...requestedStocks.map((stock) => marketStockId(stock.market, stock.symbol)),
  ])).slice(0, 24);
  const requestedSet = new Set(requestedInstrumentIds);
  const requested = catalog.filter((item) => requestedSet.has(item.id));
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) return snapshotWithoutProvider({ catalog, requestedInstrumentIds, requestedStocks, generatedAt });
  void warmMarketStockCatalog().catch(() => undefined);

  const quoteDefinitionsByRequest = groupByRequest(requested);
  const requestsByKey = new Map<string, AkToolsRequest>();
  for (const [key, definitions] of quoteDefinitionsByRequest) requestsByKey.set(key, definitions[0]!.source);
  for (const definition of requested) {
    const request = marketTrendRequest(definition);
    if (request) requestsByKey.set(requestKey(request), request);
  }
  const datasets = await Promise.all([...requestsByKey.entries()].map(async ([key, request]) => {
    try {
      return { key, rows: await loadDataset(baseUrl, request), ok: true as const };
    } catch {
      return { key, rows: [] as Record<string, unknown>[], ok: false as const };
    }
  }));
  const datasetByKey = new Map(datasets.map((dataset) => [dataset.key, dataset]));
  const stockDetails = await loadStockDetails(baseUrl, requested.filter((item) => item.assetClass === "stock"), generatedAt);
  const successCount = datasets.filter((dataset) => dataset.ok).length;
  const state = datasets.length === 0 || successCount === datasets.length
    ? "ready"
    : successCount > 0 ? "degraded" : "unavailable";

  const instruments = catalog.map((definition): MarketInstrumentSnapshot => {
    if (!requestedSet.has(definition.id)) return emptyInstrumentSnapshot(definition, "missing");
    const dataset = datasetByKey.get(requestKey(definition.source));
    const trendRequest = marketTrendRequest(definition);
    const trendDataset = trendRequest ? datasetByKey.get(requestKey(trendRequest)) : null;
    const quote = dataset?.ok ? matchMarketQuoteRow(definition, dataset.rows, generatedAt) : null;
    const detail = stockDetails.get(definition.id);
    return {
      ...publicInstrument(definition),
      quote,
      quoteStatus: quote ? "available" : dataset?.ok ? "missing" : "unavailable",
      trends: trendDataset?.ok
        ? createMarketTrendSeries(marketTrendPoints(trendDataset.rows, STOCK_HISTORY_POINT_LIMIT))
        : emptyMarketTrendSeries(),
      financial: detail?.financial ?? null,
      reportReminder: detail?.reportReminder ?? null,
      news: detail?.news ?? [],
    };
  });

  return {
    generatedAt,
    requestedInstrumentIds,
    requestedStocks,
    reminderWindowDays: REPORT_REMINDER_WINDOW_DAYS,
    provider: providerStatus(state),
    instruments,
  };
}

async function loadStockDetails(baseUrl: URL, definitions: readonly MarketInstrumentDefinition[], now: string) {
  const aDefinitions = definitions.filter((item) => item.market === "CN");
  const globalDefinitions = definitions.filter((item) => item.market === "HK" || item.market === "US");
  const aPeriod = currentAReportPeriod(now);
  const [aDisclosureRows, globalCalendarRows] = await Promise.all([
    aDefinitions.length ? loadDataset(baseUrl, { endpoint: "stock_report_disclosure", params: { market: "沪深京", period: aPeriod } }).catch(() => []) : [],
    globalDefinitions.length ? loadGlobalReportCalendar(baseUrl, now) : [],
  ]);
  const details = await Promise.all(definitions.map(async (definition) => {
    const financialRequest = stockFinancialRequest(definition);
    const newsRequest = stockNewsRequest(definition);
    const [financialRows, newsRows] = await Promise.all([
      financialRequest ? loadDataset(baseUrl, financialRequest).catch(() => []) : [],
      newsRequest ? loadDataset(baseUrl, newsRequest).catch(() => []) : [],
    ]);
    const reportReminder = definition.market === "CN"
      ? matchAStockDisclosureReminder({ definition, rows: aDisclosureRows, reportPeriod: aPeriod, now })
      : matchGlobalReportReminder({ definition, rows: globalCalendarRows, now });
    return [definition.id, {
      financial: marketFinancialSummary(definition, financialRows),
      reportReminder,
      news: marketNewsItems(newsRows),
    } satisfies StockDetail] as const;
  }));
  return new Map(details);
}

async function loadGlobalReportCalendar(baseUrl: URL, now: string) {
  const dates = Array.from({ length: REPORT_REMINDER_WINDOW_DAYS + 1 }, (_, offset) => compactBusinessDate(-offset, now));
  const datasets = await Promise.all(dates.map((date) => loadDataset(baseUrl, {
    endpoint: "news_report_time_baidu",
    params: { date },
  }).catch(() => [])));
  return datasets.flat();
}

function snapshotWithoutProvider(input: {
  catalog: readonly MarketInstrumentDefinition[];
  requestedInstrumentIds: string[];
  requestedStocks: MarketIntelligenceSnapshot["requestedStocks"];
  generatedAt: string;
}): MarketIntelligenceSnapshot {
  const requestedSet = new Set(input.requestedInstrumentIds);
  return {
    generatedAt: input.generatedAt,
    requestedInstrumentIds: input.requestedInstrumentIds,
    requestedStocks: input.requestedStocks,
    reminderWindowDays: REPORT_REMINDER_WINDOW_DAYS,
    provider: providerStatus("unconfigured"),
    instruments: input.catalog.map((definition) => emptyInstrumentSnapshot(definition, requestedSet.has(definition.id) ? "unavailable" : "missing")),
  };
}

function emptyInstrumentSnapshot(definition: MarketInstrumentDefinition, quoteStatus: MarketInstrumentSnapshot["quoteStatus"]): MarketInstrumentSnapshot {
  return { ...publicInstrument(definition), quote: null, quoteStatus, trends: emptyMarketTrendSeries(), financial: null, reportReminder: null, news: [] };
}

function configuredBaseUrl() {
  const raw = process.env.MARKET_INTELLIGENCE_AKTOOLS_BASE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function providerStatus(state: MarketProviderStatus["state"]): MarketProviderStatus {
  const statusLabel = state === "ready"
    ? "行情可用"
    : state === "degraded"
      ? "部分行情不可用"
      : state === "unavailable"
        ? "行情源不可用"
        : "等待配置行情源";
  return {
    key: "akshare-aktools",
    label: "AKShare / AKTools",
    mode: "polling",
    state,
    configured: state !== "unconfigured",
    statusLabel,
    freshnessLabel: "行情 90 秒轮询 · 历史 K 线本地缓存 30 分钟",
    notice: "行情、财报与新闻来自公开数据适配器，仅供内部研究；开源适配器不等于上游再分发授权，也不构成投资建议。",
  };
}

function groupByRequest(definitions: readonly MarketInstrumentDefinition[]) {
  const groups = new Map<string, MarketInstrumentDefinition[]>();
  for (const definition of definitions) {
    const key = requestKey(definition.source);
    groups.set(key, [...(groups.get(key) ?? []), definition]);
  }
  return groups;
}

async function loadDataset(baseUrl: URL, request: AkToolsRequest) {
  const key = `v3:${baseUrl.href}:${requestKey(request)}:${isMarketHistoryEndpoint(request.endpoint) ? STOCK_HISTORY_LOOKBACK_DAYS : "current"}`;
  const cached = datasetCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  if (isMarketHistoryEndpoint(request.endpoint)) {
    const persisted = await readMarketHistoryCache(key);
    if (persisted) {
      datasetCache.set(key, persisted);
      return persisted.rows;
    }
  }

  const url = new URL(`api/public/${request.endpoint}`, ensureTrailingSlash(baseUrl));
  for (const [name, value] of Object.entries(request.params ?? {})) url.searchParams.set(name, value);
  if (request.endpoint === "stock_zh_a_daily") {
    url.searchParams.set("start_date", compactBusinessDate(STOCK_HISTORY_LOOKBACK_DAYS));
    url.searchParams.set("end_date", compactBusinessDate(0));
  }
  if (request.endpoint === "currency_boc_sina") {
    url.searchParams.set("start_date", compactBusinessDate(14));
    url.searchParams.set("end_date", compactBusinessDate(0));
  }
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error("market provider request failed");
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error("market provider response invalid");
  const providerRows = payload.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object" && !Array.isArray(row));
  const rows = isMarketHistoryEndpoint(request.endpoint)
    ? providerRows.slice(-STOCK_HISTORY_POINT_LIMIT)
    : providerRows;
  const expiresAt = Date.now() + cacheDuration(request.endpoint);
  datasetCache.set(key, { expiresAt, rows });
  if (isMarketHistoryEndpoint(request.endpoint)) await writeMarketHistoryCache(key, rows, expiresAt);
  return rows;
}

function cacheDuration(endpoint: string) {
  if (isMarketHistoryEndpoint(endpoint)) return STOCK_HISTORY_CACHE_MS;
  if (endpoint === "stock_news_em") return NEWS_CACHE_MS;
  if (endpoint.startsWith("stock_financial_") || endpoint === "stock_report_disclosure" || endpoint === "news_report_time_baidu") return REFERENCE_CACHE_MS;
  return PROVIDER_CACHE_MS;
}

function isMarketHistoryEndpoint(endpoint: string) {
  return [
    "stock_zh_a_daily",
    "stock_hk_daily",
    "stock_us_daily",
    "stock_zh_index_daily",
    "stock_hk_index_daily_sina",
    "index_us_stock_sina",
    "futures_foreign_hist",
  ].includes(endpoint);
}

function ensureTrailingSlash(url: URL) {
  const normalized = new URL(url);
  if (!normalized.pathname.endsWith("/")) normalized.pathname += "/";
  return normalized;
}

function compactBusinessDate(daysAgo: number, isoNow?: string) {
  const origin = isoNow ? new Date(isoNow).getTime() : Date.now();
  const value = new Date(origin - daysAgo * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value).replaceAll("-", "");
}

function currentAReportPeriod(now: string) {
  const date = new Date(now);
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric" }).format(date));
  const month = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", month: "numeric" }).format(date));
  if (month <= 4) return `${year - 1}年报`;
  if (month <= 8) return `${year}半年报`;
  if (month <= 10) return `${year}三季`;
  return `${year}年报`;
}
