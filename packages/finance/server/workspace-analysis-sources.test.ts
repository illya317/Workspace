import assert from "node:assert/strict";
import test, { mock } from "node:test";

import { createWorkspaceAnalysisSourceCatalog } from "@workspace/platform/server/workspace-analysis-source-registry";

mock.module("server-only", { namedExports: {} } as never);

const {
  FINANCE_LEDGER_VOUCHERS_SOURCE,
  FINANCE_LEDGER_ACCOUNTS_SOURCE,
  FINANCE_LEDGER_GROUP_ACCOUNTS_SOURCE,
  FINANCE_BUDGET_DEPARTMENT_MONTHLY_SOURCE,
} = await import("./workspace-analysis-sources");
const { FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } = await import("./workspace-analysis-source-registrations");
const {
  FINANCE_FUND_FLOW_TOP_LEVEL_FIELD_COVERAGE,
  FINANCE_MANAGEMENT_TOP_LEVEL_FIELD_COVERAGE,
} = await import("./workspace-analysis-derived-sources");

test("registers broad Finance fact sources with exact inherited business permissions", () => {
  const catalog = createWorkspaceAnalysisSourceCatalog(FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS);
  catalog.validateReferences();

  assert.deepEqual(catalog.list().map((source) => source.sourceKey), [
    "finance.analysis.fund-flow.activities",
    "finance.analysis.fund-flow.balance-signals",
    "finance.analysis.fund-flow.companies",
    "finance.analysis.fund-flow.ledger-channels",
    "finance.analysis.fund-flow.scope-values",
    "finance.analysis.fund-flow.sources",
    "finance.analysis.fund-flow.summary-facts",
    "finance.analysis.fund-flow.uses",
    "finance.analysis.fund-flow.warnings",
    "finance.analysis.management.budget-variances",
    "finance.analysis.management.cash-scenarios",
    "finance.analysis.management.companies",
    "finance.analysis.management.coverage",
    "finance.analysis.management.expense-structure",
    "finance.analysis.management.operation-months",
    "finance.analysis.management.operational-rankings",
    "finance.analysis.management.performance",
    "finance.analysis.management.risks",
    "finance.analysis.management.summary-facts",
    "finance.analysis.management.warnings",
    "finance.analysis.management.working-capital",
    "finance.budget.department-monthly",
    "finance.budget.research-monthly",
    "finance.budget.versions",
    "finance.cost.imports",
    "finance.ledger.account-mappings",
    "finance.ledger.accounts",
    "finance.ledger.asset-adjustments",
    "finance.ledger.asset-cards",
    "finance.ledger.asset-metrics",
    "finance.ledger.asset-periods",
    "finance.ledger.asset-reconciliation",
    "finance.ledger.balances",
    "finance.ledger.counterparty-balances",
    "finance.ledger.group-account-mapped-local-accounts",
    "finance.ledger.group-account-parent-recommendations",
    "finance.ledger.group-account-parents",
    "finance.ledger.group-account-years",
    "finance.ledger.group-accounts",
    "finance.ledger.periods",
    "finance.ledger.reclass-all-items",
    "finance.ledger.reclass-results",
    "finance.ledger.reclass-rule-candidates",
    "finance.ledger.reclass-workbench",
    "finance.ledger.voucher-cash-flow-allocations",
    "finance.ledger.voucher-items",
    "finance.ledger.voucher-metadata",
    "finance.ledger.vouchers",
    "finance.statements.account-details",
    "finance.statements.consolidated-entity-amounts",
    "finance.statements.consolidated-lines",
    "finance.statements.consolidation-entities",
    "finance.statements.lines",
    "finance.statements.reclass-adjustments",
  ]);

  for (const registration of FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS) {
    assert.equal(registration.definition.ownerModuleKey, "finance");
    assert.equal(registration.definition.authorization.requiredActions.length > 0, true);
    assert.deepEqual(
      Object.fromEntries(Object.entries(registration.definition.scopeBindings).map(([key, value]) => [key, value?.mode])),
      { personal: "workspace", department: "workspace", project: "workspace" },
    );
  }
});

