import assert from "node:assert/strict";
import test from "node:test";

import { validateFinanceCapitalHistoricalAmountInput } from "./repair-finance-capital-historical-amount.mjs";

test("capital historical amount input accepts opening balances and posted-voucher targets", () => {
  const input = validateFinanceCapitalHistoricalAmountInput({
    kind: "finance-capital-historical-amount",
    schemaVersion: 1,
    facts: [{
      sourceKind: "openingBalance",
      companyCode: "ZX05",
      accountCode: "3001",
      periodStart: "2020-01-01",
      originalCurrency: "CAD",
      originalAmount: 100_000,
      historicalAmountCny: 505_056,
      evidence: "实际人民币投资金额",
    }, {
      sourceKind: "voucherItem",
      companyCode: "ZX05",
      accountCode: "3002",
      voucherDate: "2024-04-01",
      voucherNo: "2024-04-记-0004",
      originalCurrency: "CAD",
      originalAmount: 51_326.6,
      historicalAmountCny: 276_199.2,
      evidence: "境内投资凭证",
    }],
  });
  assert.equal(input.facts.length, 2);
});

test("capital historical amount input rejects a supplied weighted rate", () => {
  assert.throws(() => validateFinanceCapitalHistoricalAmountInput({
    kind: "finance-capital-historical-amount",
    schemaVersion: 1,
    facts: [{
      sourceKind: "openingBalance",
      companyCode: "ZX05",
      accountCode: "3001",
      periodStart: "2020-01-01",
      originalCurrency: "CAD",
      originalAmount: 100_000,
      historicalAmountCny: 505_056,
      weightedRate: 5.05056,
      evidence: "实际人民币投资金额",
    }],
  }), /fields are invalid/);
});
