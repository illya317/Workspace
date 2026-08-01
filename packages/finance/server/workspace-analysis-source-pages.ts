import "server-only";

import { WorkspaceAnalysisRuntimeError } from "@workspace/platform/server/workspace-analysis-runtime";
import { listFinanceAssetWorkspace } from "./assets/service";
import { getFundFlowAnalysis } from "./analysis/fund-flow-analysis";
import { getManagementAnalysis } from "./analysis/management-analysis";
import { listImports } from "./cost/import";
import { loadBudgetOverview } from "./budget/service";
import { listBudgetVersions } from "./budget/budget-version";
import { listFinanceAccounts } from "./ledger/accounts";
import { listFinanceBalances } from "./ledger/balance-api";
import { listCounterpartyBalances } from "./ledger/counterparty-balances";
import { counterpartyPeriodScope } from "./ledger/counterparty-period";
import { listFinanceGroupAccounts } from "./ledger/group-accounts";
import { listFinanceGroupAccountMappedLocalAccounts } from "./ledger/group-accounts/mapped-local-accounts";
import { listFinancePeriods } from "./ledger/periods";
import { listReclassResults } from "./ledger/reclass-results/list";
import { scanCandidates } from "./ledger/reclass-rules";
import { listVouchers, type StandardVoucherListRow } from "./ledger/voucher-service";
import { computeReclassification } from "./schedules/reclassify";
import { generateFinanceReport } from "./statements/report-generator";
import { generateDirectStatementReport } from "./statements/reports/direct";
import {
  type FinanceAssetMetricRow,
  type FinanceBudgetMonthlyRow,
} from "./workspace-analysis-sources";
import type {
  FinanceAccountMappingRow,
  FinanceJsonLeafRow,
  FinanceVoucherCashFlowAllocationRow,
} from "./workspace-analysis-child-sources";
import type {
  FinanceAnalysisScalarFactRow,
  FinanceAnalysisScopeValueRow,
  FinanceAnalysisWarningRow,
  FinanceManagementOperationMonthRow,
  ManagementOperationalRankingRow,
} from "./workspace-analysis-derived-sources";
import { FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS } from "./workspace-analysis-source-registrations";
import {
  isFinanceGroupAccountChildWorkspaceAnalysisSource,
  loadFinanceGroupAccountChildWorkspaceAnalysisSourcePage,
} from "./workspace-analysis-group-account-pages";
import {
  isFinanceStatementCompositeWorkspaceAnalysisSource,
  loadFinanceStatementCompositeWorkspaceAnalysisSourcePage,
} from "./workspace-analysis-statement-pages";

const SOURCE_KEYS = new Set(FINANCE_GENERAL_WORKSPACE_ANALYSIS_SOURCE_REGISTRATIONS.map((item) => item.definition.sourceKey));

export function isFinanceGeneralWorkspaceAnalysisSource(sourceKey: string) {
  return SOURCE_KEYS.has(sourceKey);
}

