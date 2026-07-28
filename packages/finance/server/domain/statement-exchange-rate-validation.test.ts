import assert from "node:assert/strict";
import test from "node:test";

import {
  buildRefreshStatementExchangeRateCommand,
  buildVoucherHistoricalInvestmentRateCommand,
} from "./statement-exchange-rate-validation";

test("exchange-rate refresh accepts an official source lookup target", () => {
  const result = buildRefreshStatementExchangeRateCommand({ currencyCode: "cad", targetDate: "2025-12-31" }, 9);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.input.currencyCode, "CAD");
});

test("voucher historical rates require a dated item, positive rate, and matching evidence", () => {
  const accepted = buildVoucherHistoricalInvestmentRateCommand({
    voucherItemId: 101,
    voucherDate: "2019-05-31",
    rate: 5.05056,
    matchingLabel: " 加拿大公司实收资本 ",
  }, 9);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.equal(accepted.data.matchingLabel, "加拿大公司实收资本");
  assert.equal(buildVoucherHistoricalInvestmentRateCommand({
    voucherItemId: 0,
    voucherDate: "2019-05-31",
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
