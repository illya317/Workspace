import assert from "node:assert/strict";
import test, { mock } from "node:test";

mock.module("server-only", { namedExports: {} } as never);

const calls: Array<{ service: string; input: unknown }> = [];
let accountTotal = 0;
let accountRows: Array<Record<string, unknown>> = [];
let groupAccountRows: Array<Record<string, unknown>> = [];

mock.module("./assets/service", { namedExports: {
  listFinanceAssetWorkspace: async (input: unknown) => {
    calls.push({ service: "assets", input });
    return {
      scope: { companyCode: "ZX01", year: 2026, month: 6, periodId: 12, isClosed: false },
      cards: [], periodRows: [], adjustments: [], reconciliation: [],
      metrics: { normalAmount: 10, adjustmentAmount: 2, periodAmount: 12, voucherAmount: 11, ledgerAmount: 11, difference: 1 },
    };
  },
} } as never);
mock.module("./analysis/fund-flow-analysis", { namedExports: { getFundFlowAnalysis: async () => ({
  scope: { companyCodes: ["ZX01"], label: "甲公司", year: 2026, month: 6, periodLabel: "2026年1—6月", aggregation: "single", availableYears: [2026, 2025] },
  metrics: { inflow: 100, outflow: 80, netCashChange: 20, endingCash: 30, financingInflowShare: 0.1, operatingCoverage: 1.2 },
  evidence: { cashFlowCompanyCount: 1, voucherCount: 2, voucherItemCount: 4, cashLinkedVoucherCount: 1, cashFlowNetCashChange: 20, ledgerNetCashChange: 20, balanceNetCashChange: 20 },
  warnings: ["口径警告"], activities: [], sources: [], uses: [], ledgerChannels: [], balanceSignals: [], companies: [],
}) } } as never);
mock.module("./analysis/management-analysis", { namedExports: { getManagementAnalysis: async () => ({
  scope: { companyCodes: ["ZX01"], label: "甲公司", year: 2026, month: 6, periodLabel: "2026年1—6月", aggregation: "single", comparisonLabel: "2025年同期" },
  profitability: { revenue: 100 }, companies: [], expenseStructure: [], workingCapital: { currentAssets: 30, components: [] }, cashScenarios: [],
  budget: { mode: "historical", rows: [] }, performance: [], risks: [], coverage: [], capital: { totalAssets: 50 }, warnings: ["管理警告"],
  operations: { companyAssignment: "unassigned", shipmentMonths: [1, 2], costMonths: [1], shipmentAmount: 20, topProducts: [], topCustomers: [], costCategories: [], topCostProducts: [] },
}) } } as never);
mock.module("./budget/service", { namedExports: {
  loadBudgetOverview: async (input: unknown) => {
    calls.push({ service: "budget", input });
    return {
      versionId: 8,
      deptBudget: [{ dept: "财务部", account: "办公费", total: 78, months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], expenseType: "管理费用", accountId: 7, accountCode: "6602", accountActive: true }],
      rdBudget: [{ project: "项目甲", category: "材料费", total: 12, months: Array(12).fill(1), accountId: null, accountCode: null, accountActive: null }],
    };
  },
} } as never);
mock.module("./budget/budget-version", { namedExports: { listBudgetVersions: async () => [] } } as never);
mock.module("./cost/import", { namedExports: { listImports: async () => ({ data: [], pagination: { total: 0 } }) } } as never);
mock.module("./ledger/accounts", { namedExports: { listFinanceAccounts: async (input: unknown) => (calls.push({ service: "accounts", input }), { data: accountRows, total: accountTotal }) } } as never);
mock.module("./ledger/balance-api", { namedExports: { listFinanceBalances: async () => ({ data: [], total: 0 }) } } as never);
mock.module("./ledger/counterparty-balances", { namedExports: { listCounterpartyBalances: async () => ({ data: [], total: 0 }) } } as never);
mock.module("./ledger/group-accounts", { namedExports: { listFinanceGroupAccounts: async () => ({ rows: groupAccountRows }) } } as never);
mock.module("./ledger/group-accounts/mapped-local-accounts", { namedExports: { listFinanceGroupAccountMappedLocalAccounts: async () => ({ rows: [] }) } } as never);
mock.module("./ledger/periods", { namedExports: { listFinancePeriods: async () => ({ periods: [] }) } } as never);
mock.module("./ledger/reclass-results/list", { namedExports: { listReclassResults: async () => ({ items: [], total: 0 }) } } as never);
mock.module("./ledger/reclass-rules", { namedExports: { scanCandidates: async () => ({ candidates: [] }) } } as never);
mock.module("./ledger/voucher-service", { namedExports: { listVouchers: async () => ({
  data: [{
    id: 9, voucherNo: "记-9", sourceMetadata: { source: { batch: "B-1" }, flags: [true, 3] },
    items: [{ id: 91, voucherId: 9, accountId: 1, debit: 10, credit: 0, description: "摘要", sortOrder: 0, account: { id: 1, code: "1001", name: "库存现金" }, sourceMetadata: { settlement: null } }],
    cashFlowAllocations: [{ id: 71, ownerVoucherItemId: 91, counterpartItemId: null, direction: "in", amount: 10, cashFlowItem: { sourceCode: "01", sourceName: "销售商品" } }],
  }],
  total: 1,
}) } } as never);
mock.module("./schedules/reclassify", { namedExports: { computeReclassification: async () => ({ entries: [] }) } } as never);
mock.module("./statements/report-generator", { namedExports: {
  generateFinanceReport: async () => ({
    json: async () => ({
      assets: [{ lineCode: "A-1", code: "1001", label: "货币资金", amount: 88, section: "currentAssets", side: "debit" }],
      liabilities: [],
      equity: [],
    }),
  }),
} } as never);
mock.module("./statements/reports/direct", { namedExports: {
  generateDirectStatementReport: async (...input: unknown[]) => {
    calls.push({ service: "statement", input });
    return { lines: [{ lineCode: "I-1", label: "营业收入", amount: 100, section: "profit", side: "credit" }] };
  },
} } as never);
mock.module("./workspace-analysis-statement-pages", { namedExports: {
  isFinanceStatementCompositeWorkspaceAnalysisSource: () => false,
  loadFinanceStatementCompositeWorkspaceAnalysisSourcePage: async () => { throw new Error("unexpected statement source"); },
} } as never);