export async function loadFinanceGeneralWorkspaceAnalysisSourcePage(input: {
  readonly sourceKey: string;
  readonly parameters: Readonly<Record<string, string | number | boolean>>;
  readonly page: number;
  readonly pageSize: number;
}) {
  const { sourceKey, parameters, page, pageSize } = input;

  if (sourceKey.startsWith("finance.analysis.fund-flow.")) {
    const result = await getFundFlowAnalysis(analysisScope(parameters, sourceKey));
    if (sourceKey === "finance.analysis.fund-flow.summary-facts") {
      const { companyCodes: _companyCodes, availableYears: _availableYears, availableMonths: _availableMonths, ...scope } = result.scope;
      return boundedInMemoryPage(sourceKey, analysisScalarFacts({ scope, metrics: result.metrics, evidence: result.evidence }), page, pageSize);
    }
    if (sourceKey === "finance.analysis.fund-flow.scope-values") {
      const rows: FinanceAnalysisScopeValueRow[] = [
        ...result.scope.companyCodes.map((textValue) => ({ kind: "companyCode" as const, textValue, numberValue: null })),
        ...result.scope.availableYears.map((numberValue) => ({ kind: "availableYear" as const, textValue: null, numberValue })),
      ];
      return boundedInMemoryPage(sourceKey, rows, page, pageSize);
    }
    if (sourceKey === "finance.analysis.fund-flow.warnings") {
      const rows: FinanceAnalysisWarningRow[] = result.warnings.map((message, index) => ({ index, message }));
      return boundedInMemoryPage(sourceKey, rows, page, pageSize);
    }
    const rows = sourceKey === "finance.analysis.fund-flow.activities" ? result.activities
      : sourceKey === "finance.analysis.fund-flow.sources" ? result.sources
        : sourceKey === "finance.analysis.fund-flow.uses" ? result.uses
          : sourceKey === "finance.analysis.fund-flow.ledger-channels" ? result.ledgerChannels
            : sourceKey === "finance.analysis.fund-flow.balance-signals" ? result.balanceSignals
              : result.companies;
    return boundedInMemoryPage(sourceKey, rows, page, pageSize);
  }
  if (sourceKey.startsWith("finance.analysis.management.")) {
    const result = await getManagementAnalysis(analysisScope(parameters, sourceKey));
    if (sourceKey === "finance.analysis.management.summary-facts") {
      const { companyCodes: _companyCodes, ...scope } = result.scope;
      const { components: _components, ...workingCapital } = result.workingCapital;
      const { rows: _rows, ...budget } = result.budget;
      const { shipmentMonths: _shipmentMonths, costMonths: _costMonths, topProducts: _topProducts, topCustomers: _topCustomers, costCategories: _costCategories, topCostProducts: _topCostProducts, ...operations } = result.operations;
      return boundedInMemoryPage(sourceKey, analysisScalarFacts({ scope, profitability: result.profitability, workingCapital, budget, operations, capital: result.capital }), page, pageSize);
    }
    if (sourceKey === "finance.analysis.management.operation-months") {
      const rows: FinanceManagementOperationMonthRow[] = [
        ...result.operations.shipmentMonths.map((month) => ({ kind: "shipment" as const, month })),
        ...result.operations.costMonths.map((month) => ({ kind: "cost" as const, month })),
      ];
      return boundedInMemoryPage(sourceKey, rows, page, pageSize);
    }
    if (sourceKey === "finance.analysis.management.warnings") {
      const rows: FinanceAnalysisWarningRow[] = result.warnings.map((message, index) => ({ index, message }));
      return boundedInMemoryPage(sourceKey, rows, page, pageSize);
    }
    if (sourceKey === "finance.analysis.management.operational-rankings") {
      const rows: ManagementOperationalRankingRow[] = [
        ...result.operations.topProducts.map((row) => ({ kind: "product" as const, ...row })),
        ...result.operations.topCustomers.map((row) => ({ kind: "customer" as const, ...row })),
        ...result.operations.costCategories.map((row) => ({ kind: "costCategory" as const, ...row })),
        ...result.operations.topCostProducts.map((row) => ({ kind: "costProduct" as const, ...row })),
      ];
      return boundedInMemoryPage(sourceKey, rows, page, pageSize);
    }
    const rows = sourceKey === "finance.analysis.management.companies" ? result.companies
      : sourceKey === "finance.analysis.management.expense-structure" ? result.expenseStructure
        : sourceKey === "finance.analysis.management.working-capital" ? result.workingCapital.components
          : sourceKey === "finance.analysis.management.cash-scenarios" ? result.cashScenarios
            : sourceKey === "finance.analysis.management.budget-variances" ? result.budget.rows
              : sourceKey === "finance.analysis.management.performance" ? result.performance
                : sourceKey === "finance.analysis.management.risks" ? result.risks
                  : result.coverage;
    return boundedInMemoryPage(sourceKey, rows, page, pageSize);
  }

  if (sourceKey === "finance.ledger.account-mappings") {
    const accounts = await loadAllPages(sourceKey, (parentPage, parentPageSize) => listFinanceAccounts({
      companyCode: text(parameters.companyCode),
      year: integer(parameters.year) === undefined ? undefined : String(integer(parameters.year)),
      subjectLevel: integer(parameters.subjectLevel) === undefined ? undefined : String(integer(parameters.subjectLevel)),
      scope: accountScope(parameters.scope),
      keyword: text(parameters.keyword),
      reviewStatus: reviewStatus(parameters.reviewStatus),
      page: parentPage,
      pageSize: parentPageSize,
    }).then((result) => ({ rows: result.data, total: result.total })));
    const rows = accounts.flatMap((account): FinanceAccountMappingRow[] => account.mapping ? [{
      accountId: account.id,
      companyCode: account.companyCode,
      accountCode: account.code,
      mappingId: account.mapping.id,
      mappingMethod: account.mapping.method,
      mappingUpdatedAt: account.mapping.updatedAt,
      groupAccountId: account.groupAccount?.id ?? null,
      groupAccountCode: account.groupAccount?.code ?? null,
      groupAccountName: account.groupAccount?.name ?? null,
    }] : []);
    return boundedInMemoryPage(sourceKey, rows, page, pageSize);
  }
  if (
    sourceKey === "finance.ledger.voucher-items"
    || sourceKey === "finance.ledger.voucher-cash-flow-allocations"
    || sourceKey === "finance.ledger.voucher-metadata"
  ) {
    const vouchers = await loadAllVouchers(sourceKey, parameters);
    if (sourceKey === "finance.ledger.voucher-items") {
      return boundedInMemoryPage(sourceKey, vouchers.flatMap((voucher) => voucher.items), page, pageSize);
    }
    if (sourceKey === "finance.ledger.voucher-cash-flow-allocations") {
      const rows = vouchers.flatMap((voucher) => (voucher.cashFlowAllocations ?? []).map((allocation): FinanceVoucherCashFlowAllocationRow => ({
        voucherId: voucher.id,
        voucherNo: voucher.voucherNo,
        allocationId: allocation.id,
        ownerVoucherItemId: allocation.ownerVoucherItemId,
        counterpartItemId: allocation.counterpartItemId,
        direction: allocation.direction,
        amount: allocation.amount,
        cashFlowItemSourceCode: allocation.cashFlowItem.sourceCode,
        cashFlowItemSourceName: allocation.cashFlowItem.sourceName,
      })));
      return boundedInMemoryPage(sourceKey, rows, page, pageSize);
    }
    const leaves: FinanceJsonLeafRow[] = [];
    for (const voucher of vouchers) {
      appendJsonLeaves(leaves, sourceKey, "voucher", voucher.id, voucher.id, voucher.sourceMetadata);
      for (const item of voucher.items) {
        appendJsonLeaves(leaves, sourceKey, "voucherItem", voucher.id, item.id, item.sourceMetadata);
      }
    }
    return inMemoryPage(leaves, page, pageSize);
  }
  if (isFinanceGroupAccountChildWorkspaceAnalysisSource(sourceKey)) {
    return loadFinanceGroupAccountChildWorkspaceAnalysisSourcePage(input);
  }
  if (sourceKey === "finance.ledger.group-account-mapped-local-accounts") {
    const result = await listFinanceGroupAccountMappedLocalAccounts({
      groupAccountId: requiredInteger(parameters.groupAccountId, "groupAccountId", sourceKey),
      policyVersionId: requiredInteger(parameters.policyVersionId, "policyVersionId", sourceKey),
    });
    return boundedInMemoryPage(sourceKey, result.rows, page, pageSize);
  }
  if (isFinanceStatementCompositeWorkspaceAnalysisSource(sourceKey)) {
    return loadFinanceStatementCompositeWorkspaceAnalysisSourcePage(input);
  }
  if (sourceKey === "finance.cost.imports") {
    const result = await listImports({ importId: integer(parameters.importId), page, pageSize });
    return { rows: result.data, totalRows: result.pagination.total };
  }
  if (sourceKey === "finance.ledger.reclass-all-items") {
    const { executeAllReclassItemsCommand } = await import("./ledger/route-commands");
    const result = await executeAllReclassItemsCommand({ periodId: requiredInteger(parameters.periodId, "periodId", sourceKey) });
    return boundedInMemoryPage(sourceKey, result.items, page, pageSize);
  }
  if (sourceKey === "finance.ledger.reclass-workbench") {
    const result = await computeReclassification(
      requiredText(parameters.companyCode, "companyCode", sourceKey),
      requiredInteger(parameters.year, "year", sourceKey),
      requiredInteger(parameters.month, "month", sourceKey),
    );
    return boundedInMemoryPage(sourceKey, result.entries, page, pageSize);
  }

  if (sourceKey === "finance.ledger.accounts") {
    return asDataPage(await listFinanceAccounts({
      companyCode: text(parameters.companyCode),
      year: integer(parameters.year) === undefined ? undefined : String(integer(parameters.year)),
      subjectLevel: integer(parameters.subjectLevel) === undefined ? undefined : String(integer(parameters.subjectLevel)),
      scope: accountScope(parameters.scope),
      keyword: text(parameters.keyword),
      reviewStatus: reviewStatus(parameters.reviewStatus),
      page,
      pageSize,
    }));
  }
  if (sourceKey === "finance.ledger.balances") {
    return asDataPage(await listFinanceBalances({
      periodId: integer(parameters.periodId),
      companyCode: text(parameters.companyCode),
      year: integer(parameters.year),
      month: integer(parameters.month),
      keyword: text(parameters.keyword),
      page,
      pageSize,
    }));
  }
  if (sourceKey === "finance.ledger.counterparty-balances") {
    const periodScope = counterpartyPeriodScope(parameters);
    if (!periodScope.ok) throw unavailable(sourceKey, periodScope.error);
    return asDataPage(await listCounterpartyBalances({
      companyCode: requiredText(parameters.companyCode, "companyCode", sourceKey),
      ...periodScope.data,
      category: counterpartyCategory(parameters.category, sourceKey),
      relationScope: counterpartyRelationScope(parameters.relationScope, sourceKey),
      objectType: counterpartyObjectType(parameters.objectType, sourceKey),
      keyword: text(parameters.keyword),
      page,
      pageSize,
    }));
  }
  if (sourceKey === "finance.ledger.periods") {
    const result = await listFinancePeriods({ year: integer(parameters.year) });
    return inMemoryPage(result.periods, page, pageSize);
  }
  if (sourceKey === "finance.ledger.vouchers") {
    return asDataPage(await listVouchers({
      periodId: integer(parameters.periodId),
      companyCode: text(parameters.companyCode),
      year: integer(parameters.year),
      month: integer(parameters.month),
      status: text(parameters.status),
      keyword: text(parameters.keyword),
      page,
      pageSize,
    }));
  }
  if (sourceKey === "finance.ledger.reclass-results") {
    const result = await listReclassResults({
      periodId: requiredInteger(parameters.periodId, "periodId", sourceKey),
      status: reclassStatus(parameters.status),
      keyword: text(parameters.keyword),
      page,
      pageSize,
    });
    return { rows: result.items, totalRows: result.total };
  }
  if (sourceKey === "finance.ledger.reclass-rule-candidates") {
    const result = await scanCandidates(integer(parameters.policyVersionId));
    return inMemoryPage(result.candidates, page, pageSize);
  }
  if (sourceKey === "finance.ledger.group-accounts") {
    const result = await listFinanceGroupAccounts({
      policyVersionId: integer(parameters.policyVersionId),
      keyword: text(parameters.keyword),
      category: text(parameters.category),
      reviewStatus: reviewStatus(parameters.reviewStatus),
    });
    return inMemoryPage(result.rows, page, pageSize);
  }
  if (sourceKey.startsWith("finance.assets.")) {
    const companyCode = requiredText(parameters.companyCode, "companyCode", sourceKey);
    const year = requiredInteger(parameters.year, "year", sourceKey);
    const month = requiredInteger(parameters.month, "month", sourceKey);
    const result = await listFinanceAssetWorkspace({ companyCode, year, month });
    if (sourceKey === "finance.assets.cards") return inMemoryPage(result.cards, page, pageSize);
    if (sourceKey === "finance.assets.periods") return inMemoryPage(result.periodRows, page, pageSize);
    if (sourceKey === "finance.assets.adjustments") return inMemoryPage(result.adjustments, page, pageSize);
    const metric: FinanceAssetMetricRow = {
      ...result.scope,
      ...result.metrics,
    };
    return inMemoryPage([metric], page, pageSize);
  }
  if (sourceKey === "finance.budget.versions") {
    const rows = await listBudgetVersions(
      requiredInteger(parameters.year, "year", sourceKey),
      text(parameters.companyCode),
    );
    return inMemoryPage(rows, page, pageSize);
  }
  if (sourceKey === "finance.budget.department-monthly" || sourceKey === "finance.budget.research-monthly") {
    const year = requiredInteger(parameters.year, "year", sourceKey);
    const companyCode = text(parameters.companyCode);
    const result = await loadBudgetOverview({
      year,
      companyCode,
      versionId: integer(parameters.versionId),
    });
    const rows = sourceKey === "finance.budget.department-monthly"
      ? result.deptBudget.flatMap((item) => item.months.map((amount, index): FinanceBudgetMonthlyRow => ({
          versionId: result.versionId,
          year,
          companyCode: companyCode ?? null,
          budgetKind: "department",
          ownerName: item.dept,
          accountName: item.account,
          expenseType: item.expenseType,
          accountId: item.accountId,
          accountCode: item.accountCode,
          accountActive: item.accountActive,
          month: index + 1,
          amount,
          annualTotal: item.total,
        })))
      : result.rdBudget.flatMap((item) => item.months.map((amount, index): FinanceBudgetMonthlyRow => ({
          versionId: result.versionId,
          year,
          companyCode: companyCode ?? null,
          budgetKind: "research",
          ownerName: item.project,
          accountName: item.category,
          expenseType: null,
          accountId: item.accountId,
          accountCode: item.accountCode,
          accountActive: item.accountActive,
          month: index + 1,
          amount,
          annualTotal: item.total,
        })));
    return inMemoryPage(rows, page, pageSize);
  }
  if (sourceKey === "finance.statements.lines") {
    const type = requiredText(parameters.type, "type", sourceKey);
    if (type !== "balance" && type !== "income" && type !== "cashflow") {
      throw unavailable(sourceKey, "type 仅支持 balance、income 或 cashflow");
    }
    if (type === "balance") {
      const response = await generateFinanceReport({
        companyCode: requiredText(parameters.companyCode, "companyCode", sourceKey),
        year: requiredInteger(parameters.year, "year", sourceKey),
        month: requiredInteger(parameters.month, "month", sourceKey),
        reportType: "balance",
      });
      const payload = await response.json() as {
        assets?: Array<Record<string, unknown>>;
        liabilities?: Array<Record<string, unknown>>;
        equity?: Array<Record<string, unknown>>;
      };
      return boundedInMemoryPage(sourceKey, [
        ...(payload.assets ?? []),
        ...(payload.liabilities ?? []),
        ...(payload.equity ?? []),
      ], page, pageSize);
    }
    const report = await generateDirectStatementReport(
      requiredText(parameters.companyCode, "companyCode", sourceKey),
      requiredInteger(parameters.year, "year", sourceKey),
      requiredInteger(parameters.month, "month", sourceKey),
      type === "income" ? "incomeStatement" : "cashFlow",
    );
    return inMemoryPage(report.lines, page, pageSize);
  }

  throw unavailable(sourceKey, "Finance 经营分析数据源不存在");
}

