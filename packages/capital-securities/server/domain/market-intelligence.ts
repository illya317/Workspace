import type {
  MarketFinancialSummary,
  MarketInstrument,
  MarketNewsItem,
  MarketQuote,
  MarketReportReminder,
  MarketStockRegion,
  MarketStockSubscription,
  MarketTrendPoint,
} from "../../types/market-intelligence";

export type AkToolsRequest = {
  endpoint: string;
  params?: Record<string, string>;
};

export type MarketInstrumentDefinition = MarketInstrument & {
  source: AkToolsRequest & {
    codes: string[];
    names?: string[];
  };
  trendSource?: AkToolsRequest;
};

type CatalogInput = MarketInstrument & AkToolsRequest & {
  codes: string[];
  names?: string[];
  trendSource?: AkToolsRequest;
};

function instrument(input: CatalogInput): MarketInstrumentDefinition {
  const { endpoint, params, codes, names, trendSource, ...definition } = input;
  const source = { endpoint, params, codes, names };
  return {
    ...definition,
    source,
    trendSource: trendSource ?? (definition.assetClass === "stock" ? source : undefined),
  };
}

export const MARKET_INSTRUMENT_CATALOG: readonly MarketInstrumentDefinition[] = [
  instrument({ id: "cn-sse-composite", symbol: "000001", name: "上证指数", assetClass: "index", market: "CN", currency: "CNY", description: "上海证券市场综合表现", delayLabel: "轮询行情", endpoint: "stock_zh_index_spot_sina", codes: ["sh000001", "000001"], names: ["上证指数"], trendSource: { endpoint: "stock_zh_index_daily", params: { symbol: "sh000001" } } }),
  instrument({ id: "cn-csi-300", symbol: "000300", name: "沪深300", assetClass: "index", market: "CN", currency: "CNY", description: "沪深两市大盘股基准", delayLabel: "轮询行情", endpoint: "stock_zh_index_spot_sina", codes: ["sh000300", "000300"], names: ["沪深300"], trendSource: { endpoint: "stock_zh_index_daily", params: { symbol: "sh000300" } } }),
  instrument({ id: "hk-hang-seng", symbol: "HSI", name: "恒生指数", assetClass: "index", market: "HK", currency: "HKD", description: "香港股票市场主要基准", delayLabel: "约15分钟延迟", endpoint: "stock_hk_index_spot_sina", codes: ["HSI"], names: ["恒生指数"], trendSource: { endpoint: "stock_hk_index_daily_sina", params: { symbol: "HSI" } } }),
  instrument({ id: "us-sp500", symbol: "SPX", name: "标普500", assetClass: "index", market: "US", currency: "USD", description: "美国大盘股基准", delayLabel: "日线行情", endpoint: "index_us_stock_sina", params: { symbol: ".INX" }, codes: [".INX"], names: ["标普500"], trendSource: { endpoint: "index_us_stock_sina", params: { symbol: ".INX" } } }),
  instrument({ id: "us-nasdaq", symbol: "IXIC", name: "纳斯达克综合指数", assetClass: "index", market: "US", currency: "USD", description: "美国科技股与成长股观察基准", delayLabel: "日线行情", endpoint: "index_us_stock_sina", params: { symbol: ".IXIC" }, codes: [".IXIC"], names: ["纳斯达克综合指数"], trendSource: { endpoint: "index_us_stock_sina", params: { symbol: ".IXIC" } } }),
  instrument({ id: "commodity-comex-gold", symbol: "GC00Y", name: "COMEX黄金", assetClass: "commodity", market: "GLOBAL", currency: "USD", description: "国际黄金连续合约", delayLabel: "轮询行情", endpoint: "futures_global_spot_em", codes: ["GC00Y"], names: ["COMEX黄金"], trendSource: { endpoint: "futures_foreign_hist", params: { symbol: "GC" } } }),
  instrument({ id: "commodity-comex-silver", symbol: "SI00Y", name: "COMEX白银", assetClass: "commodity", market: "GLOBAL", currency: "USD", description: "国际白银连续合约", delayLabel: "轮询行情", endpoint: "futures_global_spot_em", codes: ["SI00Y"], names: ["COMEX白银"], trendSource: { endpoint: "futures_foreign_hist", params: { symbol: "SI" } } }),
  instrument({ id: "commodity-wti", symbol: "CL00Y", name: "NYMEX原油", assetClass: "commodity", market: "GLOBAL", currency: "USD", description: "WTI 原油连续合约", delayLabel: "轮询行情", endpoint: "futures_global_spot_em", codes: ["CL00Y"], names: ["NYMEX原油"], trendSource: { endpoint: "futures_foreign_hist", params: { symbol: "CL" } } }),
  instrument({ id: "commodity-comex-copper", symbol: "HG00Y", name: "COMEX铜", assetClass: "commodity", market: "GLOBAL", currency: "USD", description: "国际铜连续合约", delayLabel: "轮询行情", endpoint: "futures_global_spot_em", codes: ["HG00Y"], names: ["COMEX铜"], trendSource: { endpoint: "futures_foreign_hist", params: { symbol: "HG" } } }),
  instrument({ id: "fx-usd-cny", symbol: "USD/CNY", name: "美元兑人民币", assetClass: "fx", market: "CN", currency: "CNY", description: "中国银行折算价；优先使用央行中间价", delayLabel: "交易日参考价", endpoint: "currency_boc_sina", params: { symbol: "美元" }, codes: ["USD/CNY"] }),
  instrument({ id: "fx-eur-cny", symbol: "EUR/CNY", name: "欧元兑人民币", assetClass: "fx", market: "CN", currency: "CNY", description: "中国银行折算价；优先使用央行中间价", delayLabel: "交易日参考价", endpoint: "currency_boc_sina", params: { symbol: "欧元" }, codes: ["EUR/CNY"] }),
  instrument({ id: "fx-hkd-cny", symbol: "HKD/CNY", name: "港币兑人民币", assetClass: "fx", market: "CN", currency: "CNY", description: "中国银行折算价；优先使用央行中间价", delayLabel: "交易日参考价", endpoint: "currency_boc_sina", params: { symbol: "港币" }, codes: ["HKD/CNY"] }),
  instrument({ id: "cn-stock-600519", symbol: "600519", name: "贵州茅台", assetClass: "stock", market: "CN", currency: "CNY", description: "A股示例订阅", delayLabel: "日线行情", endpoint: "stock_zh_a_daily", params: { symbol: "sh600519" }, codes: ["600519"] }),
  instrument({ id: "cn-stock-300750", symbol: "300750", name: "宁德时代", assetClass: "stock", market: "CN", currency: "CNY", description: "A股示例订阅", delayLabel: "日线行情", endpoint: "stock_zh_a_daily", params: { symbol: "sz300750" }, codes: ["300750"] }),
  instrument({ id: "hk-stock-00700", symbol: "00700", name: "腾讯控股", assetClass: "stock", market: "HK", currency: "HKD", description: "港股示例订阅", delayLabel: "日线行情", endpoint: "stock_hk_daily", params: { symbol: "00700" }, codes: ["00700"] }),
  instrument({ id: "hk-stock-09988", symbol: "09988", name: "阿里巴巴-SW", assetClass: "stock", market: "HK", currency: "HKD", description: "港股示例订阅", delayLabel: "日线行情", endpoint: "stock_hk_daily", params: { symbol: "09988" }, codes: ["09988"] }),
  instrument({ id: "us-stock-aapl", symbol: "AAPL", name: "Apple", assetClass: "stock", market: "US", currency: "USD", description: "美股示例订阅", delayLabel: "日线行情", endpoint: "stock_us_daily", params: { symbol: "AAPL" }, codes: ["AAPL"] }),
  instrument({ id: "us-stock-msft", symbol: "MSFT", name: "Microsoft", assetClass: "stock", market: "US", currency: "USD", description: "美股示例订阅", delayLabel: "日线行情", endpoint: "stock_us_daily", params: { symbol: "MSFT" }, codes: ["MSFT"] }),
] as const;

