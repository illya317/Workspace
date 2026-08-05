import assert from "node:assert/strict";
import test from "node:test";

import type { ConsolidationBatchSnapshot } from "@workspace/finance/types";

import { buildNonControllingInterestEntries } from "./consolidation-nci-entries";
import { buildConsolidationPreviewPackage } from "./consolidation-replay";
import { translateSourceLines } from "./consolidated-output-translation";

const groupAccounts = {
  balanceSheet: { groupAccountId: 2275, accountCode: "410401" },
  incomeStatement: { groupAccountId: 2127, accountCode: "4103" },
};

function batch(input: {
  shareRatio?: number;
  currency?: "CNY" | "CAD";
  currentRate?: number;
  comparativeRate?: number;
} = {}) {
  const shareRatio = input.shareRatio ?? 0.75;
  const currency = input.currency ?? "CNY";
  return {
    year: 2026,
    month: 12,
    entities: [{
      id: 1, companyId: 11, companyCode: "P01", companyName: "母公司", role: "parent",
      directParentCompanyId: null, shareRatio: 1, isConsolidated: true, functionalCurrency: "CNY",
    }, {
      id: 2, companyId: 22, companyCode: "S01", companyName: "子公司", role: "subsidiary",
      directParentCompanyId: 11, shareRatio, isConsolidated: true, functionalCurrency: currency,
    }],
    sources: [{
      entitySnapshotId: 2,
      reportType: "balanceSheet",
      reportPayload: { payload: { assets: [{
        lineCode: "totalCurrentAssets", label: "流动资产合计", section: "currentAssets", side: "debit",
        amount: 0, previousAmount: 0, isTotal: true,
      }, {
        lineCode: "totalAssets", label: "资产总计", section: "assets", side: "debit",
        amount: 0, previousAmount: 0, isGrandTotal: true,
      }], liabilities: [{
        lineCode: "payables", label: "应付款项", section: "currentLiabilities", side: "credit",
        amount: 400, previousAmount: 300,
      }, {
        lineCode: "totalCurrentLiabilities", label: "流动负债合计", section: "currentLiabilities", side: "credit",
        amount: 400, previousAmount: 300, isTotal: true,
      }, {
        lineCode: "totalLiabilities", label: "负债合计", section: "liabilities", side: "credit",
        amount: 400, previousAmount: 300, isGrandTotal: true,
      }], equity: [
        {
          lineCode: "paidInCapital", label: "实收资本", section: "equity", side: "credit",
          amount: currency === "CNY" ? 100 : 0, previousAmount: currency === "CNY" ? 75 : 0,
        },
        {
          lineCode: "undistributedProfit", label: "未分配利润", section: "equity", side: "credit",
          amount: currency === "CNY" ? -500 : -400, previousAmount: currency === "CNY" ? -375 : -300,
        },
        {
          lineCode: "otherComprehensiveIncome", label: "其他综合收益", section: "equity", side: "credit",
          amount: 0, previousAmount: 0,
        },
        {
          lineCode: "nonControllingInterests", label: "少数股东权益", section: "equity", side: "credit",
          amount: 0, previousAmount: 0,
        },
        {
          lineCode: "totalEquity", label: "所有者权益合计", section: "equity", side: "credit",
          amount: -400, previousAmount: -300, isTotal: true,
        },
      ] } },
    }, {
      entitySnapshotId: 2,
      reportType: "incomeStatement",
      reportPayload: {
        translationFacts: { monthlyFlows: {
            current: currency === "CAD" ? [{ periodEnd: "2026-12-31", lines: [
              { lineCode: "revenue", amount: -80 }, { lineCode: "netProfit", amount: -80 },
            ] }] : [{ periodEnd: "2026-01-31", lines: [
              { lineCode: "revenue", amount: -60 }, { lineCode: "netProfit", amount: -60 },
            ] }, { periodEnd: "2026-12-31", lines: [
              { lineCode: "revenue", amount: -20 }, { lineCode: "netProfit", amount: -20 },
            ] }],
            comparative: [{ periodEnd: "2025-12-31", lines: [
              { lineCode: "revenue", amount: -60 }, { lineCode: "netProfit", amount: -60 },
            ] }],
          } },
        payload: { lines: [{
          lineCode: "revenue", label: "营业收入", section: "operating", side: "credit",
          amount: -80, currentMonthAmount: -20, previousAmount: -60,
        }, {
          lineCode: "netProfit", label: "净利润", section: "profit", side: "credit",
          amount: -80, currentMonthAmount: -20, previousAmount: -60, isGrandTotal: true,
        }] },
      },
    }],
    exchangeRates: currency === "CNY" ? [] : [{
      id: 10, baseCurrency: "CAD", quoteCurrency: "CNY", rateKind: "closing", rate: input.currentRate ?? 5,
      applications: [{ applicationType: "closing", periodBasis: "current", entitySnapshotId: 2 }],
    }, {
      id: 11, baseCurrency: "CAD", quoteCurrency: "CNY", rateKind: "closing", rate: input.comparativeRate ?? 4,
      applications: [{ applicationType: "closing", periodBasis: "comparative", entitySnapshotId: 2 }],
    }, {
      id: 12, baseCurrency: "CAD", quoteCurrency: "CNY", rateKind: "monthlyAverage", rate: input.currentRate ?? 5,
      applications: [{ applicationType: "flowAverage", periodBasis: "current", entitySnapshotId: 2, targetDate: "2026-12-31" }],
    }, {
      id: 13, baseCurrency: "CAD", quoteCurrency: "CNY", rateKind: "monthlyAverage", rate: input.comparativeRate ?? 4,
      applications: [{ applicationType: "flowAverage", periodBasis: "comparative", entitySnapshotId: 2, targetDate: "2025-12-31" }],
    }],
    entries: [],
    controlDecisions: [],
    events: [],
  } as unknown as ConsolidationBatchSnapshot;
}

