import assert from "node:assert/strict";
import test from "node:test";

import { validateConsolidationFxFacts } from "../domain/consolidation-fx-validation";

const MONTH_ENDS_2026_H1 = ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"];

function fxFacts(input: { withCashPoints?: boolean } = {}) {
  return {
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [
      { id: 1, functionalCurrency: "CNY", currencyEvidence: "境内经营及记账本位币" },
      { id: 2, functionalCurrency: "CAD", currencyEvidence: "加拿大主体经营环境" },
    ],
    rates: [
      {
        exchangeRateId: 1,
        rateKind: "centralParity",
        rateDate: "2026-06-30",
        recordedBy: 10,
        recordedAt: "2026-06-30T08:00:00.000Z",
        applications: [{
          applicationType: "closing" as const,
          periodBasis: "current" as const,
          entitySnapshotId: 2,
          voucherItemId: null,
          targetDate: "2026-06-30",
          evidence: "期末折算",
          voucher: null,
        }],
      },
      ...MONTH_ENDS_2026_H1.map((targetDate, index) => ({
        exchangeRateId: 100 + index,
        rateKind: "monthlyAverage",
        rateDate: targetDate,
        recordedBy: 10,
        recordedAt: "2026-06-30T08:00:00.000Z",
        applications: [{
          applicationType: "flowAverage" as const,
          periodBasis: "current" as const,
          entitySnapshotId: 2,
          voucherItemId: null,
          targetDate,
          evidence: "月平均汇率",
          voucher: null,
        }],
      })),
      ...(input.withCashPoints === false ? [] : ["2025-12-31", "2026-05-31"].map((targetDate, index) => ({
        exchangeRateId: 200 + index,
        rateKind: "centralParity",
        rateDate: targetDate,
        recordedBy: 10,
        recordedAt: "2026-06-30T08:00:00.000Z",
        applications: [{
          applicationType: "cashPoint" as const,
          periodBasis: "current" as const,
          entitySnapshotId: 2,
          voucherItemId: null,
          targetDate,
          evidence: "现金时点汇率",
          voucher: null,
        }],
      }))),
    ],
    requiredInvestmentVoucherIds: [],
    requiredComparativeEntityIds: [2],
  };
}

test("fx 校验:比较期被上期输出覆盖的实体放宽,未覆盖实体保持严格", () => {
  const strict = validateConsolidationFxFacts(fxFacts());
  assert.equal(strict.ok, false);
  const covered = validateConsolidationFxFacts({
    ...fxFacts(),
    priorReferenceCoverage: [{ entitySnapshotId: 2, yearOpening: false, comparativePeriod: true, monthOpening: false }],
  });
  assert.equal(covered.ok, true, covered.ok ? undefined : JSON.stringify(covered.issue));
  const uncovered = validateConsolidationFxFacts({
    ...fxFacts(),
    priorReferenceCoverage: [{ entitySnapshotId: 2, yearOpening: false, comparativePeriod: false, monthOpening: false }],
  });
  assert.equal(uncovered.ok, false);
});

test("fx 校验:期初/月初现金覆盖后对应时点汇率不再要求", () => {
  const withoutCashPoints = fxFacts({ withCashPoints: false });
  const strict = validateConsolidationFxFacts({
    ...withoutCashPoints,
    priorReferenceCoverage: [{ entitySnapshotId: 2, yearOpening: false, comparativePeriod: true, monthOpening: false }],
  });
  assert.equal(strict.ok, false);
  const yearOpeningOnly = validateConsolidationFxFacts({
    ...withoutCashPoints,
    priorReferenceCoverage: [{ entitySnapshotId: 2, yearOpening: true, comparativePeriod: true, monthOpening: false }],
  });
  assert.equal(yearOpeningOnly.ok, false);
  const fullyCovered = validateConsolidationFxFacts({
    ...withoutCashPoints,
    priorReferenceCoverage: [{ entitySnapshotId: 2, yearOpening: true, comparativePeriod: true, monthOpening: true }],
  });
  assert.equal(fullyCovered.ok, true, fullyCovered.ok ? undefined : JSON.stringify(fullyCovered.issue));
});
