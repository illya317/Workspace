import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidatedStatementOutput, ConsolidationEntrySnapshot } from "@workspace/finance/types";

import { buildConsolidatedEquityChanges, buildNciEquityWorkpaper } from "./consolidation-nci-rollforward";
import type { ConsolidationReplayPackage } from "./consolidation-replay";

function entry(input: {
  id: number;
  key: string;
  date: string;
  amount: number;
  source: string;
}): ConsolidationEntrySnapshot {
  return {
    id: input.id,
    entryNo: `合-${input.id}`,
    postingDate: input.date,
    entryType: input.key.includes("remittance") ? "investmentEquity" : "nonControllingInterest",
    generationKey: input.key,
    evidence: `证据-${input.id}`,
    lines: [{
      id: input.id * 10,
      lineNo: 1,
      entitySnapshotId: 2,
      companyId: 22,
      companyCode: "S01",
      statementType: "balanceSheet",
      lineCode: "nonControllingInterests",
      accountCode: "410401",
      debit: input.amount < 0 ? Math.abs(input.amount) : 0,
      credit: input.amount > 0 ? input.amount : 0,
      currencyCode: "CNY",
      periodBasis: "current",
      note: null,
      sourceKind: "workpaper",
      sourceId: input.source,
    }],
  } as ConsolidationEntrySnapshot;
}

function outputLine(lineCode: string, amount: number, previousAmount: number) {
  return {
    lineCode,
    label: lineCode,
    code: null,
    amount,
    previousAmount,
    section: lineCode.startsWith("netProfit") ? "profit" : "equity",
    side: "credit" as const,
    direction: null,
    subtract: false,
    isHeader: false,
    isTotal: false,
    isGrandTotal: false,
    sourceAmount: amount,
    adjustmentAmount: 0,
  };
}

test("rolls NCI forward from typed dated entries and keeps net-assets multiplication as a cross-check", () => {
  const entries = [
    entry({ id: 1, key: "policy:remittance-fx:historical-capital:11:22", date: "2026-01-02", amount: 25, source: "policy:remittance:nci:contribution" }),
    entry({ id: 2, key: "policy:nci:11:22:profit:2026-01", date: "2026-01-31", amount: 10, source: "policy:nci:profit:2026-01:equity-movement" }),
    entry({ id: 3, key: "policy:nci:11:22:oci:2026-01", date: "2026-01-31", amount: 5, source: "policy:nci:oci:2026-01:equity-movement" }),
    entry({ id: 4, key: "policy:nci:11:22:distribution:2026-02", date: "2026-02-28", amount: -3, source: "policy:nci:distribution:2026-02:equity-movement" }),
  ];
  const replay = {
    entities: [
      { id: 1, companyId: 11, companyCode: "P01", companyName: "母公司", role: "parent", shareRatio: 1 },
      { id: 2, companyId: 22, companyCode: "S01", companyName: "子公司", role: "subsidiary", shareRatio: 0.75 },
    ],
    approvedEntries: entries,
  } as ConsolidationReplayPackage;
  const balance: ConsolidatedStatementOutput = {
    reportType: "balanceSheet",
    label: "合并资产负债表",
    totals: {},
    lines: [
      outputLine("nonControllingInterests", 137, 100),
      {
        ...outputLine("totalEquity", 548, 400),
        entityAmounts: [{ entitySnapshotId: 2, companyCode: "S01", companyName: "子公司", role: "subsidiary", amount: 548, previousAmount: 400 }],
      },
      outputLine("paidInCapital", 100, 75),
      outputLine("otherEquityInstruments", 0, 0),
      outputLine("capitalReserve", 200, 200),
      outputLine("treasuryStock", 0, 0),
      outputLine("otherComprehensiveIncome", 20, 15),
      outputLine("surplusReserve", 30, 30),
      outputLine("undistributedProfit", 61, 80),
    ],
  };
  const income: ConsolidatedStatementOutput = {
    reportType: "incomeStatement",
    label: "合并利润表",
    totals: {},
    lines: [outputLine("netProfitAttributableToParent", 20, 0), outputLine("netProfitAttributableToNci", 10, 0)],
  };
  const workpaper = buildNciEquityWorkpaper(replay, [balance, income]);
  assert.deepEqual({
    opening: workpaper.openingBalance,
    contribution: workpaper.contributions,
    profit: workpaper.profitLoss,
    oci: workpaper.otherComprehensiveIncome,
    distribution: workpaper.distributions,
    closing: workpaper.calculatedClosingBalance,
    reported: workpaper.reportedClosingBalance,
    crossCheck: workpaper.netAssetsCrossCheck,
    status: workpaper.status,
  }, {
    opening: 100,
    contribution: 25,
    profit: 10,
    oci: 5,
    distribution: -3,
    closing: 137,
    reported: 137,
    crossCheck: 137,
    status: "reconciled",
  });
  const equityChanges = buildConsolidatedEquityChanges([balance, income], workpaper);
  assert.equal(equityChanges.rows.at(-1)?.nonControllingInterests, 137);
  assert.equal(equityChanges.rows.find((row) => row.key === "profitLoss")?.nonControllingInterests, 10);
});

test("does not classify a closing-balance difference into retained earnings or other adjustments", () => {
  const replay = {
    entities: [{ id: 1, companyId: 11, companyCode: "P01", companyName: "母公司", role: "parent", shareRatio: 1 }],
    approvedEntries: [],
    priorReferences: {
      yearOpening: {
        groupStatements: {
          balanceSheet: [outputLine("nonControllingInterests", 100, 0)],
        },
      },
    },
  } as unknown as ConsolidationReplayPackage;
  const balance: ConsolidatedStatementOutput = {
    reportType: "balanceSheet",
    label: "合并资产负债表",
    totals: {},
    lines: [outputLine("nonControllingInterests", 120, 100)],
  };
  const workpaper = buildNciEquityWorkpaper(replay, [balance]);
  assert.equal(workpaper.otherAdjustments, 0);
  assert.equal(workpaper.calculatedClosingBalance, 100);
  assert.equal(workpaper.rollforwardDifference, 20);
  assert.equal(workpaper.status, "difference");
});