export function normalizeMarketInstrumentIds(values: readonly string[], maxItems = 24) {
  const knownIds = new Set(MARKET_INSTRUMENT_CATALOG.map((item) => item.id));
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => knownIds.has(value)))).slice(0, maxItems);
}

export function normalizeMarketStockSubscriptions(values: readonly unknown[], maxItems = 8) {
  const result: MarketStockSubscription[] = [];
  const ids = new Set<string>();
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const record = value as Record<string, unknown>;
    const market = String(record.market ?? "").trim().toUpperCase();
    if (market !== "CN" && market !== "HK" && market !== "US") continue;
    const symbol = normalizeMarketStockSymbol(market, String(record.symbol ?? ""));
    if (!symbol) continue;
    const id = marketStockId(market, symbol);
    if (ids.has(id)) continue;
    ids.add(id);
    result.push({ market, symbol, name: normalizeStockName(record.name, symbol) });
    if (result.length >= maxItems) break;
  }
  return result;
}

export function normalizeMarketStockSymbol(market: MarketStockRegion, value: string) {
  const normalized = value.trim().toUpperCase();
  if (market === "CN") {
    const digits = normalized.replace(/^(SH|SZ|BJ)/, "").replace(/\.(SH|SZ|BJ)$/, "");
    return /^\d{6}$/.test(digits) ? digits : null;
  }
  if (market === "HK") {
    const digits = normalized.replace(/^HK/, "").replace(/\.HK$/, "");
    return /^\d{1,5}$/.test(digits) ? digits.padStart(5, "0") : null;
  }
  const symbol = normalized.replace(/\.US$/, "");
  return /^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol) ? symbol : null;
}

