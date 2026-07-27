import assert from "node:assert/strict";
import test from "node:test";

import {
  aggregateHistoricalCapitalFacts,
  cadAmountFromDescription,
  resolveCadInvestmentOriginalAmount,
} from "./consolidation-rate-applications";

test("reads CAD remittance amounts only from explicit original-currency evidence", () => {
  assert.equal(cadAmountFromDescription("付投资款（321462.29加币）"), 321_462.29);
  assert.equal(cadAmountFromDescription("CAD 20,000.50 investment"), 20_000.5);
  assert.equal(cadAmountFromDescription("付投资款 107949.00 元"), null);
  assert.equal(resolveCadInvestmentOriginalAmount({
    investment: {
      originalDebit: null,
      originalCredit: null,
      currencyCode: null,
      description: "付加拿大投资款",
    },
    voucherDescription: "",
    voucherItems: [{
      originalDebit: null,
      originalCredit: { toString: () => "20000" } as never,
      currencyCode: "CAD",
    }],
  }), 20_000);
});

test("aggregates opening capital and posted capital movements by company and occurrence date", () => {
  const facts = aggregateHistoricalCapitalFacts({
    opening: [
      {
        companyCode: "ZX05",
        targetDate: "2020-01-01",
        accountCode: "3001",
        accountName: "实收资本",
        openingDebit: 0,
        openingCredit: 100_000,
      },
      {
        companyCode: "ZX05",
        targetDate: "2020-01-01",
        accountCode: "3002",
        accountName: "资本公积",
        openingDebit: 0,
        openingCredit: 321_462.29,
      },
    ],
    movements: [
      {
        companyCode: "ZX05",
        targetDate: "2024-04-01",
        voucherNo: "2024-04-记-0004",
        accountCode: "3002",
        accountName: "资本公积",
        description: "收到投资款",
        debit: 0,
        credit: 51_326.6,
      },
      {
        companyCode: "ZX05",
        targetDate: "2024-04-01",
        voucherNo: "2024-04-记-0005",
        accountCode: "3002",
        accountName: "资本公积",
        description: "同日追加",
        debit: 0,
        credit: 10,
      },
    ],
  });

  assert.deepEqual(facts.map((fact) => ({
    companyCode: fact.companyCode,
    targetDate: fact.targetDate,
    originalAmount: fact.originalAmount,
  })), [
    { companyCode: "ZX05", targetDate: "2020-01-01", originalAmount: 421_462.29 },
    { companyCode: "ZX05", targetDate: "2024-04-01", originalAmount: 51_336.6 },
  ]);
  assert.match(facts[0]!.evidence, /最早可用账期期初余额/);
  assert.match(facts[1]!.evidence, /2024-04-记-0004/);
});

test("ignores debit-side reductions and zero capital facts in the current additive policy", () => {
  assert.deepEqual(aggregateHistoricalCapitalFacts({
    opening: [{
      companyCode: "ZX05",
      targetDate: "2020-01-01",
      accountCode: "3001",
      accountName: "实收资本",
      openingDebit: 100,
      openingCredit: 0,
    }],
    movements: [{
      companyCode: "ZX05",
      targetDate: "2025-01-01",
      voucherNo: "记-1",
      accountCode: "3002",
      accountName: "资本公积",
      description: "冲减",
      debit: 50,
      credit: 0,
    }],
  }), []);
});
