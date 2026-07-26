import assert from "node:assert/strict";
import test from "node:test";

import { buildRefreshStatementExchangeRateCommand } from "./statement-exchange-rate-validation";

test("exchange-rate refresh accepts an official source lookup target", () => {
  const result = buildRefreshStatementExchangeRateCommand({ currencyCode: "cad", targetDate: "2025-12-31" }, 9);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.data.input.currencyCode, "CAD");
});

test("exchange-rate refresh rejects invalid currencies and dates", () => {
  const currency = buildRefreshStatementExchangeRateCommand({ currencyCode: "CNY", targetDate: "2025-12-31" }, 9);
  const date = buildRefreshStatementExchangeRateCommand({ currencyCode: "CAD", targetDate: "2025-02-30" }, 9);
  assert.equal(currency.ok, false);
  assert.equal(date.ok, false);
});
