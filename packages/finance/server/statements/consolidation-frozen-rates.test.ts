import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationRateReferenceSnapshot } from "@workspace/finance/types";

import { hasMonthlyAverageRateEvidence, historicalEquityRate } from "./consolidation-frozen-rates";

function rate(
  id: number,
  value: number,
  application: ConsolidationRateReferenceSnapshot["applications"][number],
): ConsolidationRateReferenceSnapshot {
  return {
    id,
    exchangeRateId: id,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: application.applicationType === "historicalInvestment" ? "historicalInvestment" : "centralParity",
    rateDate: application.targetDate,
    rate: value,
    sourceUrl: "https://www.chinamoney.com.cn/",
    publishedAt: null,
    recordedBy: 1,
    recordedAt: "2026-01-01T00:00:00.000Z",
    applications: [application],
  };
}

test("historical equity rates keep paid-in capital and capital reserve in separate pools", () => {
  const shared = {
    periodBasis: "current" as const,
    entitySnapshotId: 5,
    voucherItemId: null,
    evidence: "fixture",
  };
  const rates = [
    rate(1, 4.8, {
      ...shared,
      applicationType: "historicalInvestment",
      voucherItemId: 11,
      targetDate: "2020-01-01",
      voucher: {
        companyCode: "P01",
        voucherNo: "记-11",
        voucherDate: "2020-01-01",
        description: "paid in",
        accountCode: "1511",
        bookedAmountCny: 336,
        currencyCode: "CAD",
        originalAmount: 70,
        matchingLineCode: "paidInCapital",
      },
    }),
    rate(2, 5.2, {
      ...shared,
      applicationType: "historicalCapital",
      targetDate: "2020-02-01",
      capitalOriginalAmount: 30,
      capitalLineCode: "capitalReserve",
      voucher: null,
    }),
  ];

  const paidIn = historicalEquityRate(rates, 5, "current", "paidInCapital");
  const reserve = historicalEquityRate(rates, 5, "current", "capitalReserve");
  assert.deepEqual(paidIn, { ok: true, data: 4.8 });
  assert.deepEqual(reserve, { ok: true, data: 5.2 });
});

test("unclassified historical investments retain the existing capital-reserve fallback", () => {
  const rates = [rate(3, 5.1, {
    applicationType: "historicalInvestment",
    periodBasis: "current",
    entitySnapshotId: 5,
    voucherItemId: 12,
    targetDate: "2020-03-01",
    evidence: "fixture",
    voucher: {
      companyCode: "P01",
      voucherNo: "记-12",
      voucherDate: "2020-03-01",
      description: "legacy investment",
      accountCode: "1511",
      bookedAmountCny: 51,
      currencyCode: "CAD",
      originalAmount: 10,
    },
  })];

  assert.deepEqual(historicalEquityRate(rates, 5, "current", "paidInCapital"), { ok: true, data: null });
  assert.deepEqual(historicalEquityRate(rates, 5, "current", "capitalReserve"), { ok: true, data: 5.1 });
});

test("monthly average evidence requires an applied flow-average rate", () => {
  const closing = rate(4, 4.8, {
    applicationType: "closing",
    periodBasis: "current",
    entitySnapshotId: 5,
    voucherItemId: null,
    targetDate: "2026-06-30",
    evidence: "fixture",
    voucher: null,
  });
  const monthlyAverage = {
    ...rate(5, 4.9, {
      applicationType: "flowAverage",
      periodBasis: "current",
      entitySnapshotId: 5,
      voucherItemId: null,
      targetDate: "2026-06-30",
      evidence: "fixture",
      voucher: null,
    }),
    rateKind: "monthlyAverage" as const,
  };

  assert.equal(hasMonthlyAverageRateEvidence([closing]), false);
  assert.equal(hasMonthlyAverageRateEvidence([closing, monthlyAverage]), true);
});