const { loadFinanceGeneralWorkspaceAnalysisSourcePage } = await import("./workspace-analysis-source-pages");

test("normalizes department budget arrays into complete monthly facts before pagination", async () => {
  calls.length = 0;
  const page = await loadFinanceGeneralWorkspaceAnalysisSourcePage({
    sourceKey: "finance.budget.department-monthly",
    parameters: { year: 2026, companyCode: "ZX01", versionId: 8 },
    page: 2,
    pageSize: 5,
  });

  assert.equal(page.totalRows, 12);
  assert.deepEqual(page.rows, [
    { versionId: 8, year: 2026, companyCode: "ZX01", budgetKind: "department", ownerName: "财务部", accountName: "办公费", expenseType: "管理费用", accountId: 7, accountCode: "6602", accountActive: true, month: 6, amount: 6, annualTotal: 78 },
    { versionId: 8, year: 2026, companyCode: "ZX01", budgetKind: "department", ownerName: "财务部", accountName: "办公费", expenseType: "管理费用", accountId: 7, accountCode: "6602", accountActive: true, month: 7, amount: 7, annualTotal: 78 },
    { versionId: 8, year: 2026, companyCode: "ZX01", budgetKind: "department", ownerName: "财务部", accountName: "办公费", expenseType: "管理费用", accountId: 7, accountCode: "6602", accountActive: true, month: 8, amount: 8, annualTotal: 78 },
    { versionId: 8, year: 2026, companyCode: "ZX01", budgetKind: "department", ownerName: "财务部", accountName: "办公费", expenseType: "管理费用", accountId: 7, accountCode: "6602", accountActive: true, month: 9, amount: 9, annualTotal: 78 },
    { versionId: 8, year: 2026, companyCode: "ZX01", budgetKind: "department", ownerName: "财务部", accountName: "办公费", expenseType: "管理费用", accountId: 7, accountCode: "6602", accountActive: true, month: 10, amount: 10, annualTotal: 78 },
  ]);
});

test("returns asset metrics as one honest company-period row", async () => {
  const page = await loadFinanceGeneralWorkspaceAnalysisSourcePage({
    sourceKey: "finance.ledger.asset-metrics",
    parameters: { companyCode: "ZX01", year: 2026, month: 6 },
    page: 1,
    pageSize: 10,
  });
  assert.deepEqual(page, {
    rows: [{ companyCode: "ZX01", year: 2026, month: 6, periodId: 12, isClosed: false, normalAmount: 10, adjustmentAmount: 2, periodAmount: 12, voucherAmount: 11, ledgerAmount: 11, difference: 1 }],
    totalRows: 1,
  });
});

test("uses the same statement fact generators for direct and balance-sheet rows", async () => {
  calls.length = 0;
  const page = await loadFinanceGeneralWorkspaceAnalysisSourcePage({
    sourceKey: "finance.statements.lines",
    parameters: { companyCode: "ZX01", year: 2026, month: 6, type: "income" },
    page: 1,
    pageSize: 10,
  });
  assert.equal(page.totalRows, 1);
  assert.deepEqual(
    calls.filter((call) => call.service === "statement"),
    [{ service: "statement", input: ["ZX01", 2026, 6, "incomeStatement"] }],
  );
  const balance = await loadFinanceGeneralWorkspaceAnalysisSourcePage({
    sourceKey: "finance.statements.lines",
    parameters: { companyCode: "ZX01", year: 2026, month: 6, type: "balance" },
    page: 1,
    pageSize: 10,
  });
  assert.deepEqual(balance, {
    rows: [{ lineCode: "A-1", code: "1001", label: "货币资金", amount: 88, section: "currentAssets", side: "debit" }],
    totalRows: 1,
  });
});

