import assert from "node:assert/strict";
import test from "node:test";

import type { MarketTrendPoint } from "../../types/market-intelligence";
import { aggregateMarketTrend, createMarketTrendSeries } from "./market-trend-periods";

test("aggregates weekly OHLCV from daily facts", () => {
  const points = [
    trend("2026-07-27", 10, 13, 9, 12, 100),
    trend("2026-07-28", 12, 15, 11, 14, 120),
    trend("2026-08-03", 14, 16, 13, 15, 140),
  ];
  assert.deepEqual(aggregateMarketTrend(points, "week"), [
    { date: "2026-07-28", open: 10, high: 15, low: 9, close: 14, changePercent: null, volume: 220 },
    { date: "2026-08-03", open: 14, high: 16, low: 13, close: 15, changePercent: 1 / 14 * 100, volume: 140 },
  ]);
});

test("keeps one year of daily candles and longer compressed windows", () => {
  const points = [
    trend("2016-01-04", 10, 11, 9, 10, 100),
    trend("2018-01-04", 20, 21, 19, 20, 100),
    trend("2023-01-04", 30, 31, 29, 30, 100),
    trend("2025-06-30", 40, 41, 39, 40, 100),
    trend("2026-06-30", 50, 51, 49, 50, 100),
  ];
  const series = createMarketTrendSeries(points);
  assert.deepEqual(series.day.map((point) => point.date), ["2025-06-30", "2026-06-30"]);
  assert.deepEqual(series.week.map((point) => point.date), ["2025-06-30", "2026-06-30"]);
  assert.deepEqual(series.month.map((point) => point.date), ["2023-01-04", "2025-06-30", "2026-06-30"]);
  assert.deepEqual(series.year.map((point) => point.date), ["2018-01-04", "2023-01-04", "2025-06-30", "2026-06-30"]);
});

function trend(date: string, open: number, high: number, low: number, close: number, volume: number): MarketTrendPoint {
  return { date, open, high, low, close, volume, changePercent: null };
}