test("generates one minority-profit entry per natural month without a cumulative catch-up entry", () => {
  const result = buildNonControllingInterestEntries(batch(), groupAccounts);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  assert.equal(result.data.length, 3);
  assert.ok(result.data.every((entry) => entry.entryType === "nonControllingInterest"));
  assert.deepEqual(result.data.flatMap((entry) => entry.lines).map((line) => [
    line.statementType, line.periodBasis, line.lineCode, line.debit, line.credit,
  ]), [
    ["incomeStatement", "current", "netProfitAttributableToNci", 15, 0],
    ["incomeStatement", "current", "netProfitAttributableToParent", 0, 15],
    ["balanceSheet", "current", "nonControllingInterests", 15, 0],
    ["balanceSheet", "current", "undistributedProfit", 0, 15],
    ["incomeStatement", "current", "netProfitAttributableToNci", 5, 0],
    ["incomeStatement", "current", "netProfitAttributableToParent", 0, 5],
    ["balanceSheet", "current", "nonControllingInterests", 5, 0],
    ["balanceSheet", "current", "undistributedProfit", 0, 5],
    ["incomeStatement", "comparative", "netProfitAttributableToNci", 15, 0],
    ["incomeStatement", "comparative", "netProfitAttributableToParent", 0, 15],
  ]);
  assert.deepEqual(result.data.flatMap((entry) => entry.lines).map((line) => [line.groupAccountId, line.accountCode]), [
    [2127, "4103"],
    [2127, "4103"],
    [2275, "410401"],
    [2275, "410401"],
    [2127, "4103"],
    [2127, "4103"],
    [2275, "410401"],
    [2275, "410401"],
    [2127, "4103"],
    [2127, "4103"],
  ]);
  assert.deepEqual(result.data.map((entry) => [entry.generationKey, entry.postingDate]), [
    ["policy:nci:11:22:profit:2026-01", "2026-01-31"],
    ["policy:nci:11:22:profit:2026-12", "2026-12-31"],
    ["policy:nci:11:22:profit:comparative:2025-12", "2025-12-31"],
  ]);
  assert.equal(result.data.some((entry) => entry.generationKey.includes("prior-months")), false);
});