export function marketStockId(market: MarketStockRegion, symbol: string) {
  return `${market.toLowerCase()}-stock-${symbol.toLowerCase().replace(/[^a-z0-9.-]+/g, "-")}`;
}

export function createMarketStockDefinitions(stocks: readonly MarketStockSubscription[]) {
  const known = new Set(MARKET_INSTRUMENT_CATALOG.map((item) => item.id));
  return stocks.flatMap((stock): MarketInstrumentDefinition[] => {
    const id = marketStockId(stock.market, stock.symbol);
    if (known.has(id)) return [];
    const source = stockDailyRequest(stock.market, stock.symbol);
    return [instrument({
      id,
      symbol: stock.symbol,
      name: stock.name,
      assetClass: "stock",
      market: stock.market,
      currency: stock.market === "CN" ? "CNY" : stock.market === "HK" ? "HKD" : "USD",
      description: `${stock.market === "CN" ? "A股" : stock.market === "HK" ? "港股" : "美股"}自选股票`,
      delayLabel: "日线行情",
      endpoint: source.endpoint,
      params: source.params,
      codes: [stock.symbol],
    })];
  });
}

export function stockFinancialRequest(definition: MarketInstrumentDefinition): AkToolsRequest | null {
  if (definition.assetClass !== "stock" || definition.market === "GLOBAL") return null;
  if (definition.market === "CN") return { endpoint: "stock_financial_analysis_indicator_em", params: { symbol: `${definition.symbol}.${cnExchange(definition.symbol).toUpperCase()}`, indicator: "按报告期" } };
  if (definition.market === "HK") return { endpoint: "stock_financial_hk_analysis_indicator_em", params: { symbol: definition.symbol, indicator: "报告期" } };
  return { endpoint: "stock_financial_us_analysis_indicator_em", params: { symbol: definition.symbol, indicator: "累计季报" } };
}

export function stockNewsRequest(definition: MarketInstrumentDefinition): AkToolsRequest | null {
  return definition.assetClass === "stock" ? { endpoint: "stock_news_em", params: { symbol: definition.symbol } } : null;
}

export function requestKey(request: AkToolsRequest) {
  const params = Object.entries(request.params ?? {}).sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify([request.endpoint, params]);
}

export function publicInstrument(definition: MarketInstrumentDefinition): MarketInstrument {
  const { source: _source, trendSource: _trendSource, ...result } = definition;
  return result;
}

export function marketTrendRequest(definition: MarketInstrumentDefinition) {
  return definition.trendSource ?? null;
}

export function matchMarketQuoteRow(definition: MarketInstrumentDefinition, rows: readonly Record<string, unknown>[], observedAt: string): MarketQuote | null {
  const matchedIndex = rows.findIndex((candidate) => {
    const code = String(candidate["代码"] ?? candidate["货币对"] ?? candidate.code ?? "").trim().toUpperCase();
    const name = String(candidate["名称"] ?? candidate["中文名称"] ?? candidate.name ?? "").trim();
    const codeMatch = definition.source.codes.some((candidateCode) => {
      const normalized = candidateCode.toUpperCase();
      return code === normalized || code.endsWith(`.${normalized}`) || code.endsWith(normalized);
    });
    return codeMatch || Boolean(definition.source.names?.includes(name));
  });
  const bankOfChinaFx = definition.source.endpoint === "currency_boc_sina";
  const historicalSeries = bankOfChinaFx || ["index_us_stock_sina", "stock_zh_a_daily", "stock_hk_daily", "stock_us_daily"].includes(definition.source.endpoint);
  const rowIndex = matchedIndex >= 0 ? matchedIndex : historicalSeries ? rows.length - 1 : -1;
  const row = rows[rowIndex];
  if (!row) return null;
  const bid = numberValue(row["买报价"]);
  const ask = numberValue(row["卖报价"]);
  const last = bankOfChinaFx
    ? bankOfChinaRate(row)
    : numberValue(row["最新价"] ?? row.close ?? row.last ?? row.price) ?? (bid !== null && ask !== null ? (bid + ask) / 2 : null);
  if (last === null) return null;
  const previousRow = historicalSeries && rowIndex > 0 ? rows[rowIndex - 1] : null;
  const previousClose = bankOfChinaFx
    ? bankOfChinaRate(previousRow)
    : numberValue(row["昨收"] ?? row["昨结"] ?? row.previousClose ?? previousRow?.close);
  const explicitChange = numberValue(row["涨跌额"] ?? row.change);
  const change = explicitChange ?? (previousClose === null ? null : last - previousClose);
  return {
    last,
    change,
    changePercent: numberValue(row["涨跌幅"] ?? row.changePercent) ?? (change === null || previousClose === null || previousClose === 0 ? null : change / previousClose * 100),
    open: bankOfChinaFx ? null : numberValue(row["今开"] ?? row["开盘"] ?? row.open),
    high: bankOfChinaFx ? null : numberValue(row["最高"] ?? row.high),
    low: bankOfChinaFx ? null : numberValue(row["最低"] ?? row.low),
    previousClose,
    volume: numberValue(row["成交量"] ?? row.volume),
    observedAt: stringValue(row["日期"] ?? row["日期时间"] ?? row["行情时间"] ?? row["时间"] ?? row.date) ?? observedAt,
  };
}