function asDataPage<T>(result: { data?: T[]; total?: number }) {
  return { rows: result.data ?? [], totalRows: result.total ?? 0 };
}

function inMemoryPage<T>(rows: readonly T[], page: number, pageSize: number) {
  const start = (page - 1) * pageSize;
  return { rows: rows.slice(start, start + pageSize), totalRows: rows.length };
}

const MAX_MATERIALIZED_ROWS = 4_000;
const PARENT_PAGE_SIZE = 200;
const MAX_PARENT_PAGES = 20;

async function loadAllVouchers(
  sourceKey: string,
  parameters: Readonly<Record<string, string | number | boolean>>,
) {
  return loadAllPages<StandardVoucherListRow>(sourceKey, (parentPage, parentPageSize) => listVouchers({
    periodId: integer(parameters.periodId), companyCode: text(parameters.companyCode), year: integer(parameters.year), month: integer(parameters.month),
    status: text(parameters.status), keyword: text(parameters.keyword), page: parentPage, pageSize: parentPageSize,
  }).then((result) => ({ rows: result.data, total: result.total })));
}

async function loadAllPages<T>(
  sourceKey: string,
  loader: (page: number, pageSize: number) => Promise<{ rows: T[]; total: number }>,
) {
  const rows: T[] = [];
  for (let parentPage = 1; parentPage <= MAX_PARENT_PAGES; parentPage += 1) {
    const result = await loader(parentPage, PARENT_PAGE_SIZE);
    assertBounded(sourceKey, result.total);
    rows.push(...result.rows);
    assertBounded(sourceKey, rows.length);
    if (rows.length >= result.total || result.rows.length === 0) return rows;
  }
  throw limitExceeded(sourceKey, `父列表超过 ${MAX_PARENT_PAGES} 页，拒绝返回不完整子源`);
}

