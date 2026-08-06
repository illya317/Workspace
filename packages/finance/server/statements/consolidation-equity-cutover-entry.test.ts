import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";
import type { ConsolidationVoucherMatchGroup } from "../domain/consolidation-entry-generation";
import { equityMoney } from "./consolidation-equity-continuity-ledger";
import { buildRemittanceFxEntryPackage } from "./consolidation-remittance-fx-entries";

test("the July operating batch consumes the certified June checkpoint once", () => {
  const baseline = {
    key: "canada-2026-06-cutover",
    foreignCompanyCode: "05",
    baselineDate: "2026-06-30",
    parentCompanyCode: "02",
    parentLongTermInvestmentAmount: 6_054_250.60,
    presentationCurrencyCode: "CNY",
    equityComponents: [
      { lineCode: "paidInCapital", amount: 505_060 },
      { lineCode: "capitalReserve", amount: 5_978_910.05 },
      { lineCode: "otherComprehensiveIncome", amount: 18_240.65 },
      { lineCode: "undistributedProfit", amount: -8_569_397.02 },
    ],
    historicalDifferenceLineCode: "capitalReserve",
    evidence: "2026-06-30 certified consolidation migration checkpoint",
  };
  const batch = {
    year: 2026,
    month: 7,
    entities: [
      { id: 1, companyId: 11, companyCode: "02", companyName: "母公司", functionalCurrency: "CNY", role: "parent", shareRatio: 1 },
      { id: 2, companyId: 22, companyCode: "05", companyName: "加拿大子公司", functionalCurrency: "CAD", role: "subsidiary", shareRatio: 0.75 },
    ],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: {
        translationFacts: { consolidationCutoverBaseline: baseline },
        payload: { assets: [], liabilities: [], equity: [] },
      },
    }],
    exchangeRates: [], entries: [], controlDecisions: [], events: [],
  } as unknown as ConsolidationBatchSnapshot;
  const group = {
    category: "investmentEquity",
    generationKey: "investmentEquity:relationship:11:22",
    status: "unresolved",
    leftCompanyId: 11,
    rightCompanyId: 22,
    leftFacts: [],
    rightFacts: [],
    leftNetAmount: 0,
    rightNetAmount: 0,
    matchedAmount: 0,
    differenceAmount: 0,
    matchingRule: "direct ownership",
    matchingVersion: "fixture-v1",
    differenceResolution: null,
    comparisonCurrencyCode: "CNY",
    requiredActions: ["allocateNonControllingInterest"],
    ownershipShareRatio: 0.75,
  } satisfies ConsolidationVoucherMatchGroup;

  const result = buildRemittanceFxEntryPackage(batch, [group]);
  assert.equal(result.issues.length, 0);
  assert.equal(result.entries.length, 1);
  const entry = result.entries[0]!;
  assert.equal(entry.postingDate, "2026-07-01");
  assert.equal(entry.matchDifference, 0);
  assert.equal(equityMoney(entry.lines.reduce((sum, line) => sum + line.debit - line.credit, 0)), 0);
  const line = (sourceId: string) => entry.lines.find((item) => item.sourceId.endsWith(sourceId));
  assert.deepEqual([
    line(":cutover:parent-investment")?.debit,
    line(":cutover:parent-investment")?.credit,
  ], [0, 6_054_250.60]);
  assert.deepEqual([
    line(":cutover:historical-difference")?.debit,
    line(":cutover:historical-difference")?.credit,
  ], [1_191_273.06, 0]);
  const nci = equityMoney(entry.lines.filter((item) => item.lineCode === "nonControllingInterests")
    .reduce((sum, item) => sum + item.credit - item.debit, 0));
  assert.equal(nci, -516_796.59);
});