function bankOfChinaRate(row: Record<string, unknown> | null | undefined) {
  if (!row) return null;
  const centralParity = numberValue(row["央行中间价"]);
  const converted = numberValue(row["中行折算价"]);
  const buy = numberValue(row["中行汇买价"]);
  const sell = numberValue(row["中行钞卖价/汇卖价"]);
  const quotedPerHundred = centralParity ?? converted ?? (buy !== null && sell !== null ? (buy + sell) / 2 : null);
  return quotedPerHundred === null ? null : Number((quotedPerHundred / 100).toFixed(6));
}

export function marketTrendPoints(rows: readonly Record<string, unknown>[], limit = 260): MarketTrendPoint[] {
  const points = rows.flatMap((row): MarketTrendPoint[] => {
    const close = numberValue(row.close ?? row["收盘"] ?? row["最新价"]);
    const date = dateValue(row.date ?? row["日期"]);
    return close === null || !date ? [] : [{
      date,
      open: numberValue(row.open ?? row["开盘"] ?? row["今开"]),
      high: numberValue(row.high ?? row["最高"]),
      low: numberValue(row.low ?? row["最低"]),
      close,
      changePercent: numberValue(row.changePercent ?? row["涨跌幅"]),
      volume: numberValue(row.volume ?? row["成交量"]),
    }];
  }).sort((left, right) => left.date.localeCompare(right.date)).slice(-limit);
  return points.map((point, index) => ({
    ...point,
    changePercent: point.changePercent ?? (index === 0 || points[index - 1]!.close === 0 ? null : (point.close - points[index - 1]!.close) / points[index - 1]!.close * 100),
  }));
}

export function marketFinancialSummary(definition: MarketInstrumentDefinition, rows: readonly Record<string, unknown>[]): MarketFinancialSummary | null {
  if (definition.assetClass !== "stock") return null;
  const row = [...rows].filter((candidate) => dateValue(candidate.REPORT_DATE ?? candidate["报告日期"]))
    .sort((left, right) => (dateValue(right.REPORT_DATE ?? right["报告日期"]) ?? "").localeCompare(dateValue(left.REPORT_DATE ?? left["报告日期"]) ?? ""))[0];
  if (!row) return null;
  return {
    reportPeriod: stringValue(row.REPORT_DATE_NAME ?? row.REPORT_DATA_TYPE ?? row.REPORT_DATE ?? row["报告日期"]) ?? "最近报告期",
    reportType: stringValue(row.REPORT_TYPE ?? row.DATE_TYPE ?? row["报告类型"]) ?? "财务报告",
    publishedAt: dateValue(row.NOTICE_DATE ?? row.UPDATE_DATE ?? row["公告日期"]),
    revenue: numberValue(row.TOTALOPERATEREVE ?? row.OPERATE_INCOME ?? row["营业总收入"]),
    revenueYoY: numberValue(row.TOTALOPERATEREVETZ ?? row.OPERATE_INCOME_YOY ?? row["营业收入同比"]),
    netProfit: numberValue(row.PARENTNETPROFIT ?? row.PARENT_HOLDER_NETPROFIT ?? row.HOLDER_PROFIT ?? row["归母净利润"]),
    netProfitYoY: numberValue(row.PARENTNETPROFITTZ ?? row.PARENT_HOLDER_NETPROFIT_YOY ?? row.HOLDER_PROFIT_YOY ?? row["归母净利润同比"]),
    basicEps: numberValue(row.EPSJB ?? row.BASIC_EPS ?? row["基本每股收益"]),
    sourceLabel: "AKShare · 东方财富财务分析",
  };
}

