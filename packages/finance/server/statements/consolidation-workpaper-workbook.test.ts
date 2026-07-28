import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";

import type {
  ConsolidatedOutputLine,
  ConsolidatedReportOutputPackage,
  ConsolidatedStatementOutput,
  StatementReportType,
} from "@workspace/finance/types";

import {
  buildConsolidationWorkpaperWorkbook,
  consolidationWorkpaperFilename,
} from "./consolidation-workpaper-workbook";

function line(reportType: StatementReportType): ConsolidatedOutputLine {
  return {
    lineCode: `${reportType}-line`,
    label: `${reportType}项目`,
    code: null,
    amount: reportType === "balanceSheet" ? 105 : reportType === "incomeStatement" ? 113 : 112,
    previousAmount: 90,
    section: "operating",
    side: reportType === "incomeStatement" ? "credit" : "debit",
    direction: null,
    subtract: false,
    isHeader: false,
    isTotal: false,
    isGrandTotal: false,
    sourceAmount: 110,
    adjustmentAmount: reportType === "balanceSheet" ? -5 : reportType === "incomeStatement" ? 3 : 2,
    entityAmounts: [
      { entitySnapshotId: 1, companyCode: "ZX01", companyName: "母公司", role: "parent", amount: 70, previousAmount: 60 },
      { entitySnapshotId: 2, companyCode: "ZX02", companyName: "子公司", role: "subsidiary", amount: 40, previousAmount: 30 },
    ],
  };
}

function statement(reportType: StatementReportType, label: string): ConsolidatedStatementOutput {
  return { reportType, label, lines: [line(reportType)], totals: {} };
}

const report: ConsolidatedReportOutputPackage = {
  batch: {
    id: 7,
    parentCompanyId: 1,
    parentCompanyCode: "ZX01",
    parentCompanyName: "示例/集团",
    year: 2025,
    month: 12,
    periodKind: "month",
    version: 1,
    revision: 1,
    status: "published",
    baseBatchId: null,
    scopeFingerprint: "scope",
    sourceFingerprint: "source",
    rateFingerprint: "rate",
    createdBy: 1,
    submittedBy: 1,
    submittedAt: "2025-12-31T00:00:00.000Z",
    reviewedBy: 1,
    reviewedAt: "2025-12-31T00:00:00.000Z",
    reviewNote: null,
    lockedBy: 1,
    lockedAt: "2025-12-31T00:00:00.000Z",
    publishedBy: 1,
    publishedAt: "2025-12-31T00:00:00.000Z",
  },
  statements: [
    statement("balanceSheet", "资产负债表"),
    statement("incomeStatement", "利润表"),
    statement("cashFlow", "现金流量表"),
  ],
  sourceCount: 3,
  approvedEntryCount: 2,
  generatedAt: "2025-12-31T00:00:00.000Z",
};

test("consolidation workpaper workbook exports the three complete workpaper matrices", () => {
  const workbook = XLSX.read(buildConsolidationWorkpaperWorkbook(report), { type: "buffer", cellNF: true });
  assert.deepEqual(workbook.SheetNames, ["资产负债表底稿", "利润表底稿", "现金流量表底稿"]);

  const balance = workbook.Sheets["资产负债表底稿"]!;
  assert.equal(balance.A1?.v, "合并资产负债表工作底稿");
  assert.equal(balance.A2?.v, "编制单位：示例/集团");
  assert.equal(balance.B3?.v, "ZX01 母公司");
  assert.equal(balance.C3?.v, "ZX02 子公司");
  assert.equal(balance.D3?.v, "个别报表合计");
  assert.equal(balance.E3?.v, "抵销借方");
  assert.equal(balance.F3?.v, "抵销贷方");
  assert.equal(balance.G3?.v, "合并数");
  assert.equal(balance.H3, undefined);
  assert.equal(balance.B4?.v, 70);
  assert.equal(balance.C4?.v, 40);
  assert.equal(balance.D4?.v, 110);
  assert.equal(balance.D4?.f, "ROUND(SUM(B4:C4),2)");
  assert.equal(balance.E4?.v, 0);
  assert.equal(balance.F4?.v, 5);
  assert.equal(balance.G4?.v, 105);
  assert.equal(balance.G4?.f, "ROUND(D4+E4-F4,2)");
  assert.equal(balance.H4, undefined);

  const income = workbook.Sheets["利润表底稿"]!;
  assert.equal(income.E4?.v, 0);
  assert.equal(income.F4?.v, 3);
  assert.equal(income.G4?.f, "ROUND(D4-E4+F4,2)");

  const cashFlow = workbook.Sheets["现金流量表底稿"]!;
  assert.equal(cashFlow.E4?.v, 2);
  assert.equal(cashFlow.F4?.v, 0);
  assert.equal(consolidationWorkpaperFilename(report), "示例_集团-2025.12-合并工作底稿.xlsx");
});

test("profit attribution uses entity net profit without inverse residual literals", () => {
  const netProfit = {
    ...line("incomeStatement"),
    lineCode: "netProfit",
    label: "净利润",
    amount: -100,
    sourceAmount: -100,
    adjustmentAmount: 0,
    entityAmounts: [
      { entitySnapshotId: 1, companyCode: "ZX01", companyName: "母公司", role: "parent" as const, amount: -60, previousAmount: -50 },
      { entitySnapshotId: 2, companyCode: "ZX02", companyName: "子公司", role: "subsidiary" as const, amount: -40, previousAmount: -30 },
    ],
  };
  const parent = {
    ...netProfit,
    lineCode: "netProfitAttributableToParent",
    label: "归属于母公司所有者的净利润",
    amount: -80,
    adjustmentAmount: 20,
    entityAmounts: netProfit.entityAmounts.map((entity) => ({ ...entity, amount: 0 })),
  };
  const nci = {
    ...netProfit,
    lineCode: "netProfitAttributableToNci",
    label: "少数股东损益",
    amount: -20,
    sourceAmount: 0,
    adjustmentAmount: -20,
    entityAmounts: netProfit.entityAmounts.map((entity) => ({ ...entity, amount: 0 })),
  };
  const input: ConsolidatedReportOutputPackage = {
    ...report,
    statements: report.statements.map((candidate) => candidate.reportType === "incomeStatement"
      ? { ...candidate, lines: [netProfit, parent, nci] }
      : candidate),
  };
  const workbook = XLSX.read(buildConsolidationWorkpaperWorkbook(input), { type: "buffer", cellNF: true });
  const income = workbook.Sheets["利润表底稿"]!;
  assert.equal(income.B5?.v, -60);
  assert.equal(income.B5?.f, "ROUND(B4-B6,2)");
  assert.equal(income.C5?.v, -40);
  assert.equal(income.C5?.f, "ROUND(C4-C6,2)");
  assert.equal(income.D5?.v, -100);
  assert.equal(income.D5?.f, "ROUND(SUM(B5:C5),2)");
  assert.equal(income.G5?.v, -80);
});