function boundedInMemoryPage(sourceKey: string, rows: readonly unknown[], page: number, pageSize: number) {
  assertBounded(sourceKey, rows.length);
  return inMemoryPage(rows, page, pageSize);
}

function assertBounded(sourceKey: string, count: number) {
  if (count > MAX_MATERIALIZED_ROWS) throw limitExceeded(sourceKey, `规范化行数 ${count} 超过上限 ${MAX_MATERIALIZED_ROWS}`);
}

function appendJsonLeaves(
  rows: FinanceJsonLeafRow[],
  sourceKey: string,
  entityKind: FinanceJsonLeafRow["entityKind"],
  voucherId: number,
  entityId: number,
  value: unknown,
  pointer = "",
) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => appendJsonLeaves(rows, sourceKey, entityKind, voucherId, entityId, item, `${pointer}/${index}`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      appendJsonLeaves(rows, sourceKey, entityKind, voucherId, entityId, item, `${pointer}/${escapeJsonPointer(key)}`);
    }
    return;
  }
  if (value === undefined) return;
  rows.push({
    entityKind, voucherId, entityId, jsonPointer: pointer || "/", valueKind: value === null ? "null" : typeof value as "string" | "number" | "boolean",
    textValue: typeof value === "string" ? value : null,
    numberValue: typeof value === "number" ? value : null,
    booleanValue: typeof value === "boolean" ? value : null,
  });
  assertBounded(sourceKey, rows.length);
}

