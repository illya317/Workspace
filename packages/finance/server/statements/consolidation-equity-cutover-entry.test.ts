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
