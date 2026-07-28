import assert from "node:assert/strict";
import test from "node:test";

import { validateConsolidationFxFacts } from "./consolidation-fx-validation";

function requiredCurrentRates() {
  const closingDates = ["2025-12-31", "2026-05-31", "2026-06-30"];
  const averageDates = ["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30", "2026-05-31", "2026-06-30"];
  return [
    ...closingDates.map((targetDate, index) => ({
      exchangeRateId: 100 + index,
      rateKind: "centralParity",
      rateDate: targetDate,
      recordedBy: 10,
      recordedAt: "2026-06-30T08:00:00.000Z",
      applications: [{
        applicationType: "closing" as const,
        periodBasis: "current" as const,
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate,
        evidence: "现金及资产负债表时点折算",
        voucher: null,
      }],
    })),
    ...averageDates.map((targetDate, index) => ({
      exchangeRateId: 200 + index,
      rateKind: "monthlyAverage",
      rateDate: targetDate,
      recordedBy: 10,
      recordedAt: "2026-06-30T08:00:00.000Z",
      applications: [{
        applicationType: "monthlyAverage" as const,
        periodBasis: "current" as const,
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate,
        evidence: "当月中间价算术平均",
        voucher: null,
      }],
    })),
  ];
}

const investmentApplication = {
  applicationType: "historicalInvestment" as const,
  periodBasis: "current" as const,
  entitySnapshotId: 2,
  voucherItemId: 88,
  targetDate: "2025-03-15",
  evidence: "投资付款日折算",
  voucher: {
    companyCode: "ZX01",
    voucherNo: "记-18",
    voucherDate: "2025-03-15",
    description: "对子公司出资",
    accountCode: "1511",
    bookedAmountCny: 5_000_000,
    currencyCode: "CAD",
    originalAmount: 1_000_000,
  },
};

test("accepts complete CNY/CAD currency policies and applied rates", () => {
  const result = validateConsolidationFxFacts({
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [
      { id: 1, functionalCurrency: "CNY", currencyEvidence: "境内经营及记账本位币" },
      { id: 2, functionalCurrency: "CAD", currencyEvidence: "加拿大主体经营环境" },
    ],
    rates: [
      ...requiredCurrentRates(),
      { exchangeRateId: 11, rateKind: "historicalInvestment", rateDate: "2025-03-14", recordedBy: 10, recordedAt: "2025-03-15T08:00:00.000Z", applications: [investmentApplication] },
    ],
    requiredInvestmentVoucherIds: [88],
    requiredComparativeEntityIds: [],
  });
  assert.equal(result.ok, true);
});

test("accepts entity-level historical capital evidence without a voucher", () => {
  const result = validateConsolidationFxFacts({
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [{ id: 2, functionalCurrency: "CAD", currencyEvidence: "加拿大主体经营环境" }],
    rates: [
      ...requiredCurrentRates(),
      { exchangeRateId: 12, rateKind: "historicalInvestment", rateDate: "2025-01-01", recordedBy: 10, recordedAt: "2025-01-02T08:00:00.000Z", applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate: "2025-01-01",
        evidence: "出资协议与银行回单",
        capitalOriginalAmount: 1_000_000,
        equityLineCode: "paidInCapital",
        voucher: null,
      }] },
    ],
    requiredInvestmentVoucherIds: [],
    requiredComparativeEntityIds: [],
  });
  assert.equal(result.ok, true);
});

test("accepts multiple historical capital occurrence dates for one foreign entity", () => {
  const result = validateConsolidationFxFacts({
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [{ id: 2, functionalCurrency: "CAD", currencyEvidence: "加拿大主体经营环境" }],
    rates: [
      ...requiredCurrentRates(),
      { exchangeRateId: 12, rateKind: "centralParity", rateDate: "2020-01-01", recordedBy: 10, recordedAt: "2026-06-30T08:00:00.000Z", applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate: "2020-01-01",
        evidence: "期初资本",
        capitalOriginalAmount: 100_000,
        equityLineCode: "paidInCapital",
        voucher: null,
      }] },
      { exchangeRateId: 13, rateKind: "centralParity", rateDate: "2024-04-01", recordedBy: 10, recordedAt: "2026-06-30T08:00:00.000Z", applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate: "2024-04-01",
        evidence: "资本公积凭证",
        capitalOriginalAmount: 51_326.6,
        equityLineCode: "capitalReserve",
        voucher: null,
      }] },
    ],
    requiredInvestmentVoucherIds: [],
    requiredComparativeEntityIds: [],
  });
  assert.equal(result.ok, true);
});

test("requires a currency policy for every entity", () => {
  const result = validateConsolidationFxFacts({
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [{ id: 1, functionalCurrency: null, currencyEvidence: null }],
    rates: [],
    requiredInvestmentVoucherIds: [],
    requiredComparativeEntityIds: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "currencyPolicies");
});

test("rejects a historical rate more than seven days before investment", () => {
  const result = validateConsolidationFxFacts({
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [{ id: 2, functionalCurrency: "CAD", currencyEvidence: "加拿大主体经营环境" }],
    rates: [
      ...requiredCurrentRates(),
      { exchangeRateId: 11, rateKind: "historicalInvestment", rateDate: "2025-03-01", recordedBy: 10, recordedAt: "2025-03-02T08:00:00.000Z", applications: [investmentApplication] },
    ],
    requiredInvestmentVoucherIds: [88],
    requiredComparativeEntityIds: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "rateApplications");
});

test("requires an application for every CAD investment voucher", () => {
  const result = validateConsolidationFxFacts({
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [{ id: 2, functionalCurrency: "CAD", currencyEvidence: "加拿大主体经营环境" }],
    rates: [
      ...requiredCurrentRates(),
      { exchangeRateId: 11, rateKind: "historicalInvestment", rateDate: "2025-03-14", recordedBy: 10, recordedAt: "2025-03-15T08:00:00.000Z", applications: [investmentApplication] },
    ],
    requiredInvestmentVoucherIds: [88, 89],
    requiredComparativeEntityIds: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "rateApplications");
});


test("requires frozen rate recorder evidence", () => {
  const result = validateConsolidationFxFacts({
    periodEnd: "2026-06-30",
    comparativePeriodEnd: "2025-06-30",
    entities: [{ id: 2, functionalCurrency: "CAD", currencyEvidence: "加拿大主体经营环境" }],
    rates: [{
      exchangeRateId: 10,
      rateKind: "closing",
      rateDate: "2026-06-30",
      recordedBy: null,
      recordedAt: null,
      applications: requiredCurrentRates()[0]!.applications,
    }],
    requiredInvestmentVoucherIds: [],
    requiredComparativeEntityIds: [],
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "exchangeRates");
});
