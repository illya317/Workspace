import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";

import {
  buildRemittanceFxEntries,
  buildRemittanceFxEntryPackage,
} from "./consolidation-remittance-fx-entries";
import { consolidationMatchGroupCoveredByPolicy } from "./consolidation-automatic-control-decisions";

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

test("negative remittance difference stays unclassified and blocks voucher generation", () => {
  const [entry] = buildRemittanceFxEntries(batch(5, 520));
  assert.equal(entry?.matchDifference, 20);
  assert.match(entry?.differenceResolution ?? "", /待分类/);
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["capitalReserve", 500, 0],
    ["longTermInvest", 0, 520],
  ]);
  const generated = buildRemittanceFxEntryPackage(batch(5, 520));
  assert.equal(generated.entries.length, 0);
  assert.equal(generated.issues[0]?.differenceAmount, 20);
});

test("voucher matching can bind an investment directly to paid-in capital", () => {
  const [entry] = buildRemittanceFxEntries(batch(5.05056, 505.056, "paidInCapital"));
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.accountCode, line.debit, line.credit]), [
    ["paidInCapital", "3001", 505.06, 0],
    ["longTermInvest", "1511", 0, 505.06],
  ]);
});

test("positive remittance difference stays unclassified and blocks voucher generation", () => {
  const [entry] = buildRemittanceFxEntries(batch(5.2, 500));
  assert.equal(entry?.matchDifference, 20);
  assert.match(entry?.differenceResolution ?? "", /待分类/);
  assert.equal(entry?.lines.some((line) => line.lineCode === "otherComprehensiveIncome"), false);
  const generated = buildRemittanceFxEntryPackage(batch(5.2, 500));
  assert.equal(generated.entries.length, 0);
  assert.equal(generated.issues[0]?.differenceAmount, 20);
});

test("CNY partial ownership produces one complete investment, capital, and NCI voucher", () => {
  const input = {
    entities: [
      { id: 1, companyId: 11, companyCode: "P01", companyName: "投资方", functionalCurrency: "CNY" },
      { id: 2, companyId: 22, companyCode: "S01", companyName: "子公司", functionalCurrency: "CNY", shareRatio: 0.75 },
    ],
    sources: [], exchangeRates: [], entries: [], controlDecisions: [], events: [],
  } as unknown as ConsolidationBatchSnapshot;
  const fact = (itemId: number, companyId: number, signedAmount: number, investmentRole: "investment" | "equity") => ({
    itemId, voucherId: itemId, voucherNo: `记-${itemId}`, voucherDate: "2026-01-01", companyId,
    counterpartyCompanyId: companyId === 11 ? 22 : 11,
    accountCode: investmentRole === "investment" ? "1511" : "3001",
    accountName: investmentRole === "investment" ? "长期股权投资" : "实收资本",
    description: null, lineCode: investmentRole === "investment" ? "longTermInvest" : "paidInCapital",
    signedAmount, currencyCode: "CNY", sourceFingerprint: `source-${itemId}`, investmentRole,
  });
  const group = {
    category: "investmentEquity", generationKey: "investmentEquity:relationship:11:22", status: "unresolved",
    leftCompanyId: 11, rightCompanyId: 22, leftFacts: [fact(1, 11, 75, "investment")],
    rightFacts: [fact(2, 22, -100, "equity")], leftNetAmount: 75, rightNetAmount: -100,
    matchedAmount: 0, differenceAmount: 0, matchingRule: "直接持股关系", matchingVersion: "fixture-v1",
    differenceResolution: null, comparisonCurrencyCode: "CNY", requiredActions: ["allocateNonControllingInterest"],
    ownershipShareRatio: 0.75,
  } satisfies ConsolidationVoucherMatchGroup;
  const [entry] = buildRemittanceFxEntries(input, [group]);
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["paidInCapital", 100, 0],
    ["longTermInvest", 0, 75],
    ["nonControllingInterests", 0, 25],
  ]);
  assert.equal(consolidationMatchGroupCoveredByPolicy(group, entry ? [entry] : []), true);
});

