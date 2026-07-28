import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";

import { buildRemittanceFxEntries } from "./consolidation-remittance-fx-entries";

function batch(rate: number, bookedAmountCny: number): ConsolidationBatchSnapshot {
  return {
    entities: [
      { id: 1, companyId: 11, companyCode: "P01", companyName: "投资方" },
      { id: 2, companyId: 22, companyCode: "C05", companyName: "加拿大主体" },
    ],
    exchangeRates: [{
      id: 7,
      exchangeRateId: 70,
      exchangeRateVersion: 1,
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "centralParity",
      rateDate: "2025-03-14",
      rate,
      sourceUrl: "https://example.test/rate",
      publishedAt: null,
      recordedBy: 9,
      recordedAt: "2025-03-14T08:00:00.000Z",
      applications: [{
        applicationType: "historicalInvestment",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: 101,
        targetDate: "2025-03-14",
        evidence: "发出流水",
        voucher: {
          companyCode: "P01",
          voucherNo: "记-101",
          voucherDate: "2025-03-14",
          description: "汇加拿大投资款",
          accountCode: "1511",
          bookedAmountCny,
          currencyCode: "CAD",
          originalAmount: 100,
        },
      }],
    }],
  } as ConsolidationBatchSnapshot;
}

test("negative remittance difference is an OCI loss on the debit side", () => {
  const [entry] = buildRemittanceFxEntries(batch(5, 520));
  assert.equal(entry?.matchDifference, 20);
  assert.match(entry?.differenceResolution ?? "", /损失/);
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["capitalReserve", 500, 0],
    ["longTermInvest", 0, 520],
    ["otherComprehensiveIncome", 20, 0],
  ]);
});

test("positive remittance difference is OCI on the credit side", () => {
  const [entry] = buildRemittanceFxEntries(batch(5.2, 500));
  assert.equal(entry?.matchDifference, 20);
  assert.match(entry?.differenceResolution ?? "", /收益/);
  assert.equal(entry?.lines[2]?.credit, 20);
});

test("historical capital rates generate a partial-ownership Canada elimination voucher", () => {
  const input = {
    entities: [
      { id: 1, companyId: 11, companyCode: "P01", companyName: "投资方", functionalCurrency: "CNY" },
      {
        id: 2,
        companyId: 22,
        companyCode: "C05",
        companyName: "加拿大主体",
        directParentCompanyId: 11,
        shareRatio: 0.75,
        functionalCurrency: "CAD",
      },
    ],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: { payload: { equity: [{ lineCode: "paidInCapital", amount: 100 }] } },
    }],
    exchangeRates: [{
      id: 7,
      exchangeRateId: 70,
      exchangeRateVersion: 1,
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "centralParity",
      rateDate: "2025-03-14",
      rate: 5,
      sourceUrl: "https://example.test/rate-1",
      applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate: "2025-03-14",
        evidence: "实收资本",
        capitalOriginalAmount: 100,
        equityLineCode: "paidInCapital",
        voucher: null,
      }],
    }, {
      id: 8,
      exchangeRateId: 80,
      exchangeRateVersion: 1,
      baseCurrency: "CAD",
      quoteCurrency: "CNY",
      rateKind: "centralParity",
      rateDate: "2025-04-01",
      rate: 5.2,
      sourceUrl: "https://example.test/rate-2",
      applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate: "2025-04-01",
        evidence: "资本公积",
        capitalOriginalAmount: 50,
        equityLineCode: "capitalReserve",
        voucher: null,
      }],
    }],
  } as ConsolidationBatchSnapshot;
  const group = {
    category: "investmentEquity",
    generationKey: "investmentEquity:relationship:11:22",
    status: "unresolved",
    leftCompanyId: 11,
    rightCompanyId: 22,
    leftFacts: [{
      itemId: 101,
      voucherId: 201,
      voucherNo: "记-101",
      voucherDate: "2025-04-01",
      companyId: 11,
      counterpartyCompanyId: 22,
      accountCode: "1511",
      accountName: "长期股权投资",
      description: "汇加拿大投资款",
      lineCode: "longTermInvest",
      signedAmount: 700,
      currencyCode: "CNY",
      sourceFingerprint: "voucher-101",
      investmentRole: "investment",
    }],
    rightFacts: [],
    leftNetAmount: 700,
    rightNetAmount: 0,
    matchedAmount: 0,
    differenceAmount: 0,
    matchingRule: "fixture",
    matchingVersion: "fixture-v1",
    differenceResolution: null,
    comparisonCurrencyCode: null,
    requiredActions: ["translateToCny", "allocateNonControllingInterest"],
    ownershipShareRatio: 0.75,
  } satisfies ConsolidationVoucherMatchGroup;

  const [entry] = buildRemittanceFxEntries(input, [group]);
  assert.equal(entry?.documentType, "elimination");
  assert.equal(entry?.postingLevel, "20");
  assert.match(entry?.description ?? "", /持股比例不阻断/);
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["paidInCapital", 500, 0],
    ["capitalReserve", 260, 0],
    ["longTermInvest", 0, 700],
    ["otherComprehensiveIncome", 0, 60],
  ]);
});
