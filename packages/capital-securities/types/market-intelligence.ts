export const DEFAULT_MARKET_SUBSCRIPTION_IDS = [
  "cn-sse-composite",
  "hk-hang-seng",
  "us-sp500",
  "commodity-comex-gold",
  "fx-usd-cny",
  "cn-stock-300750",
  "hk-stock-00700",
  "us-stock-aapl",
] as const;

export const MARKET_INSTRUMENT_IDS = [
  "cn-sse-composite",
  "cn-csi-300",
  "hk-hang-seng",
  "us-sp500",
  "us-nasdaq",
  "commodity-comex-gold",
  "commodity-comex-silver",
  "commodity-wti",
  "commodity-comex-copper",
  "fx-usd-cny",
  "fx-eur-cny",
  "fx-hkd-cny",
  "cn-stock-600519",
  "cn-stock-300750",
  "hk-stock-00700",
  "hk-stock-09988",
  "us-stock-aapl",
  "us-stock-msft",
] as const;

export type MarketAssetClass = "index" | "commodity" | "fx" | "stock";
export type MarketRegion = "CN" | "HK" | "US" | "GLOBAL";
export type MarketStockRegion = Exclude<MarketRegion, "GLOBAL">;
export type MarketProviderState = "ready" | "degraded" | "unconfigured" | "unavailable";

export const MARKET_TREND_PERIODS = ["day", "week", "month", "quarter", "year"] as const;
export type MarketTrendPeriod = (typeof MARKET_TREND_PERIODS)[number];

export type MarketStockSubscription = {
  market: MarketStockRegion;
  symbol: string;
  name: string;
};

export type MarketStockCatalogItem = MarketStockSubscription & {
  sourceLabel: string;
};

export type MarketStockCatalogSearchResult = {
  generatedAt: string;
  updatedAt: string;
  nextRefreshAt: string;
  stale: boolean;
  total: number;
  matchCount: number;
  marketTotals: Record<MarketStockRegion, number>;
  matches: MarketStockCatalogItem[];
};

export type MarketInstrument = {
  id: string;
  symbol: string;
  name: string;
  assetClass: MarketAssetClass;
  market: MarketRegion;
  currency: string;
  description: string;
  delayLabel: string;
};

export type MarketQuote = {
  last: number;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  previousClose: number | null;
  volume: number | null;
  observedAt: string;
};

export type MarketTrendPoint = {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  changePercent: number | null;
  volume: number | null;
};

export type MarketTrendSeries = Record<MarketTrendPeriod, MarketTrendPoint[]>;

export type MarketFinancialSummary = {
  reportPeriod: string;
  reportType: string;
  publishedAt: string | null;
  revenue: number | null;
  revenueYoY: number | null;
  netProfit: number | null;
  netProfitYoY: number | null;
  basicEps: number | null;
  sourceLabel: string;
};

export type MarketReportReminder = {
  scheduledFor: string;
  reportPeriod: string;
  timingLabel: string | null;
  daysUntil: number;
  sourceLabel: string;
};

export type MarketNewsItem = {
  key: string;
  title: string;
  summary: string;
  source: string;
  publishedAt: string;
  url: string | null;
};

export type MarketInstrumentSnapshot = MarketInstrument & {
  quote: MarketQuote | null;
  quoteStatus: "available" | "missing" | "unavailable";
  trends: MarketTrendSeries;
  financial: MarketFinancialSummary | null;
  reportReminder: MarketReportReminder | null;
  news: MarketNewsItem[];
};

export type MarketProviderStatus = {
  key: "akshare-aktools";
  label: string;
  mode: "polling";
  state: MarketProviderState;
  configured: boolean;
  statusLabel: string;
  freshnessLabel: string;
  notice: string;
};

export type MarketIntelligenceSnapshot = {
  generatedAt: string;
  requestedInstrumentIds: string[];
  requestedStocks: MarketStockSubscription[];
  reminderWindowDays: number;
  provider: MarketProviderStatus;
  instruments: MarketInstrumentSnapshot[];
};