export function marketNewsItems(rows: readonly Record<string, unknown>[], limit = 5): MarketNewsItem[] {
  return rows.flatMap((row): MarketNewsItem[] => {
    const title = stringValue(row["新闻标题"] ?? row.title);
    const publishedAt = stringValue(row["发布时间"] ?? row.publishedAt);
    if (!title || !publishedAt) return [];
    const url = safeHttpUrl(row["新闻链接"] ?? row.url);
    return [{
      key: url ?? `${publishedAt}-${title}`,
      title,
      summary: truncateText(stringValue(row["新闻内容"] ?? row.summary) ?? "", 220),
      source: stringValue(row["文章来源"] ?? row.source) ?? "未知来源",
      publishedAt,
      url,
    }];
  }).sort((left, right) => right.publishedAt.localeCompare(left.publishedAt)).slice(0, limit);
}

export function matchAStockDisclosureReminder(input: {
  definition: MarketInstrumentDefinition;
  rows: readonly Record<string, unknown>[];
  reportPeriod: string;
  now: string;
}): MarketReportReminder | null {
  const row = input.rows.find((candidate) => String(candidate["股票代码"] ?? "").trim().padStart(6, "0") === input.definition.symbol);
  if (!row || dateValue(row["实际披露"])) return null;
  const scheduledFor = dateValue(row["三次变更"] ?? row["二次变更"] ?? row["初次变更"] ?? row["首次预约"]);
  return scheduledFor ? reminder(scheduledFor, input.reportPeriod, null, "巨潮资讯预约披露", input.now) : null;
}

export function matchGlobalReportReminder(input: {
  definition: MarketInstrumentDefinition;
  rows: readonly Record<string, unknown>[];
  now: string;
}): MarketReportReminder | null {
  const candidates = input.rows.flatMap((row): MarketReportReminder[] => {
    const code = String(row["股票代码"] ?? "").trim().toUpperCase();
    if (code !== input.definition.symbol.toUpperCase()) return [];
    const scheduledFor = dateValue(row["发布日期"] ?? row.date);
    if (!scheduledFor) return [];
    const value = reminder(scheduledFor, stringValue(row["财报类型"] ?? row["财报期"]) ?? "财务报告", stringValue(row["发布时间"]), "百度股市通财报日历", input.now);
    return value ? [value] : [];
  });
  return candidates.sort((left, right) => left.scheduledFor.localeCompare(right.scheduledFor))[0] ?? null;
}

function stockDailyRequest(market: MarketStockRegion, symbol: string): AkToolsRequest {
  if (market === "CN") return { endpoint: "stock_zh_a_daily", params: { symbol: `${cnExchange(symbol)}${symbol}` } };
  if (market === "HK") return { endpoint: "stock_hk_daily", params: { symbol } };
  return { endpoint: "stock_us_daily", params: { symbol } };
}

function cnExchange(symbol: string) {
  return /^[489]/.test(symbol) ? "bj" : /^[56]/.test(symbol) ? "sh" : "sz";
}

function normalizeStockName(value: unknown, fallback: string) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, 40) : "";
  return name || fallback;
}

function reminder(scheduledFor: string, reportPeriod: string, timingLabel: string | null, sourceLabel: string, now: string) {
  const daysUntil = dateDifference(scheduledFor, now);
  if (daysUntil < 0) return null;
  return { scheduledFor, reportPeriod, timingLabel, daysUntil, sourceLabel } satisfies MarketReportReminder;
}

function dateDifference(date: string, now: string) {
  const target = Date.parse(`${date}T00:00:00+08:00`);
  const parsedNow = new Date(now);
  const todayText = Number.isNaN(parsedNow.getTime()) ? now.slice(0, 10) : new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(parsedNow);
  const today = Date.parse(`${todayText}T00:00:00+08:00`);
  return Number.isFinite(target) && Number.isFinite(today) ? Math.round((target - today) / 86_400_000) : -1;
}

function numberValue(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/,/g, "").trim();
  if (!normalized || normalized === "-" || normalized === "--") return null;
  const parsed = Number(normalized.replace(/%$/, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function stringValue(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized || null;
}

function dateValue(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  const match = raw.match(/^(\d{4})[-/]?(\d{2})[-/]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function safeHttpUrl(value: unknown) {
  const raw = stringValue(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function truncateText(value: string, maxLength: number) {
  return value.length <= maxLength ? value : `${value.slice(0, maxLength - 1)}…`;
}
