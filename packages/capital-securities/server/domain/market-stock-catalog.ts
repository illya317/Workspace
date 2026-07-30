import { matchSearchFields } from "@workspace/platform/search";

import type {
  MarketStockCatalogItem,
  MarketStockRegion,
} from "../../types/market-intelligence";

const MARKET_ORDER: Record<MarketStockRegion, number> = { CN: 0, HK: 1, US: 2 };

export function normalizeAStockCatalog(rows: readonly Record<string, unknown>[]) {
  return normalizeProviderRows(rows, {
    market: "CN",
    codeFields: ["code", "代码"],
    nameFields: ["name", "名称"],
    sourceLabel: "AKShare A股代码表",
  });
}

export function normalizeHkStockCatalog(rows: readonly Record<string, unknown>[]) {
  return normalizeProviderRows(rows, {
    market: "HK",
    codeFields: ["代码", "code"],
    nameFields: ["中文名称", "名称", "英文名称", "name"],
    sourceLabel: "AKShare 新浪港股",
  });
}

export function parseNasdaqTraderCatalog(text: string, sourceLabel = "Nasdaq Trader Symbol Directory") {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headers = lines[0]?.split("|") ?? [];
  const symbolIndex = headerIndex(headers, ["Symbol", "ACT Symbol", "NASDAQ Symbol"]);
  const nameIndex = headerIndex(headers, ["Security Name"]);
  const etfIndex = headerIndex(headers, ["ETF"]);
  const testIndex = headerIndex(headers, ["Test Issue"]);
  if (symbolIndex < 0 || nameIndex < 0 || testIndex < 0) return [];
  return lines.slice(1).flatMap((line): MarketStockCatalogItem[] => {
    const columns = line.split("|");
    if (columns[testIndex]?.trim() !== "N") return [];
    if (etfIndex >= 0 && columns[etfIndex]?.trim() === "Y") return [];
    const item = catalogItem("US", columns[symbolIndex], columns[nameIndex], sourceLabel);
    return item ? [item] : [];
  });
}

export function mergeMarketStockCatalogs(catalogs: readonly (readonly MarketStockCatalogItem[])[]) {
  const unique = new Map<string, MarketStockCatalogItem>();
  for (const item of catalogs.flat()) unique.set(`${item.market}:${item.symbol}`, item);
  return [...unique.values()].sort((left, right) => (
    MARKET_ORDER[left.market] - MARKET_ORDER[right.market]
    || left.symbol.localeCompare(right.symbol, "en")
  ));
}

export function searchMarketStockCatalogItems(input: {
  items: readonly MarketStockCatalogItem[];
  query: string;
  market?: MarketStockRegion;
  limit?: number;
}) {
  const query = input.query.trim();
  if (!query) return { matchCount: 0, matches: [] };
  const normalizedQuery = query.toUpperCase();
  const matches = input.items.filter((item) => (
    (!input.market || item.market === input.market)
    && matchSearchFields(item, query, ["symbol", "name", "market"])
  )).sort((left, right) => (
    searchRank(left, normalizedQuery) - searchRank(right, normalizedQuery)
    || MARKET_ORDER[left.market] - MARKET_ORDER[right.market]
    || left.symbol.localeCompare(right.symbol, "en")
  ));
  return { matchCount: matches.length, matches: matches.slice(0, input.limit ?? 80) };
}

function normalizeProviderRows(rows: readonly Record<string, unknown>[], input: {
  market: MarketStockRegion;
  codeFields: readonly string[];
  nameFields: readonly string[];
  sourceLabel: string;
}) {
  return rows.flatMap((row): MarketStockCatalogItem[] => {
    const item = catalogItem(
      input.market,
      firstString(row, input.codeFields),
      firstString(row, input.nameFields),
      input.sourceLabel,
    );
    return item ? [item] : [];
  });
}

function catalogItem(market: MarketStockRegion, rawSymbol: unknown, rawName: unknown, sourceLabel: string): MarketStockCatalogItem | null {
  const symbol = normalizeSymbol(market, rawSymbol);
  const name = cleanText(rawName, 80);
  return symbol && name ? { market, symbol, name, sourceLabel } : null;
}

function normalizeSymbol(market: MarketStockRegion, value: unknown) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (market === "CN") return /^\d{6}$/.test(raw) ? raw : null;
  if (market === "HK") return /^\d{1,5}$/.test(raw) ? raw.padStart(5, "0") : null;
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(raw) ? raw : null;
}

function firstString(row: Record<string, unknown>, fields: readonly string[]) {
  for (const field of fields) {
    const value = cleanText(row[field], 80);
    if (value) return value;
  }
  return "";
}

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function headerIndex(headers: readonly string[], candidates: readonly string[]) {
  for (const candidate of candidates) {
    const index = headers.findIndex((header) => header.trim() === candidate);
    if (index >= 0) return index;
  }
  return -1;
}

function searchRank(item: MarketStockCatalogItem, normalizedQuery: string) {
  const symbol = item.symbol.toUpperCase();
  const name = item.name.toUpperCase();
  if (symbol === normalizedQuery) return 0;
  if (name === normalizedQuery) return 1;
  if (symbol.startsWith(normalizedQuery)) return 2;
  if (name.startsWith(normalizedQuery)) return 3;
  return 4;
}