function escapeJsonPointer(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function text(value: string | number | boolean | undefined) {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function integer(value: string | number | boolean | undefined) {
  return typeof value === "number" && Number.isInteger(value) ? value : undefined;
}

function requiredText(value: string | number | boolean | undefined, key: string, sourceKey: string) {
  const parsed = text(value);
  if (parsed === undefined) throw unavailable(sourceKey, `${key} 为必填参数`);
  return parsed;
}

function requiredInteger(value: string | number | boolean | undefined, key: string, sourceKey: string) {
  const parsed = integer(value);
  if (parsed === undefined) throw unavailable(sourceKey, `${key} 为必填参数`);
  return parsed;
}

function analysisScope(parameters: Readonly<Record<string, string | number | boolean>>, sourceKey: string) {
  const companyCodes = requiredText(parameters.companyCodes, "companyCodes", sourceKey)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (companyCodes.length === 0 || companyCodes.length > 10) throw unavailable(sourceKey, "companyCodes 必须包含 1—10 家公司");
  return { companyCodes, year: requiredInteger(parameters.year, "year", sourceKey), month: integer(parameters.month) };
}

function analysisScalarFacts(sections: Readonly<Record<string, object>>) {
  return Object.entries(sections).flatMap(([section, values]) => Object.entries(values).flatMap(([field, value]): FinanceAnalysisScalarFactRow[] => {
    if (value !== null && !["string", "number", "boolean"].includes(typeof value)) return [];
    return [{
      section, field, valueKind: value === null ? "null" : typeof value as "string" | "number" | "boolean",
      textValue: typeof value === "string" ? value : null,
      numberValue: typeof value === "number" ? value : null,
      booleanValue: typeof value === "boolean" ? value : null,
    }];
  }));
}

function accountScope(value: string | number | boolean | undefined) {
  return value === "mapped" || value === "unmapped" || value === "inactive" || value === "all" ? value : undefined;
}

function reviewStatus(value: string | number | boolean | undefined) {
  return value === "confirmed" || value === "reviewed" || value === "pending_review" || value === "pending_delete" ? value : undefined;
}

function reclassStatus(value: string | number | boolean | undefined) {
  return value === "pending" || value === "approved" || value === "adjusted" || value === "rejected" || value === "all" ? value : undefined;
}

function counterpartyCategory(value: string | number | boolean | undefined, sourceKey: string) {
  if (value === "ar" || value === "ap" || value === "otherAr" || value === "otherAp") return value;
  throw unavailable(sourceKey, "category 必须是 ar、ap、otherAr 或 otherAp");
}

function counterpartyRelationScope(value: string | number | boolean | undefined, sourceKey: string) {
  if (value === undefined || value === "all" || value === "related" || value === "other" || value === "unrelated" || value === "unmatched") return value ?? "all";
  throw unavailable(sourceKey, "relationScope 必须是 all、related、other、unrelated 或 unmatched");
}

function counterpartyObjectType(value: string | number | boolean | undefined, sourceKey: string) {
  if (value === undefined
    || value === "all"
    || value === "groupCompany"
    || value === "customer"
    || value === "supplier"
    || value === "employee"
    || value === "department"
    || value === "other") return value ?? "all";
  throw unavailable(sourceKey, "objectType 必须是 all、groupCompany、customer、supplier、employee、department 或 other");
}

function unavailable(sourceKey: string, message: string) {
  return new WorkspaceAnalysisRuntimeError("source_unavailable", message, sourceKey);
}

function limitExceeded(sourceKey: string, message: string) {
  return new WorkspaceAnalysisRuntimeError("source_limit_exceeded", message, sourceKey);
}
