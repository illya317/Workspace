import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCapitalHistoricalAmountRateCommand,
  buildMonthlyAverageExchangeRateCommand,
  buildRefreshStatementExchangeRateCommand,
  buildVoucherHistoricalInvestmentRateCommand,
} from "./statement-exchange-rate-validation";

test("capital historical amount validates the evidence source and derives the weighted rate", () => {
  const accepted = buildCapitalHistoricalAmountRateCommand({
    sourceKind: "accountBalance",
    sourceRecordId: 1322235,
    evidenceDate: "2020-01-01",
    originalCurrency: " cad ",
    originalAmount: 100_000,
    historicalAmountCny: 505_056,
    evidence: " 历史凭证确认 ",
  }, 9);
  assert.equal(accepted.ok, true);
  if (accepted.ok) {
    assert.equal(accepted.data.currencyCode, "CAD");
    assert.equal(accepted.data.weightedRate, 5.05056);
    assert.equal(accepted.data.evidence, "历史凭证确认");
  }
  assert.equal(buildCapitalHistoricalAmountRateCommand({
    sourceKind: "voucherItem",
    sourceRecordId: 0,
    evidenceDate: "2020-01-01",
    originalCurrency: "CAD",
    originalAmount: 100_000,
    historicalAmountCny: 505_056,
    evidence: "历史凭证确认",
  }, 9).ok, false);
});

test("monthly average rate input normalizes the currency and validates the period", () => {
  const result = buildMonthlyAverageExchangeRateCommand({ currencyCode: "cad", year: 2026, month: 2 }, 9);
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.data, { currencyCode: "CAD", year: 2026, month: 2, userId: 9 });

  assert.equal(buildMonthlyAverageExchangeRateCommand({ currencyCode: "CNY", year: 2026, month: 2 }, 9).ok, false);
  assert.equal(buildMonthlyAverageExchangeRateCommand({ currencyCode: "CAD", year: 2026, month: 13 }, 9).ok, false);
});

test("exchange-rate refresh accepts an official source lookup target", () => {
  const result = buildRefreshStatementExchangeRateCommand({ currencyCode: "cad", targetDate: "2025-12-31" }, 9);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.input.currencyCode, "CAD");
});

test("voucher historical rates require a dated item, positive rate, and matching evidence", () => {
  const accepted = buildVoucherHistoricalInvestmentRateCommand({
    voucherItemId: 101,
    contributionDate: "2018-02-13",
    rate: 5.05056,
    matchingLabel: " 加拿大公司实收资本 ",
  }, 9);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.data.matchingLabel, "加拿大公司实收资本");
  assert.equal(buildVoucherHistoricalInvestmentRateCommand({
    voucherItemId: 0,
    contributionDate: "2018-02-13",
    rate: 0,
    matchingLabel: "",
  }, 9).ok, false);
});

test("exchange-rate refresh rejects invalid currencies and dates", () => {
  const currency = buildRefreshStatementExchangeRateCommand({ currencyCode: "CNY", targetDate: "2025-12-31" }, 9);
  const date = buildRefreshStatementExchangeRateCommand({ currencyCode: "CAD", targetDate: "2025-02-30" }, 9);
  assert.equal(currency.ok, false);
  assert.equal(date.ok, false);
});