test("cutover capital movement accumulates only post-cutover rate applications", () => {
  const input = {
    year: 2026,
    month: 6,
    entities: [
      { id: 1, companyId: 11, companyCode: "P01", companyName: "投资方", functionalCurrency: "CNY", role: "parent", shareRatio: 1 },
      { id: 2, companyId: 22, companyCode: "S01", companyName: "子公司", functionalCurrency: "CNY", role: "subsidiary", shareRatio: 0.75 },
    ],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: {
        translationFacts: { consolidationCutoverBaseline: {
          key: "canada-2025-12-opening",
          baselineDate: "2025-12-31",
          parentCompanyCode: "P01",
          parentLongTermInvestmentAmount: 5_876_692.60,
          equityComponents: [
            { lineCode: "paidInCapital", amount: 505_060 },
            { lineCode: "capitalReserve", amount: 5_806_818.04 },
          ],
          historicalDifferenceLineCode: "capitalReserve",
        } },
        payload: { assets: [], liabilities: [], equity: [
          { lineCode: "paidInCapital", label: "实收资本", section: "equity", side: "credit", amount: 505_060, previousAmount: 505_060 },
          { lineCode: "capitalReserve", label: "资本公积", section: "equity", side: "credit", amount: 5_978_910.03, previousAmount: 5_818_290.84 },
        ] },
      },
    }],
    exchangeRates: [{
      id: 1, exchangeRateId: 101, exchangeRateVersion: 1, baseCurrency: "CAD", quoteCurrency: "CNY",
      rateKind: "centralParity", rateDate: "2026-02-13", rate: 5.0865, sourceUrl: "https://example.test/feb",
      publishedAt: null, recordedBy: 9, recordedAt: "2026-02-14T00:00:00.000Z",
      applications: [{
        applicationType: "historicalInvestment", periodBasis: "current", entitySnapshotId: 2,
        targetDate: "2026-02-14", voucherItemId: 1, capitalContributionDate: "2026-02-14",
        capitalOriginalAmount: null, capitalHistoricalAmountCny: null, capitalLineCode: null,
        voucher: { originalAmount: 19_865.61, matchingLineCode: "capitalReserve" }, evidence: "2月逐笔证据",
      }],
    }, {
      id: 2, exchangeRateId: 102, exchangeRateVersion: 1, baseCurrency: "CAD", quoteCurrency: "CNY",
      rateKind: "centralParity", rateDate: "2026-06-25", rate: 4.7853, sourceUrl: "https://example.test/jun",
      publishedAt: null, recordedBy: 9, recordedAt: "2026-06-26T00:00:00.000Z",
      applications: [{
        applicationType: "historicalInvestment", periodBasis: "current", entitySnapshotId: 2,
        targetDate: "2026-06-25", voucherItemId: 2, capitalContributionDate: "2026-06-25",
        capitalOriginalAmount: null, capitalHistoricalAmountCny: null, capitalLineCode: null,
        voucher: { originalAmount: 14_846.63, matchingLineCode: "capitalReserve" }, evidence: "6月逐笔证据",
      }],
    }], entries: [], controlDecisions: [], events: [],
  } as unknown as ConsolidationBatchSnapshot;
  const fact = (itemId: number, signedAmount: number) => ({
    itemId, voucherId: itemId + 100, voucherNo: `记-${itemId}`, voucherDate: itemId === 1 ? "2026-02-14" : "2026-06-25",
    companyId: 11, counterpartyCompanyId: 22, accountCode: "1511", accountName: "长期股权投资",
    description: "本期增资", lineCode: "longTermInvest", signedAmount, currencyCode: "CNY",
    sourceFingerprint: `voucher-${itemId}`, investmentRole: "investment" as const,
  });
  const group = {
    category: "investmentEquity", generationKey: "investmentEquity:relationship:11:22", status: "unresolved",
    leftCompanyId: 11, rightCompanyId: 22, leftFacts: [fact(1, 103_929), fact(2, 73_629)], rightFacts: [],
    leftNetAmount: 177_558, rightNetAmount: 0, matchedAmount: 0, differenceAmount: 0,
    matchingRule: "fixture", matchingVersion: "fixture-v1", differenceResolution: null,
    comparisonCurrencyCode: "CNY", requiredActions: ["allocateNonControllingInterest"], ownershipShareRatio: 0.75,
  } satisfies ConsolidationVoucherMatchGroup;
  const movement = buildRemittanceFxEntries(input, [group])
    .find((entry) => entry.generationKey.includes(":capital-movement:"));
  assert.deepEqual(movement?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["capitalReserve", 172_092.01, 0],
    ["longTermInvest", 0, 103_929],
    ["longTermInvest", 0, 73_629],
    ["nonControllingInterests", 0, 43_023],
    ["capitalReserve", 48_488.99, 0],
  ]);
  assert.equal(movement?.matchDifference, 0);
  const generated = buildRemittanceFxEntryPackage(input, [group]);
  assert.equal(generated.entries.some((entry) => entry.generationKey.includes(":capital-movement:")), true);
  assert.equal(generated.issues.some((issue) => issue.generationKey.includes(":capital-movement:")), false);
});

