import assert from "node:assert/strict";
import test from "node:test";

import {
  MARKET_INSTRUMENT_CATALOG,
  createMarketStockDefinitions,
  marketFinancialSummary,
  marketNewsItems,
  marketTrendRequest,
  marketTrendPoints,
  matchAStockDisclosureReminder,
  matchGlobalReportReminder,
  matchMarketQuoteRow,
  normalizeMarketInstrumentIds,
  normalizeMarketStockSubscriptions,
  requestKey,
} from "./market-intelligence";

test("normalizes known market subscriptions without duplicates", () => {
  assert.deepEqual(
    normalizeMarketInstrumentIds(["us-stock-aapl", "unknown", "us-stock-aapl", " hk-hang-seng "]),
    ["us-stock-aapl", "hk-hang-seng"],
  );
});

test("request key is stable across parameter order", () => {
  assert.equal(
    requestKey({ endpoint: "quotes", params: { b: "2", a: "1" } }),
    requestKey({ endpoint: "quotes", params: { a: "1", b: "2" } }),
  );
});

test("declares historical trend sources for indices and commodities", () => {
  const sse = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "cn-sse-composite");
  const hsi = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "hk-hang-seng");
  const gold = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "commodity-comex-gold");
  assert.ok(sse && hsi && gold);
  assert.deepEqual(marketTrendRequest(sse), { endpoint: "stock_zh_index_daily", params: { symbol: "sh000001" } });
  assert.deepEqual(marketTrendRequest(hsi), { endpoint: "stock_hk_index_daily_sina", params: { symbol: "HSI" } });
  assert.deepEqual(marketTrendRequest(gold), { endpoint: "futures_foreign_hist", params: { symbol: "GC" } });
});

test("maps AKTools Chinese quote fields and US suffix codes", () => {
  const definition = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "us-stock-aapl");
  assert.ok(definition);
  assert.deepEqual(
    matchMarketQuoteRow(definition, [{
      "代码": "105.AAPL",
      "名称": "苹果",
      "最新价": "217.50",
      "涨跌额": "1.25",
      "涨跌幅": "0.58",
      "今开": "216.10",
      "最高": "219.00",
      "最低": "215.80",
      "昨收": "216.25",
      "成交量": "1,200",
    }], "2026-07-30T00:00:00.000Z"),
    {
      last: 217.5,
      change: 1.25,
      changePercent: 0.58,
      open: 216.1,
      high: 219,
      low: 215.8,
      previousClose: 216.25,
      volume: 1200,
      observedAt: "2026-07-30T00:00:00.000Z",
    },
  );
});

test("maps the latest daily row and derives its change", () => {
  const definition = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "us-stock-aapl");
  assert.ok(definition);
  const quote = matchMarketQuoteRow(definition, [
    { date: "2026-07-28", close: 215, open: 214, high: 216, low: 213, volume: 100 },
    { date: "2026-07-29", close: 217.5, open: 216, high: 219, low: 215, volume: 120 },
  ], "2026-07-30T00:00:00.000Z");
  assert.equal(quote?.last, 217.5);
  assert.equal(quote?.previousClose, 215);
  assert.equal(quote?.change, 2.5);
  assert.equal(quote?.changePercent, 2.5 / 215 * 100);
  assert.equal(quote?.observedAt, "2026-07-29");
});

test("uses the midpoint of FX bid and ask quotes", () => {
  const catalogDefinition = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "fx-usd-cny");
  assert.ok(catalogDefinition);
  const definition = { ...catalogDefinition, source: { endpoint: "fx_spot_quote", codes: ["USD/CNY"] } };
  assert.equal(matchMarketQuoteRow(definition, [
    { "货币对": "USD/CNY", "买报价": 6.753, "卖报价": 6.754 },
  ], "2026-07-30T00:00:00.000Z")?.last, 6.7535);
});

test("uses the latest Bank of China reference rate when spot quotes are empty", () => {
  const definition = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "fx-usd-cny");
  assert.ok(definition);
  const quote = matchMarketQuoteRow(definition, [
    { "日期": "2026-07-30T00:00:00.000", "央行中间价": 678.92, "中行折算价": 678.92 },
    { "日期": "2026-07-31T00:00:00.000", "央行中间价": null, "中行折算价": 679.12 },
  ], "2026-07-31T08:00:00.000Z");
  assert.ok(quote);
  assert.equal(quote.last, 6.7912);
  assert.ok(Math.abs((quote.previousClose ?? 0) - 6.7892) < 1e-12);
  assert.ok(Math.abs((quote.change ?? 0) - 0.002) < 1e-12);
  assert.equal(quote.open, null);
  assert.equal(quote.observedAt, "2026-07-31T00:00:00.000");
});

