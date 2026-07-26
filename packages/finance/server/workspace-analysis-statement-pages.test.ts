import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

mock.module("./statements/report-detail", { namedExports: {
  getReportDetail: async () => ({
    details: [{ code: "1001", name: "库存现金", category: "asset", balanceDirection: "debit", openingDebit: 10, openingCredit: 0, currentDebit: 2, currentCredit: 0, closing: 12 }],
    total: 12,
    reclassAdjustments: [{ sourceAccount: "1122", targetAccount: "2202", amount: 5, status: "approved", type: "deduction" }],
  }),
} } as never);

mock.module("./statements/consolidation-overview", { namedExports: {
  loadConsolidationOverview: async () => ({
    entities: [{
      entitySnapshotId: 21, companyId: 2, relationId: 8, code: "SUB", name: "子公司", fullName: "子公司有限公司", role: "子公司",
      parentCode: "PARENT", parentName: "母公司", shareRatio: 0.8, status: "ready",
      balanceSheet: { kind: "ledger", status: "available", lineCount: 10 },
      incomeStatement: { kind: "ledger", status: "available", lineCount: 8 },
      cashFlow: { kind: "ledger", status: "available", lineCount: 6 },
    }],
  }),
} } as never);

mock.module("./statements/consolidated-output-service", { namedExports: {
  loadConsolidatedReportOutput: async () => ({ ok: true, data: { report: { statements: [{
    reportType: "balanceSheet", label: "合并资产负债表", lines: [{
      lineCode: "BS-1", label: "货币资金", code: "1001", amount: 100, previousAmount: 90, section: "assets", side: "debit", direction: null,
      subtract: false, isHeader: false, isTotal: false, isGrandTotal: false, sourceAmount: 110, adjustmentAmount: -10,
      entityAmounts: [{ entitySnapshotId: 21, companyCode: "SUB", companyName: "子公司", role: "subsidiary", amount: 40, previousAmount: 35 }],
    }],
  }] } } }),
} } as never);

const { loadFinanceStatementCompositeWorkspaceAnalysisSourcePage } = await import("./workspace-analysis-statement-pages");

test("exposes report detail and reclassification arrays as separate rows", async () => {
  const details = await loadFinanceStatementCompositeWorkspaceAnalysisSourcePage({
    sourceKey: "finance.statements.account-details", parameters: { companyCode: "ZX01", year: 2026, month: 6, codes: "1001" }, page: 1, pageSize: 20,
  });
  const adjustments = await loadFinanceStatementCompositeWorkspaceAnalysisSourcePage({
    sourceKey: "finance.statements.reclass-adjustments", parameters: { companyCode: "ZX01", year: 2026, month: 6, codes: "1001" }, page: 1, pageSize: 20,
  });
  assert.equal(details.totalRows, 1);
  assert.equal(adjustments.totalRows, 1);
});

test("flattens consolidation source coverage without leaking the nested workbench model", async () => {
  const page = await loadFinanceStatementCompositeWorkspaceAnalysisSourcePage({
    sourceKey: "finance.statements.consolidation-entities", parameters: { batchId: 3 }, page: 1, pageSize: 20,
  });
  assert.deepEqual(page.rows, [{
    entitySnapshotId: 21, companyId: 2, relationId: 8, code: "SUB", name: "子公司", fullName: "子公司有限公司", role: "子公司",
    parentCode: "PARENT", parentName: "母公司", shareRatio: 0.8, status: "ready",
    balanceSheetKind: "ledger", balanceSheetStatus: "available", balanceSheetLineCount: 10,
    incomeStatementKind: "ledger", incomeStatementStatus: "available", incomeStatementLineCount: 8,
    cashFlowKind: "ledger", cashFlowStatus: "available", cashFlowLineCount: 6,
  }]);
});

test("separates consolidated statement lines from per-entity contributions", async () => {
  const lines = await loadFinanceStatementCompositeWorkspaceAnalysisSourcePage({
    sourceKey: "finance.statements.consolidated-lines", parameters: { batchId: 3 }, page: 1, pageSize: 20,
  });
  const amounts = await loadFinanceStatementCompositeWorkspaceAnalysisSourcePage({
    sourceKey: "finance.statements.consolidated-entity-amounts", parameters: { batchId: 3 }, page: 1, pageSize: 20,
  });
  assert.equal(lines.totalRows, 1);
  assert.equal("entityAmounts" in (lines.rows[0] as object), false);
  assert.deepEqual(amounts.rows, [{
    reportType: "balanceSheet", lineCode: "BS-1", entitySnapshotId: 21, companyCode: "SUB", companyName: "子公司", role: "subsidiary", amount: 40, previousAmount: 35,
  }]);
});
