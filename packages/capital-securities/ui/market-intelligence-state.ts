import { matchText } from "@workspace/core/search";
import type {
  MarketAssetClass,
  MarketInstrument,
  MarketStockCatalogItem,
  MarketStockCatalogSearchResult,
  MarketStockRegion,
  MarketStockSubscription,
} from "../types/market-intelligence";

export type MarketWatchlistState = {
  instrumentIds: string[];
  stocks: MarketStockSubscription[];
};

export function normalizeStoredMarketSubscriptions(
  raw: string | null,
  knownIds: readonly string[],
  defaults: readonly string[],
) {
  const known = new Set(knownIds);
  if (!raw) return defaults.filter((id) => known.has(id));
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return defaults.filter((id) => known.has(id));
    return Array.from(new Set(parsed.filter((value): value is string => typeof value === "string" && known.has(value))));
  } catch {
    return defaults.filter((id) => known.has(id));
  }
}

export function normalizeStoredMarketWatchlist(
  raw: string | null,
  legacyRaw: string | null,
  knownIds: readonly string[],
  defaults: readonly string[],
): MarketWatchlistState {
  if (!raw) return {
    instrumentIds: normalizeStoredMarketSubscriptions(legacyRaw, knownIds, defaults),
    stocks: [],
  };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid watchlist");
    const record = parsed as Record<string, unknown>;
    return {
      instrumentIds: normalizeStoredMarketSubscriptions(JSON.stringify(record.instrumentIds ?? []), knownIds, defaults),
      stocks: normalizeCustomStocks(record.stocks),
    };
  } catch {
    return {
      instrumentIds: normalizeStoredMarketSubscriptions(legacyRaw, knownIds, defaults),
      stocks: [],
    };
  }
}

export function normalizeCustomStock(input: { market: MarketStockRegion; symbol: string; name: string }): MarketStockSubscription | null {
  const market = input.market;
  const raw = input.symbol.trim().toUpperCase();
  let symbol: string | null = null;
  if (market === "CN") {
    const digits = raw.replace(/^(SH|SZ|BJ)/, "").replace(/\.(SH|SZ|BJ)$/, "");
    symbol = /^\d{6}$/.test(digits) ? digits : null;
  } else if (market === "HK") {
    const digits = raw.replace(/^HK/, "").replace(/\.HK$/, "");
    symbol = /^\d{1,5}$/.test(digits) ? digits.padStart(5, "0") : null;
  } else {
    const ticker = raw.replace(/\.US$/, "");
    symbol = /^[A-Z][A-Z0-9.-]{0,14}$/.test(ticker) ? ticker : null;
  }
  if (!symbol) return null;
  const name = input.name.trim().replace(/\s+/g, " ").slice(0, 40) || symbol;
  return { market, symbol, name };
}

export function marketStockSubscriptionId(stock: Pick<MarketStockSubscription, "market" | "symbol">) {
  return `${stock.market.toLowerCase()}-stock-${stock.symbol.toLowerCase().replace(/[^a-z0-9.-]+/g, "-")}`;
}

function normalizeCustomStocks(value: unknown) {
  if (!Array.isArray(value)) return [];
  const result: MarketStockSubscription[] = [];
  const ids = new Set<string>();
  for (const candidate of value) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const record = candidate as Record<string, unknown>;
    const market = String(record.market ?? "").toUpperCase();
    if (market !== "CN" && market !== "HK" && market !== "US") continue;
    const normalized = normalizeCustomStock({ market, symbol: String(record.symbol ?? ""), name: String(record.name ?? "") });
    if (!normalized) continue;
    const id = marketStockSubscriptionId(normalized);
    if (ids.has(id)) continue;
    ids.add(id);
    result.push(normalized);
    if (result.length >= 8) break;
  }
  return result;
}

export function filterMarketCatalog(
  instruments: readonly MarketInstrument[],
  query: string,
  assetClass: MarketAssetClass | "all",
) {
  const normalized = query.trim();
  return instruments.filter((instrument) => (
    (assetClass === "all" || instrument.assetClass === assetClass)
    && (!normalized || matchText([
      instrument.name,
      instrument.symbol,
      instrument.description,
      instrument.market,
    ].join(" "), normalized))
  ));
}

export function mergeMarketCatalogInstruments(
  fixed: readonly MarketInstrument[],
  stocks: readonly MarketStockCatalogItem[],
) {
  const instruments = new Map(fixed.map((instrument) => [instrument.id, instrument]));
  for (const stock of stocks) {
    const id = marketStockSubscriptionId(stock);
    if (instruments.has(id)) continue;
    instruments.set(id, {
      id,
      symbol: stock.symbol,
      name: stock.name,
      assetClass: "stock",
      market: stock.market,
      currency: stock.market === "CN" ? "CNY" : stock.market === "HK" ? "HKD" : "USD",
      description: `${stock.sourceLabel} · 每日更新`,
      delayLabel: "日线行情",
    });
  }
  return [...instruments.values()];
}

export function marketStockCatalogSummary(result: MarketStockCatalogSearchResult) {
  const counts = `A股 ${result.marketTotals.CN} · 港股 ${result.marketTotals.HK} · 美股 ${result.marketTotals.US}`;
  const shown = result.matchCount > result.matches.length ? `，展示前 ${result.matches.length} 条` : "";
  const freshness = result.stale ? "缓存已过期，后台正在刷新" : `目录更新于 ${formatCatalogTime(result.updatedAt)}`;
  return `全量目录 ${result.total} 条（${counts}）；命中 ${result.matchCount} 条${shown}。${freshness}。`;
}

function formatCatalogTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(parsed);
}