test("voucher-level capital reserve can coexist with historical paid-in capital without duplicate investment elimination", () => {
  const input = batch(5, 520);
  input.entities[1]!.functionalCurrency = "CAD";
  input.entities[1]!.directParentCompanyId = 11;
  input.entities[1]!.shareRatio = 1;
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
  assert.match(entry?.description ?? "", /同一张完整抵销凭证/);
  assert.match(entry?.lines[0]?.note ?? "", /历史折算人民币金额；加权汇率 5.0506/);
  assert.deepEqual(entry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["paidInCapital", 505.06, 0],
    ["capitalReserve", 260, 0],
    ["longTermInvest", 0, 700],
    ["nonControllingInterests", 0, 191.27],
  ]);
  assert.ok(entry?.lines.some((line) => line.sourceId.includes(":nci:contribution:capital")));
  const generated = buildRemittanceFxEntryPackage(input, [group]);
  assert.equal(generated.entries.length, 0);
  assert.equal(generated.issues[0]?.differenceAmount, 126.21);
  assert.equal(consolidationMatchGroupCoveredByPolicy(group, generated.entries), false);

  input.priorReferences = {
    yearOpening: {
      batchId: 9,
      year: 2024,
      month: 12,
      companies: {
        22: {
          balanceSheet: [
            { lineCode: "paidInCapital", cnyAmount: 505.06 },
            { lineCode: "capitalReserve", cnyAmount: 260 },
            { lineCode: "otherComprehensiveIncome", cnyAmount: -100 },
            { lineCode: "undistributedProfit", cnyAmount: -800 },
          ],
        },
      },
    },
  };
  (input.sources[0]!.reportPayload as Record<string, unknown>).translationFacts = {
    retainedEarningsOpening: { openingDate: "2025-12-31" },
  };
  const [continued] = buildRemittanceFxEntries(input, [group]);
  assert.equal(continued?.postingDate, "2026-01-01");
  assert.deepEqual(continued?.lines.filter((line) => ["paidInCapital", "capitalReserve"].includes(line.lineCode))
    .slice(0, 2).map((line) => [line.lineCode, line.debit, line.credit]), [
      ["paidInCapital", 505.06, 0],
      ["capitalReserve", 260, 0],
    ]);
  assert.ok(continued?.lines.some((line) => line.sourceId.includes(":nci:opening:capital")));
  assert.ok(!continued?.lines.some((line) => line.sourceId.includes(":nci:contribution:capital")));
  assert.deepEqual(
    continued?.lines.filter((line) => line.sourceId.includes(":component:opening:"))
      .map((line) => [line.lineCode, line.debit, line.credit]),
    [
      ["paidInCapital", 505.06, 0],
      ["capitalReserve", 260, 0],
      ["otherComprehensiveIncome", 0, 100],
      ["otherComprehensiveIncome", 75, 0],
      ["undistributedProfit", 0, 800],
      ["undistributedProfit", 600, 0],
    ],
  );
  assert.deepEqual(
    continued?.lines.filter((line) => line.sourceId.includes(":nci:opening:") && line.lineCode === "nonControllingInterests")
      .map((line) => [line.debit, line.credit]),
    [[0, 191.27], [25, 0], [200, 0]],
  );
});