test("classifies every fund-flow and management top-level response field without silent omissions", () => {
  const sourceKeys = new Set(FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.map(({ definition }) => definition.sourceKey));
  assert.deepEqual(Object.keys(FINANCE_FUND_FLOW_TOP_LEVEL_FIELD_COVERAGE).sort(), [
    "activities", "balanceSignals", "companies", "evidence", "ledgerChannels", "metrics", "scope", "sources", "uses", "warnings",
  ]);
  assert.deepEqual(Object.keys(FINANCE_MANAGEMENT_TOP_LEVEL_FIELD_COVERAGE).sort(), [
    "budget", "capital", "cashScenarios", "companies", "coverage", "expenseStructure", "fundFlow", "operations", "performance", "profitability", "risks", "scope", "warnings", "workingCapital",
  ]);
  for (const coverage of [FINANCE_FUND_FLOW_TOP_LEVEL_FIELD_COVERAGE, FINANCE_MANAGEMENT_TOP_LEVEL_FIELD_COVERAGE]) {
    for (const field of Object.values(coverage)) {
      assert.notEqual(field.disposition, "omit");
      for (const sourceKey of field.sourceKeys) assert.equal(sourceKeys.has(sourceKey), true, sourceKey);
    }
  }
});

test("voucher source retains every stable scalar and delegates bounded nested facts to real child sources", () => {
  const omitted = FINANCE_LEDGER_VOUCHERS_SOURCE.fieldCoverage?.filter((item) => item.disposition === "omit");
  assert.deepEqual(omitted?.map((item) => item.fieldKey), ["period"]);
  assert.deepEqual(
    FINANCE_LEDGER_VOUCHERS_SOURCE.fieldCoverage?.filter((item) => item.disposition === "childSource").map((item) => item.sourceKey),
    ["finance.ledger.voucher-metadata", "finance.ledger.voucher-items", "finance.ledger.voucher-cash-flow-allocations"],
  );
  assert.equal(FINANCE_LEDGER_VOUCHERS_SOURCE.definition.fields.some((field) => field.key === "externalSourceDocumentId"), true);
  assert.equal(FINANCE_LEDGER_VOUCHERS_SOURCE.definition.fields.some((field) => field.key === "editedBy"), true);
  assert.equal(FINANCE_LEDGER_VOUCHERS_SOURCE.definition.fields.some((field) => field.key === "version"), true);
});

test("ledger sources retain actual group mapping and parent relationships", () => {
  const accountGroupCoverage = FINANCE_LEDGER_ACCOUNTS_SOURCE.fieldCoverage?.find((item) => item.fieldKey === "groupAccount");
  assert.deepEqual(accountGroupCoverage, {
    fieldKey: "groupAccount",
    disposition: "childSource",
    sourceKey: "finance.ledger.account-mappings",
    description: "当前实际集团科目标识、编码和名称随映射事实一起规范化。",
  });
  assert.deepEqual(FINANCE_LEDGER_GROUP_ACCOUNTS_SOURCE.fieldCoverage?.find((item) => item.fieldKey === "parent"), {
    fieldKey: "parent",
    disposition: "childSource",
    sourceKey: "finance.ledger.group-account-parents",
    description: "实际父级关系规范化为一科目一父科目关系源，与父级建议严格区分。",
  });
});

test("budget source normalizes the public months array into monthly facts", () => {
  assert.deepEqual(
    FINANCE_BUDGET_DEPARTMENT_MONTHLY_SOURCE.definition.fields.map((field) => field.key),
    [
      "versionId", "year", "companyCode", "budgetKind", "ownerName", "accountName", "expenseType",
      "accountId", "accountCode", "accountActive", "month", "amount", "annualTotal",
    ],
  );
});
