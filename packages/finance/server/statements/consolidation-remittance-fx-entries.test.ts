import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";

import { buildRemittanceFxEntries } from "./consolidation-remittance-fx-entries";

function batch(
  rate: number,
  bookedAmountCny: number,
  matchingLineCode?: "paidInCapital" | "capitalReserve",
): ConsolidationBatchSnapshot {
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
          matchingLineCode,
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

test("voucher matching can bind an investment directly to paid-in capital", () => {
  const [entry] = buildRemittanceFxEntries(batch(5.05056, 505.056, "paidInCapital"));
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.accountCode, line.debit, line.credit]), [
    ["paidInCapital", "3001", 505.06, 0],
    ["longTermInvest", "1511", 0, 505.06],
  ]);
});

test("positive remittance difference is OCI on the credit side", () => {
  const [entry] = buildRemittanceFxEntries(batch(5.2, 500));
  assert.equal(entry?.matchDifference, 20);
  assert.match(entry?.differenceResolution ?? "", /收益/);
  assert.equal(entry?.lines[2]?.credit, 20);
});

test("voucher-level capital reserve can coexist with historical paid-in capital without duplicate investment elimination", () => {
  const input = batch(5, 520);
  input.entities[1]!.functionalCurrency = "CAD";
  input.entities[1]!.directParentCompanyId = 11;
  input.sources = [{
    entitySnapshotId: 2,
    reportType: "balanceSheet",
    reportPayload: { payload: { equity: [{ lineCode: "paidInCapital", amount: 100 }] } },
  }] as never;
  input.exchangeRates.push({
    id: 8,
    exchangeRateId: 80,
    exchangeRateVersion: 1,
    baseCurrency: "CAD",
    quoteCurrency: "CNY",
    rateKind: "historicalCapitalAmount",
    rateDate: "2020-01-01",
    rate: 5.05,
    sourceUrl: "https://example.test/paid-in",
    publishedAt: null,
    recordedBy: 9,
    recordedAt: "2025-03-14T08:00:00.000Z",
    applications: [{
      applicationType: "historicalCapital",
      periodBasis: "current",
      entitySnapshotId: 2,
      voucherItemId: null,
      targetDate: "2020-01-01",
      evidence: "paid in opening",
      capitalOriginalAmount: 100,
      capitalHistoricalAmountCny: 505,
      capitalEvidenceKind: "openingBalance",
      capitalEvidenceDate: "2020-01-01",
      capitalContributionDate: null,
      capitalLineCode: "paidInCapital",
      voucher: null,
    }],
  });
  const fact = (itemId: number, signedAmount: number) => ({
    itemId, voucherId: itemId + 100, voucherNo: `记-${itemId}`, voucherDate: "2025-03-14",
    companyId: 11, counterpartyCompanyId: 22, accountCode: "1511", accountName: "长期股权投资",
    description: "加拿大投资", lineCode: "longTermInvest", signedAmount, currencyCode: "CNY",
    sourceFingerprint: `voucher-${itemId}`, investmentRole: "investment" as const,
  });
  const group = {
    category: "investmentEquity", generationKey: "investmentEquity:relationship:11:22", status: "unresolved",
    leftCompanyId: 11, rightCompanyId: 22, leftFacts: [fact(101, 520), fact(102, 505)], rightFacts: [],
    leftNetAmount: 1025, rightNetAmount: 0, matchedAmount: 0, differenceAmount: 0,
    matchingRule: "fixture", matchingVersion: "fixture-v1", differenceResolution: null,
    comparisonCurrencyCode: null, requiredActions: ["translateToCny"], ownershipShareRatio: 1,
  } satisfies ConsolidationVoucherMatchGroup;

  const entries = buildRemittanceFxEntries(input, [group]);
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.map((entry) => entry.lines.filter((line) => line.lineCode === "longTermInvest").map((line) => line.sourceVoucherItemId)), [[101], [102]]);
  assert.deepEqual(entries.flatMap((entry) => entry.lines.filter((line) => line.lineCode === "capitalReserve").map((line) => line.debit)), [500]);
  assert.deepEqual(entries.flatMap((entry) => entry.lines.filter((line) => line.lineCode === "paidInCapital").map((line) => line.debit)), [505]);
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
      rateKind: "historicalCapitalAmount",
      rateDate: "2025-03-14",
      rate: 5.0506,
      sourceUrl: "https://example.test/rate-1",
      applications: [{
        applicationType: "historicalCapital",
        periodBasis: "current",
        entitySnapshotId: 2,
        voucherItemId: null,
        targetDate: "2025-03-14",
        evidence: "实收资本",
        capitalOriginalAmount: 100,
        capitalHistoricalAmountCny: 505.06,
        capitalEvidenceKind: "openingBalance",
        capitalEvidenceDate: "2025-03-14",
        capitalContributionDate: null,
        capitalLineCode: "paidInCapital",
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
  assert.match(entry?.lines[0]?.note ?? "", /历史折算人民币金额；加权汇率 5.0506/);
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["paidInCapital", 505.06, 0],
    ["capitalReserve", 260, 0],
    ["longTermInvest", 0, 700],
    ["otherComprehensiveIncome", 0, 65.06],
  ]);
});