test("uses translated equity and monthly-average profit for a CAD subsidiary", () => {
  const input = batch({ currency: "CAD" });
  const replay = buildConsolidationPreviewPackage(input);
  const balanceSource = replay.sources.find((source) => source.entitySnapshotId === 2 && source.reportType === "balanceSheet")!;
  const balancePayload = balanceSource.reportPayload as { payload: { assets: unknown[]; liabilities: unknown[]; equity: unknown[] } };
  const translatedBalance = translateSourceLines(
    replay,
    2,
    "CAD",
    "balanceSheet",
    balanceSource.reportPayload,
    [...balancePayload.payload.assets, ...balancePayload.payload.liabilities, ...balancePayload.payload.equity],
  );
  assert.equal(translatedBalance.ok, true, translatedBalance.ok ? undefined : JSON.stringify(translatedBalance.issue));
  if (!translatedBalance.ok) return;
  assert.equal(
    translatedBalance.data.find((line) => line.lineCode === "totalEquity")?.amount,
    -2_000,
    JSON.stringify(translatedBalance.data.map((line) => [line.lineCode, line.amount, line.section, line.isTotal, line.isGrandTotal])),
  );
  const result = buildNonControllingInterestEntries(input, groupAccounts);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const lines = result.data.flatMap((entry) => entry.lines);
  assert.deepEqual(lines.filter((line) => line.lineCode === "netProfitAttributableToNci")
    .map((line) => [line.periodBasis, line.debit, line.credit]), [
    ["current", 100, 0],
    ["comparative", 60, 0],
  ]);
});

test("reproduces the Canadian subsidiary monthly-average profit attribution without an equity plug", () => {
  const input = batch();
  const balanceSource = input.sources.find((source) => source.entitySnapshotId === 2 && source.reportType === "balanceSheet")!;
  const balancePayload = balanceSource.reportPayload as { payload: { equity: Array<Record<string, unknown>> } };
  balancePayload.payload.equity = [
    { lineCode: "paidInCapital", label: "实收资本", section: "equity", side: "credit", amount: 505_060, previousAmount: 505_060 },
    { lineCode: "capitalReserve", label: "资本公积", section: "equity", side: "credit", amount: 5_978_910.03, previousAmount: 5_818_290.84 },
    { lineCode: "otherComprehensiveIncome", label: "其他综合收益", section: "equity", side: "credit", amount: 18_240.65, previousAmount: -154_959.80 },
    { lineCode: "undistributedProfit", label: "未分配利润", section: "equity", side: "credit", amount: -8_569_397.02, previousAmount: -7_736_020.76 },
    { lineCode: "nonControllingInterests", label: "少数股东权益", section: "equity", side: "credit", amount: 0, previousAmount: 0 },
    { lineCode: "totalEquity", label: "所有者权益合计", section: "equity", side: "credit", amount: -2_067_186.34, previousAmount: -1_567_629.72, isTotal: true },
  ];
  const incomeSource = input.sources.find((source) => source.entitySnapshotId === 2 && source.reportType === "incomeStatement")!;
  const incomePayload = incomeSource.reportPayload as { payload: { lines: Array<Record<string, unknown>> } };
  incomePayload.payload.lines = [
    { lineCode: "revenue", label: "营业收入", section: "operating", side: "credit", amount: -833_376.26, currentMonthAmount: -155_071.56, previousAmount: 0 },
    { lineCode: "netProfit", label: "净利润", section: "profit", side: "credit", amount: -833_376.26, currentMonthAmount: -155_071.56, previousAmount: 0, isGrandTotal: true },
  ];
  (incomeSource.reportPayload as { translationFacts: { monthlyFlows: { current: unknown[] } } }).translationFacts.monthlyFlows.current = [{
    periodEnd: "2026-12-31",
    lines: [{ lineCode: "netProfit", amount: -833_376.26 }],
  }];

  const result = buildNonControllingInterestEntries(input, groupAccounts);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const current = result.data.flatMap((entry) => entry.lines).filter((line) => line.periodBasis === "current");
  assert.deepEqual(current.filter((line) => line.statementType === "balanceSheet").map((line) => [line.lineCode, line.debit, line.credit]), [
    ["nonControllingInterests", 208_344.07, 0],
    ["undistributedProfit", 0, 208_344.07],
    ["otherComprehensiveIncome", 43_300.11, 0],
    ["nonControllingInterests", 0, 43_300.11],
  ]);
  assert.equal(current.filter((line) => line.lineCode === "netProfitAttributableToNci")
    .reduce((sum, line) => sum + line.debit - line.credit, 0), 208_344.07);
  assert.deepEqual(result.data.filter((entry) => entry.generationKey.includes(":oci:"))
    .map((entry) => [entry.generationKey, entry.postingDate]), [
      ["policy:nci:11:22:oci:2026-12", "2026-12-31"],
    ]);
});

