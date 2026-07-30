import assert from "node:assert/strict";
import test from "node:test";

import type { MarketInstrumentSnapshot, MarketTrendSeries } from "../types/market-intelligence";
import { createMarketTrackingSections } from "./market-intelligence-stock-sections";

test("uses compact mobile sections and keeps dense tables desktop-only", () => {
  const sections = createMarketTrackingSections(instrumentFixture(), 14, "month");
  const byKey = new Map(sections.map((section) => [section.key, section]));
  assert.equal(byKey.get("market-summary-mobile")?.visibility, "mobile");
  assert.match(JSON.stringify(byKey.get("market-summary-mobile")), /昨收/);
  assert.match(JSON.stringify(byKey.get("market-summary-mobile")), /涨跌额/);
  assert.equal(byKey.get("market-summary-desktop")?.visibility, "desktop");
  assert.equal(byKey.get("market-trend-table")?.visibility, "desktop");

  const chart = byKey.get("market-trend");
  assert.equal(chart?.body.kind, "visualization");
  if (chart?.body.kind === "visualization" && chart.body.visualization.kind === "chart") {
    assert.equal(chart.body.visualization.chart.frame?.title, "示例股票 · 月 K");
    assert.equal(chart.body.visualization.chart.visual.kind, "candlestick");
  }

  const financial = byKey.get("stock-financial");
  const news = byKey.get("stock-news");
  assert.equal(financial?.body.kind, "section");
  assert.equal(news?.body.kind, "section");
  if (financial?.body.kind === "section") {
    assert.equal(financial.body.sections?.find((section) => section.key === "financial-metrics")?.visibility, "desktop");
    assert.equal(financial.body.sections?.find((section) => section.key === "financial-mobile")?.visibility, "mobile");
  }
  if (news?.body.kind === "section") {
    assert.equal(news.body.sections?.find((section) => section.key === "stock-news-mobile")?.visibility, "mobile");
    assert.equal(news.body.sections?.find((section) => section.key === "stock-news-table")?.visibility, "desktop");
  }
});

test("gives a subscribed index the same quote and K-line detail without stock disclosures", () => {
  const sections = createMarketTrackingSections({
    ...instrumentFixture(),
    id: "cn-sse-composite",
    symbol: "000001",
    name: "上证指数",
    assetClass: "index",
    financial: null,
    reportReminder: null,
    news: [],
  }, 14, "day");
  const keys = sections.map((section) => section.key);
  assert.ok(keys.includes("market-summary-mobile"));
  assert.ok(keys.includes("market-summary-desktop"));
  assert.ok(keys.includes("market-trend"));
  assert.ok(!keys.includes("stock-financial"));
  assert.ok(!keys.includes("stock-news"));
});

function instrumentFixture(): MarketInstrumentSnapshot {
  const trends = Object.fromEntries(["day", "week", "month", "quarter", "year"].map((period) => [period, [{
    date: "2026-07-30",
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    changePercent: 10,
    volume: 1_000,
  }]])) as MarketTrendSeries;
  return {
    id: "cn-stock-000001",
    symbol: "000001",
    name: "示例股票",
    assetClass: "stock",
    market: "CN",
    currency: "CNY",
    description: "test",
    delayLabel: "日线行情",
    quote: { last: 11, change: 1, changePercent: 10, open: 10, high: 12, low: 9, previousClose: 10, volume: 1_000, observedAt: "2026-07-30" },
    quoteStatus: "available",
    trends,
    financial: { reportPeriod: "2026半年报", reportType: "半年报", publishedAt: null, revenue: 100, revenueYoY: 5, netProfit: 10, netProfitYoY: 2, basicEps: 1, sourceLabel: "测试" },
    reportReminder: null,
    news: [{ key: "news", title: "动态", summary: "摘要", source: "测试", publishedAt: "2026-07-30", url: null }],
  };
}
