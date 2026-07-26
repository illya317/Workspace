import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationOverview } from "@workspace/finance/types";

import { summarizeExchangeRates } from "./consolidation-fx-summary";

test("summarizes rate facts into one row per currency pair", () => {
  const rate = {
    id: 1,
    version: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: "centralParity",
    rateDate: "2026-06-30",
    rate: 4.7847,
    sourceName: "中国外汇交易中心",
    sourceField: "人民币汇率中间价",
    sourceUrl: "https://example.com/rate",
    publishedAt: null,
    capturedAt: "2026-06-30T00:00:00.000Z",
    note: null,
    updatedBy: null,
  } as const;
  const fxPolicy = {
    pair: "CAD/CNY",
    sourceName: "中国外汇交易中心",
    sourceField: "人民币汇率中间价",
    unit: "人民币/1外币",
    sourceUrl: "https://example.com/rate",
    status: "ready",
    periodEndDate: "2026-06-30",
    comparativePeriodEndDate: "2025-12-31",
    closingRate: rate,
    comparativeClosingRate: { ...rate, id: 2, rateDate: "2025-12-31", rate: 5.1142 },
    historicalRateCount: 365,
    rates: Array.from({ length: 365 }, (_, index) => ({ ...rate, id: index + 1 })),
    investmentEvidence: [],
    missingInvestmentRateCount: 0,
    canadaSourceStatementsReady: true,
    note: "",
  } satisfies ConsolidationOverview["fxPolicy"];

  const summary = summarizeExchangeRates([
    fxPolicy,
    {
      ...fxPolicy,
      pair: "USD/CNY",
      closingRate: { ...rate, baseCurrency: "USD", rate: 7.1712 },
      comparativeClosingRate: { ...rate, id: 2, baseCurrency: "USD", rateDate: "2025-12-31", rate: 7.1884 },
    },
  ]);

  assert.equal(summary.length, 2);
  assert.equal(summary[0]?.pair, "CAD/CNY");
  assert.equal(summary[0]?.current?.rate, 4.7847);
  assert.equal(summary[0]?.comparative?.rate, 5.1142);
  assert.equal(summary[1]?.pair, "USD/CNY");
  assert.equal(summary[1]?.current?.rate, 7.1712);
  assert.equal("rates" in summary[0]!, false);
  assert.equal("historicalRateCount" in summary[0]!, false);
});