test("the June migration batch expands opening investment facts and the certified adjustment", () => {
  const baseline = {
    key: "canada-2025-12-opening",
    foreignCompanyCode: "05",
    baselineDate: "2025-12-31",
    parentCompanyCode: "02",
    parentLongTermInvestmentAmount: 5_876_692.60,
    presentationCurrencyCode: "CNY",
    equityComponents: [
      { lineCode: "paidInCapital", amount: 505_060 },
      { lineCode: "capitalReserve", amount: 5_806_818.04 },
      { lineCode: "otherComprehensiveIncome", amount: -154_959.80 },
      { lineCode: "undistributedProfit", amount: -7_736_020.76 },
    ],
    amountExplanations: [{
      key: "canada-parent-investment-fx-adjustment",
      classification: "parentInvestmentOpeningAdjustment",
      targetAmount: "-12124.40",
      outputFingerprint: "29f28b97a14d25e27c71ee92bb680027cbb0311da198b6767cb973d12aa8d8bc",
      evidence: [{
        evidenceId: "ev_voucherLine_79ae3c06fa5fb2088e79451280df4578",
        sourceRecordId: "voucherItem:728035",
        sourceFingerprint: "79ae3c06fa5fb2088e79451280df45785077137c0c4bd1eec777cc03f9c7298d",
        label: "2022-12-记-0098 · 1511 长期股权投资",
      }],
    }],
    historicalDifferenceLineCode: "capitalReserve",
    evidence: "2025-12-31 受控期初",
  };
  const batch = {
    year: 2026,
    month: 6,
    entities: [
      { id: 1, companyId: 9, companyCode: "02", companyName: "母公司", functionalCurrency: "CNY", role: "parent", shareRatio: 1 },
      { id: 2, companyId: 12, companyCode: "05", companyName: "加拿大子公司", functionalCurrency: "CAD", role: "subsidiary", shareRatio: 0.75 },
    ],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: {
        translationFacts: { consolidationCutoverBaseline: baseline },
        payload: { assets: [], liabilities: [], equity: [] },
      },
    }],
    exchangeRates: [], entries: [], controlDecisions: [], events: [],
  } as unknown as ConsolidationBatchSnapshot;
  const fact = (itemId: number, amount: number, voucherNo: string) => ({
    itemId,
    voucherId: itemId - 1,
    voucherNo,
    voucherDate: itemId === 728035 ? "2022-12-30" : "2022-05-01",
    companyId: 9,
    counterpartyCompanyId: 12,
    accountCode: "1511",
    accountName: "长期股权投资",
    description: "加拿大投资",
    lineCode: "longTermInvest",
    signedAmount: amount,
    currencyCode: "CNY",
    sourceFingerprint: `fact-${itemId}`,
    investmentRole: "investment" as const,
  });
  const group = {
    category: "investmentEquity",
    generationKey: "investmentEquity:relationship:9:12",
    status: "unresolved",
    leftCompanyId: 9,
    rightCompanyId: 12,
    leftFacts: [
      fact(726383, 5_888_817.00, "2022-05-记-0001"),
      fact(728035, -12_124.40, "2022-12-记-0098"),
    ],
    rightFacts: [],
    leftNetAmount: 5_876_692.60,
    rightNetAmount: 0,
    matchedAmount: 0,
    differenceAmount: 0,
    matchingRule: "direct ownership",
    matchingVersion: "fixture-v1",
    differenceResolution: null,
    comparisonCurrencyCode: "CNY",
    requiredActions: ["allocateNonControllingInterest"],
    ownershipShareRatio: 0.75,
  } satisfies ConsolidationVoucherMatchGroup;

  const result = buildRemittanceFxEntryPackage(batch, [group]);
  assert.equal(result.issues.length, 0);
  const entry = result.entries[0]!;
  assert.equal(entry.postingDate, "2026-01-01");
  assert.equal(entry.matchDifference, 0);
  assert.equal(equityMoney(entry.lines.reduce((sum, line) => sum + line.debit - line.credit, 0)), 0);
  const adjustment = entry.lines.find((line) => line.sourceVoucherItemId === 728035);
  assert.deepEqual([adjustment?.debit, adjustment?.credit], [12_124.40, 0]);
  assert.match(adjustment?.note ?? "", /金额引擎精确命中 -12124\.40/);
  const investmentNet = equityMoney(entry.lines.filter((line) => line.lineCode === "longTermInvest")
    .reduce((sum, line) => sum + line.credit - line.debit, 0));
  assert.equal(investmentNet, 5_876_692.60);
  const nci = equityMoney(entry.lines.filter((line) => line.lineCode === "nonControllingInterests")
    .reduce((sum, line) => sum + line.credit - line.debit, 0));
  assert.equal(nci, -394_775.63);
});