test("materializes voucher children completely and expands dynamic JSON into leaf facts", async () => {
  const items = await loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.ledger.voucher-items", parameters: {}, page: 1, pageSize: 20 });
  const allocations = await loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.ledger.voucher-cash-flow-allocations", parameters: {}, page: 1, pageSize: 20 });
  const metadata = await loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.ledger.voucher-metadata", parameters: {}, page: 1, pageSize: 20 });

  assert.equal(items.totalRows, 1);
  assert.deepEqual(allocations.rows, [{
    voucherId: 9, voucherNo: "记-9", allocationId: 71, ownerVoucherItemId: 91, counterpartItemId: null,
    direction: "in", amount: 10, cashFlowItemSourceCode: "01", cashFlowItemSourceName: "销售商品",
  }]);
  assert.deepEqual(metadata.rows, [
    { entityKind: "voucher", voucherId: 9, entityId: 9, jsonPointer: "/source/batch", valueKind: "string", textValue: "B-1", numberValue: null, booleanValue: null },
    { entityKind: "voucher", voucherId: 9, entityId: 9, jsonPointer: "/flags/0", valueKind: "boolean", textValue: null, numberValue: null, booleanValue: true },
    { entityKind: "voucher", voucherId: 9, entityId: 9, jsonPointer: "/flags/1", valueKind: "number", textValue: null, numberValue: 3, booleanValue: null },
    { entityKind: "voucherItem", voucherId: 9, entityId: 91, jsonPointer: "/settlement", valueKind: "null", textValue: null, numberValue: null, booleanValue: null },
  ]);
});

test("fails closed instead of returning incomplete children when a parent list exceeds the bound", async () => {
  accountTotal = 4_001;
  await assert.rejects(
    () => loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.ledger.account-mappings", parameters: {}, page: 1, pageSize: 20 }),
    (error: unknown) => error instanceof Error && error.message.includes("超过上限"),
  );
  accountTotal = 0;
});

test("account mapping child retains the public resolved group account relationship", async () => {
  accountRows = [{
    id: 41,
    companyCode: "ZX01",
    code: "1001",
    mapping: { id: 51, method: "manual_override", updatedAt: "2026-07-01T08:00:00.000Z" },
    groupAccount: { id: 61, code: "G1001", name: "货币资金" },
  }];
  accountTotal = 1;
  const page = await loadFinanceGeneralWorkspaceAnalysisSourcePage({
    sourceKey: "finance.ledger.account-mappings",
    parameters: {},
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(page.rows, [{
    accountId: 41,
    companyCode: "ZX01",
    accountCode: "1001",
    mappingId: 51,
    mappingMethod: "manual_override",
    mappingUpdatedAt: "2026-07-01T08:00:00.000Z",
    groupAccountId: 61,
    groupAccountCode: "G1001",
    groupAccountName: "货币资金",
  }]);
  accountRows = [];
  accountTotal = 0;
});

test("group account parent child distinguishes the actual hierarchy from recommendations", async () => {
  groupAccountRows = [{
    id: 71,
    code: "G100101",
    name: "库存现金",
    parent: { id: 70, code: "G1001", name: "货币资金" },
    parentRecommendation: { kind: "top_level" },
    years: [],
  }];
  const page = await loadFinanceGeneralWorkspaceAnalysisSourcePage({
    sourceKey: "finance.ledger.group-account-parents",
    parameters: {},
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(page.rows, [{
    groupAccountId: 71,
    accountCode: "G100101",
    accountName: "库存现金",
    parentGroupAccountId: 70,
    parentGroupAccountCode: "G1001",
    parentGroupAccountName: "货币资金",
  }]);
  groupAccountRows = [];
});

test("materializes composite analysis summaries, multivalues and warnings without silent top-level loss", async () => {
  const summary = await loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.analysis.fund-flow.summary-facts", parameters: { companyCodes: "ZX01", year: 2026 }, page: 1, pageSize: 100 });
  const scope = await loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.analysis.fund-flow.scope-values", parameters: { companyCodes: "ZX01", year: 2026 }, page: 1, pageSize: 100 });
  const months = await loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.analysis.management.operation-months", parameters: { companyCodes: "ZX01", year: 2026 }, page: 1, pageSize: 100 });
  const warnings = await loadFinanceGeneralWorkspaceAnalysisSourcePage({ sourceKey: "finance.analysis.management.warnings", parameters: { companyCodes: "ZX01", year: 2026 }, page: 1, pageSize: 100 });
  assert.equal(summary.rows.some((row) => (row as { section: string; field: string }).section === "metrics" && (row as { field: string }).field === "inflow"), true);
  assert.deepEqual(scope.rows, [
    { kind: "companyCode", textValue: "ZX01", numberValue: null },
    { kind: "availableYear", textValue: null, numberValue: 2026 },
    { kind: "availableYear", textValue: null, numberValue: 2025 },
  ]);
  assert.deepEqual(months.rows, [{ kind: "shipment", month: 1 }, { kind: "shipment", month: 2 }, { kind: "cost", month: 1 }]);
  assert.deepEqual(warnings.rows, [{ index: 0, message: "管理警告" }]);
});