test("uses the locked prior month OCI as the next month's movement base", () => {
  const input = batch();
  const balanceSource = input.sources.find((source) => source.entitySnapshotId === 2 && source.reportType === "balanceSheet")!;
  const balancePayload = balanceSource.reportPayload as { payload: { equity: Array<Record<string, unknown>> } };
  const oci = balancePayload.payload.equity.find((line) => line.lineCode === "otherComprehensiveIncome")!;
  oci.amount = 130;
  oci.previousAmount = 40;
  input.priorReferences = {
    monthOpening: {
      batchId: 9,
      year: 2026,
      month: 11,
      companies: { 22: { balanceSheet: [{ lineCode: "otherComprehensiveIncome", cnyAmount: 100 }] } },
    },
  };
  const result = buildNonControllingInterestEntries(input, groupAccounts);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const ociEntry = result.data.find((entry) => entry.generationKey === "policy:nci:11:22:oci:2026-12");
  assert.match(ociEntry?.description ?? "", /上月已锁定/);
  assert.deepEqual(ociEntry?.lines.map((line) => [line.lineCode, line.debit, line.credit]), [
    ["otherComprehensiveIncome", 7.5, 0],
    ["nonControllingInterests", 0, 7.5],
  ]);
});

test("allocates the cumulative rounding difference to the last natural month", () => {
  const input = batch();
  const incomeSource = input.sources.find((source) => source.entitySnapshotId === 2 && source.reportType === "incomeStatement")!;
  (incomeSource.reportPayload as { translationFacts: { monthlyFlows: { current: unknown[] } } })
    .translationFacts.monthlyFlows.current = [{
      periodEnd: "2026-01-31", lines: [{ lineCode: "netProfit", amount: -0.06 }],
    }, {
      periodEnd: "2026-12-31", lines: [{ lineCode: "netProfit", amount: -0.06 }],
    }];
  const incomePayload = incomeSource.reportPayload as { payload: { lines: Array<Record<string, unknown>> } };
  incomePayload.payload.lines.find((line) => line.lineCode === "netProfit")!.amount = -0.12;
  const result = buildNonControllingInterestEntries(input, groupAccounts);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.issue));
  if (!result.ok) return;
  const currentNci = result.data.flatMap((entry) => entry.lines).filter((line) => (
    line.periodBasis === "current" && line.lineCode === "netProfitAttributableToNci"
  ));
  assert.deepEqual(currentNci.map((line) => [line.debit, line.credit]), [[0.02, 0], [0.01, 0]]);
  assert.equal(currentNci.reduce((sum, line) => sum + line.debit - line.credit, 0), 0.03);
  assert.match(result.data.find((entry) => entry.generationKey.endsWith("profit:2026-12"))?.evidence ?? "", /累计舍入调整 0\.01/);
});

test("does not generate an allocation for a wholly owned subsidiary", () => {
  const result = buildNonControllingInterestEntries(batch({ shareRatio: 1 }), groupAccounts);
  assert.deepEqual(result, { ok: true, data: [] });
});

test("requires the monthly average rate for each foreign-currency profit entry", () => {
  const input = batch({ currency: "CAD" });
  input.exchangeRates = input.exchangeRates.filter((rate) => rate.rateKind !== "monthlyAverage");
  const result = buildNonControllingInterestEntries(input, groupAccounts);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issue.field, "rateApplications");
});