test("normalizes arbitrary A, HK and US stock subscriptions", () => {
  assert.deepEqual(normalizeMarketStockSubscriptions([
    { market: "cn", symbol: "SH600036", name: " 招商银行 " },
    { market: "HK", symbol: "700.hk", name: "腾讯" },
    { market: "US", symbol: "brk.b", name: "Berkshire" },
    { market: "US", symbol: "bad ticker", name: "invalid" },
  ]), [
    { market: "CN", symbol: "600036", name: "招商银行" },
    { market: "HK", symbol: "00700", name: "腾讯" },
    { market: "US", symbol: "BRK.B", name: "Berkshire" },
  ]);
});

test("creates provider definitions only for stocks outside the fixed catalog", () => {
  const definitions = createMarketStockDefinitions(normalizeMarketStockSubscriptions([
    { market: "CN", symbol: "600519", name: "known" },
    { market: "US", symbol: "NVDA", name: "NVIDIA" },
  ]));
  assert.equal(definitions.length, 1);
  assert.equal(definitions[0]?.id, "us-stock-nvda");
  assert.deepEqual(definitions[0]?.source.params, { symbol: "NVDA" });
  assert.deepEqual(definitions[0]?.trendSource, definitions[0]?.source);
});

test("routes current Beijing Stock Exchange 920-series codes to the Beijing history source", () => {
  const [definition] = createMarketStockDefinitions(normalizeMarketStockSubscriptions([
    { market: "CN", symbol: "920001", name: "北交所示例" },
  ]));
  assert.deepEqual(definition?.source.params, { symbol: "bj920001" });
});

test("builds a recent price series and derives daily changes", () => {
  assert.deepEqual(marketTrendPoints([
    { date: "2026-07-28", close: 100, volume: 10 },
    { date: "2026-07-29", close: 102, volume: 12 },
  ]), [
    { date: "2026-07-28", open: null, high: null, low: null, close: 100, changePercent: null, volume: 10 },
    { date: "2026-07-29", open: null, high: null, low: null, close: 102, changePercent: 2, volume: 12 },
  ]);
});

test("keeps OHLC fields for candlestick rendering and returns one year of sessions by default", () => {
  const rows = Array.from({ length: 270 }, (_, index) => ({
    date: new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10),
    open: 100 + index,
    high: 102 + index,
    low: 99 + index,
    close: 101 + index,
    volume: 1_000 + index,
  }));
  const points = marketTrendPoints(rows);
  assert.equal(points.length, 260);
  assert.equal(points[0]?.close, 111);
  assert.deepEqual(points.at(-1), {
    date: "2025-09-27",
    open: 369,
    high: 371,
    low: 368,
    close: 370,
    changePercent: (370 - 369) / 369 * 100,
    volume: 1_269,
  });
});

test("normalizes financial summaries and stock news", () => {
  const definition = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "us-stock-aapl");
  assert.ok(definition);
  assert.deepEqual(marketFinancialSummary(definition, [{
    REPORT_DATE: "2026-03-28 00:00:00",
    REPORT_DATA_TYPE: "2026年中报",
    NOTICE_DATE: "2026-05-01 00:00:00",
    OPERATE_INCOME: 254_940,
    OPERATE_INCOME_YOY: 16.1,
    PARENT_HOLDER_NETPROFIT: 71_675,
    PARENT_HOLDER_NETPROFIT_YOY: 17.3,
    BASIC_EPS: 4.87,
  }]), {
    reportPeriod: "2026年中报",
    reportType: "财务报告",
    publishedAt: "2026-05-01",
    revenue: 254_940,
    revenueYoY: 16.1,
    netProfit: 71_675,
    netProfitYoY: 17.3,
    basicEps: 4.87,
    sourceLabel: "AKShare · 东方财富财务分析",
  });
  assert.deepEqual(marketNewsItems([{ "新闻标题": "新产品发布", "新闻内容": "摘要", "发布时间": "2026-07-30 09:00:00", "文章来源": "测试源", "新闻链接": "https://example.com/a" }]), [{
    key: "https://example.com/a",
    title: "新产品发布",
    summary: "摘要",
    source: "测试源",
    publishedAt: "2026-07-30 09:00:00",
    url: "https://example.com/a",
  }]);
});

test("matches A-share and global financial report reminders", () => {
  const cn = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "cn-stock-600519");
  const us = MARKET_INSTRUMENT_CATALOG.find((item) => item.id === "us-stock-aapl");
  assert.ok(cn && us);
  assert.deepEqual(matchAStockDisclosureReminder({
    definition: cn,
    rows: [{ "股票代码": "600519", "首次预约": "2026-08-15", "实际披露": null }],
    reportPeriod: "2026半年报",
    now: "2026-07-30T04:00:00.000Z",
  }), {
    scheduledFor: "2026-08-15",
    reportPeriod: "2026半年报",
    timingLabel: null,
    daysUntil: 16,
    sourceLabel: "巨潮资讯预约披露",
  });
  assert.equal(matchGlobalReportReminder({
    definition: us,
    rows: [{ "股票代码": "AAPL", "财报类型": "美东时间发布2026年三季报", "发布时间": "盘后", "发布日期": "2026-07-30" }],
    now: "2026-07-30T04:00:00.000Z",
  })?.daysUntil, 0);
});
