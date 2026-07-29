import { prisma } from "@workspace/platform/server/prisma";
import type {
  FinanceCloseBlockerDto,
  FinanceCloseProvider,
  FinanceCloseProviderInspection,
  FinanceCloseScope,
  FinanceCloseTaskStatus,
  FinanceCloseWorkpaperTaskKey,
} from "../../types/close";
import { listCounterpartyBalances } from "../ledger/counterparty-balances";
import { loadStandaloneStatementPageData, type StatementPageData } from "../statements/statement-page-data";
import { financeCloseInspectionFingerprint } from "./inspection-identity";
import {
  canonicalConsolidationFacts,
  canonicalLedgerFacts,
  canonicalRelatedPartyFacts,
  type ConsolidationFacts,
  type LedgerFacts,
  type RelatedPartyFacts,
} from "./ledger-statement-canonical";
import {
  buildFinanceCloseWorkpaperProvider,
  financeCloseWorkpaperProviderDependencies,
  type FinanceCloseFactInspection,
  type FinanceCloseWorkpaperProviderDependencies,
} from "./workpaper-provider";

export const LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS = {
  "employee-reimbursements": "finance.ledger.employee-reimbursements",
  "payroll-accruals": "finance.ledger.payroll-accruals",
  "contract-and-rd-assessment": "finance.ledger.contract-rd-assessment",
  "asset-inventory-estimates": "finance.ledger.asset-inventory-estimates",
  "expense-cost-accruals": "finance.ledger.expense-cost-accruals",
  "advance-receipts-review": "finance.ledger.advance-receipts",
  "other-receivables-review": "finance.ledger.other-receivables",
  "payables-and-prepayments": "finance.ledger.payables-prepayments",
  "contract-execution-review": "finance.ledger.contract-execution",
  "fx-and-profit-closing": "finance.ledger.fx-profit-closing",
  "account-usage-review": "finance.ledger.account-usage",
  "standalone-statements": "finance.statements.standalone",
  "group-accounting-adjustments": "finance.statements.group-adjustments",
  "related-party-reconciliation": "finance.ledger.related-party-reconciliation",
  "unusual-transactions-contingencies": "finance.ledger.unusual-contingencies",
  "consolidated-statements": "finance.statements.consolidated",
  "cashflow-equity-statements": "finance.statements.cashflow-equity",
  "close-process-review": "finance.close.process-review",
} as const;

export type LedgerStatementCloseProviderDependencies = FinanceCloseWorkpaperProviderDependencies & {
  loadLedgerFacts(scope: FinanceCloseScope): Promise<LedgerFacts>;
  loadRelatedPartyFacts(scope: FinanceCloseScope): Promise<RelatedPartyFacts>;
  loadStandaloneFacts(scope: FinanceCloseScope): Promise<StatementPageData>;
  loadConsolidationFacts(scope: FinanceCloseScope): Promise<ConsolidationFacts>;
};

const defaultDependencies: LedgerStatementCloseProviderDependencies = {
  ...financeCloseWorkpaperProviderDependencies,
  loadLedgerFacts: async (scope) => {
    const period = await prisma.financePeriod.findUnique({
      where: { companyCode_year_month: scope },
      select: {
        id: true,
        balances: { orderBy: { id: "asc" }, select: { id: true } },
        vouchers: {
          orderBy: { id: "asc" },
          select: {
            id: true, voucherNo: true, status: true, totalDebit: true, totalCredit: true,
            items: { orderBy: { id: "asc" }, select: { debit: true, credit: true, account: { select: { id: true, isActive: true, companyCode: true, year: true } } } },
          },
        },
      },
    });
    return canonicalLedgerFacts({
      periodId: period?.id ?? null,
      balanceIds: period?.balances.map((row) => row.id) ?? [],
      vouchers: period?.vouchers ?? [],
    });
  },
  loadRelatedPartyFacts: async (scope) => {
    const categories = ["ar", "ap", "otherAr", "otherAp"] as const;
    const rows: RelatedPartyFacts["rows"] = [];
    let expectedTotal = 0;
    for (const category of categories) {
      let page = 1;
      let totalPages = 1;
      do {
        const response = await listCounterpartyBalances({ ...scope, category, relationScope: "related", page, pageSize: 500 });
        rows.push(...response.data);
        if (page === 1) expectedTotal += response.total;
        totalPages = response.totalPages;
        page += 1;
      } while (page <= totalPages);
    }
    return canonicalRelatedPartyFacts({ rows, complete: rows.length === expectedTotal, expectedTotal });
  },
  loadStandaloneFacts: loadStandaloneStatementPageData,
  loadConsolidationFacts: async (scope) => {
    const company = await prisma.company.findUnique({ where: { code: scope.companyCode }, select: { id: true } });
    if (!company) return { applicability: "not_applicable", relationIds: [], batch: null };
    const periodStart = new Date(Date.UTC(scope.year, scope.month - 1, 1));
    const periodEnd = new Date(Date.UTC(scope.year, scope.month, 0, 23, 59, 59, 999));
    const relations = await prisma.ownershipInterest.findMany({
      where: {
        recordStatus: "confirmed",
        AND: [
          { OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: periodEnd } }] },
          { OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }] },
        ],
        owner: { company: { isNot: null } },
      },
      select: { id: true, issuerCompanyId: true, owner: { select: { company: { select: { id: true } } } } },
    });
    const edges = relations.flatMap((relation) => relation.owner.company
      ? [{ id: relation.id, parentId: relation.owner.company.id, childId: relation.issuerCompanyId }]
      : []);
    const applicability = resolveConsolidationApplicability(company.id, edges);
    if (!applicability.required) return { applicability: "not_applicable", relationIds: applicability.relationIds, batch: null };
    const batch = await prisma.financeConsolidationBatch.findFirst({
      where: { parentCompanyId: company.id, year: scope.year, month: scope.month, periodKind: "month" },
      orderBy: [{ version: "desc" }, { id: "desc" }],
      select: {
        id: true, status: true, revision: true,
        entries: { orderBy: { id: "asc" }, select: { id: true, entryNo: true, status: true, entryType: true } },
        controlDecisions: { orderBy: { controlKey: "asc" }, select: { controlKey: true, decision: true } },
        outputSnapshot: { select: { outputFingerprint: true } },
      },
    });
    return canonicalConsolidationFacts({ applicability: "parent_required", relationIds: applicability.relationIds, batch });
  },
};

export function resolveConsolidationApplicability(
  companyId: number,
  relations: readonly { id: number; parentId: number; childId: number }[],
) {
  const orderedRelations = [...relations].sort((left, right) => left.id - right.id);
  const incomingRelationIds = orderedRelations
    .filter((relation) => relation.childId === companyId)
    .map((relation) => relation.id);
  if (incomingRelationIds.length > 0) {
    return { required: false, relationIds: incomingRelationIds };
  }
  const relationIds: number[] = [];
  const visited = new Set<number>([companyId]);
  const pending = [companyId];
  while (pending.length > 0) {
    const parentId = pending.shift()!;
    for (const relation of orderedRelations.filter((row) => row.parentId === parentId)) {
      relationIds.push(relation.id);
      if (!visited.has(relation.childId)) {
        visited.add(relation.childId);
        pending.push(relation.childId);
      }
    }
  }
  return { required: relationIds.length > 0, relationIds };
}

export function buildLedgerStatementFinanceCloseProviderFragment(
  deps: LedgerStatementCloseProviderDependencies = defaultDependencies,
): Record<string, FinanceCloseProvider> {
  const workpaper = (taskKey: FinanceCloseWorkpaperTaskKey, version: string) => buildFinanceCloseWorkpaperProvider(taskKey, version, deps);
  return {
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["employee-reimbursements"]]: workpaper("employee-reimbursements", "ledger-employee-reimbursements-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["payroll-accruals"]]: workpaper("payroll-accruals", "ledger-payroll-accruals-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["contract-and-rd-assessment"]]: workpaper("contract-and-rd-assessment", "ledger-contract-rd-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["asset-inventory-estimates"]]: workpaper("asset-inventory-estimates", "ledger-estimates-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["expense-cost-accruals"]]: workpaper("expense-cost-accruals", "ledger-expense-accruals-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["advance-receipts-review"]]: workpaper("advance-receipts-review", "ledger-advance-receipts-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["other-receivables-review"]]: workpaper("other-receivables-review", "ledger-other-receivables-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["payables-and-prepayments"]]: workpaper("payables-and-prepayments", "ledger-payables-prepayments-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["contract-execution-review"]]: workpaper("contract-execution-review", "ledger-contract-execution-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["fx-and-profit-closing"]]: buildFinanceCloseWorkpaperProvider("fx-and-profit-closing", "ledger-fx-profit-v3", deps, (scope) => ledgerInspection(scope, deps, "fx-and-profit-closing")),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["account-usage-review"]]: buildFinanceCloseWorkpaperProvider("account-usage-review", "ledger-account-usage-v3", deps, (scope) => ledgerInspection(scope, deps, "account-usage-review")),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["standalone-statements"]]: standaloneProvider(deps),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["group-accounting-adjustments"]]: consolidationProvider("group-accounting-adjustments", deps),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["related-party-reconciliation"]]: relatedPartyProvider(deps),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["unusual-transactions-contingencies"]]: workpaper("unusual-transactions-contingencies", "ledger-unusual-contingencies-v1"),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["consolidated-statements"]]: consolidationProvider("consolidated-statements", deps),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["cashflow-equity-statements"]]: cashflowEquityProvider(deps),
    [LEDGER_STATEMENT_CLOSE_CONTRIBUTOR_KEYS["close-process-review"]]: workpaper("close-process-review", "finance-close-process-review-v1"),
  };
}

async function ledgerInspection(
  scope: FinanceCloseScope,
  deps: LedgerStatementCloseProviderDependencies,
  taskKey: "fx-and-profit-closing" | "account-usage-review",
): Promise<FinanceCloseFactInspection> {
  const facts = canonicalLedgerFacts(await deps.loadLedgerFacts(scope));
  const link = workpaperLink(taskKey);
  const unbalanced = facts.vouchers.filter((voucher) => {
    const headerDebitCents = moneyToCents(voucher.totalDebit);
    const headerCreditCents = moneyToCents(voucher.totalCredit);
    const itemDebitCents = voucher.items.reduce((sum, item) => sum + moneyToCents(item.debit), 0);
    const itemCreditCents = voucher.items.reduce((sum, item) => sum + moneyToCents(item.credit), 0);
    return headerDebitCents !== headerCreditCents
      || itemDebitCents !== itemCreditCents
      || headerDebitCents !== itemDebitCents
      || headerCreditCents !== itemCreditCents;
  });
  const unposted = facts.vouchers.filter((voucher) => voucher.status !== "posted");
  const invalidAccounts = facts.vouchers.flatMap((voucher) => voucher.items).filter((item) => (
    !item.account.isActive || item.account.companyCode !== scope.companyCode
      || item.account.year !== null && item.account.year !== scope.year
  ));
  const blockers = [
    ...(facts.periodId === null ? [blocker("missing_period", "当前公司和年月不存在会计期间", link)] : []),
    ...(facts.periodId !== null && facts.balanceIds.length === 0 && facts.vouchers.length === 0
      ? [blocker("missing_ledger_facts", "当前期间没有余额或凭证事实，不能证明总账完整", link)] : []),
    ...(unposted.length ? [blocker("unposted_vouchers", `${unposted.length} 张凭证尚未记账`, link)] : []),
    ...(unbalanced.length ? [blocker("unbalanced_vouchers", `${unbalanced.length} 张凭证借贷不平`, link)] : []),
    ...(invalidAccounts.length ? [blocker("invalid_accounts", `${invalidAccounts.length} 条分录引用停用、跨公司或错年度科目`, link)] : []),
  ];
  return {
    payload: {
      periodId: facts.periodId,
      balanceCount: facts.balanceIds.length,
      voucherCount: facts.vouchers.length,
      unpostedVoucherIds: unposted.map((row) => row.id),
      unbalancedVoucherIds: unbalanced.map((row) => row.id),
      invalidAccountLineCount: invalidAccounts.length,
    },
    blockers,
    evidenceRefs: [
      ...(facts.periodId ? [`finance-period:${facts.periodId}`] : []),
      ...facts.balanceIds.map((id) => `finance-account-balance:${id}`),
    ],
    voucherRefs: facts.vouchers.filter((voucher) => voucher.status === "posted").map((voucher) => `finance-voucher:${voucher.id}`),
  };
}

function standaloneProvider(deps: LedgerStatementCloseProviderDependencies): FinanceCloseProvider {
  return { inspectPeriodClose: async (scope) => {
    const facts = await deps.loadStandaloneFacts(scope);
    return standaloneInspection(scope, facts, "finance-statements-standalone-v2");
  } };
}

function standaloneInspection(scope: FinanceCloseScope, facts: StatementPageData, version: string) {
  const balance = facts.statements.find((row) => row.reportType === "balanceSheet");
  const missing = facts.statements.filter((row) => row.source === "empty" || row.lines.length === 0);
  const diagnostics = facts.statements.flatMap((row) => row.diagnostics.map((message) => `${row.reportType}:${message}`));
  const balanceDifferenceCents = moneyToCents(balance?.totals.totalAssets ?? 0)
    - moneyToCents(balance?.totals.totalLiabilitiesAndEquity ?? 0);
  const balanceDifference = balanceDifferenceCents / 100;
  const blockers = [
    ...(facts.statements.length !== 3 || missing.length ? [blocker("missing_statement_sources", "单体三表来源不完整", statementsLink())] : []),
    ...(diagnostics.length ? [blocker("statement_diagnostics", `单体报表存在 ${diagnostics.length} 项诊断`, statementsLink())] : []),
    ...(balanceDifferenceCents !== 0 ? [blocker("balance_sheet_unbalanced", `资产负债表不平，差额 ${balanceDifference}`, statementsLink())] : []),
  ];
  const payload = {
    scope,
    reports: facts.statements.map((row) => ({ reportType: row.reportType, source: row.source, lineCount: row.lines.length, diagnostics: row.diagnostics, totals: row.totals })),
    balanceDifference,
  };
  return inspection(blockers.length ? "blocked" : "ready", version, statementsLink(), payload, blockers,
    facts.statements.map((row) => `finance-statement:${scope.companyCode}:${scope.year}-${scope.month}:${row.reportType}`));
}

function consolidationProvider(
  taskKey: "group-accounting-adjustments" | "consolidated-statements",
  deps: LedgerStatementCloseProviderDependencies,
): FinanceCloseProvider {
  return { inspectPeriodClose: async (scope) => {
    const facts = canonicalConsolidationFacts(await deps.loadConsolidationFacts(scope));
    const batch = facts.batch;
    if (facts.applicability === "not_applicable") {
      const payload = { scope, taskKey, applicability: facts.applicability, relationIds: facts.relationIds };
      return inspection("ready", `finance-${taskKey}-v3`, statementsLink(), payload, [], facts.relationIds.map((id) => `ownership-interest:${id}`));
    }
    const inProgress = batch?.entries.filter((entry) => entry.status === "draft" || entry.status === "submitted") ?? [];
    const lifecycleReady = batch?.status === "locked" || batch?.status === "published";
    const blockers = [
      ...(!batch ? [blocker("missing_consolidation_batch", "当前母公司和期间没有合并批次", statementsLink())] : []),
      ...(batch && inProgress.length ? [blocker("in_progress_group_entries", `${inProgress.length} 笔集团凭证尚未完成复核`, statementsLink())] : []),
      ...(batch && !lifecycleReady ? [blocker("consolidation_not_locked", "合并工作底稿尚未锁定", statementsLink())] : []),
      ...(batch && lifecycleReady && !batch.outputSnapshot ? [blocker("missing_consolidated_output", "已锁定批次缺少不可变合并输出快照", statementsLink())] : []),
    ];
    const payload = { scope, taskKey, applicability: facts.applicability, relationIds: facts.relationIds, batch };
    return inspection(blockers.length ? "blocked" : "ready", `finance-${taskKey}-v3`, statementsLink(), payload, blockers,
      batch ? [...facts.relationIds.map((id) => `ownership-interest:${id}`), `finance-consolidation-batch:${batch.id}`, ...(batch.outputSnapshot ? [`finance-consolidation-output:${batch.outputSnapshot.outputFingerprint}`] : [])] : facts.relationIds.map((id) => `ownership-interest:${id}`),
      batch?.entries.filter((entry) => entry.status === "approved").map((entry) => `finance-group-voucher:${entry.id}`) ?? []);
  } };
}

function relatedPartyProvider(deps: LedgerStatementCloseProviderDependencies): FinanceCloseProvider {
  return buildFinanceCloseWorkpaperProvider("related-party-reconciliation", "ledger-related-party-v2", deps, async (scope) => {
    const facts = canonicalRelatedPartyFacts(await deps.loadRelatedPartyFacts(scope));
    return {
      payload: {
        confirmedRelatedBalanceCount: facts.rows.length,
        expectedTotal: facts.expectedTotal,
        complete: facts.complete,
        closingDebit: money(facts.rows.reduce((sum, row) => sum + row.closingDebit, 0)),
        closingCredit: money(facts.rows.reduce((sum, row) => sum + row.closingCredit, 0)),
        rows: facts.rows,
      },
      blockers: facts.complete ? [] : [blocker("related_party_balance_incomplete", "关联方辅助余额分页读取不完整", workpaperLink("related-party-reconciliation"))],
      evidenceRefs: facts.rows.map((row) => `finance-related-party-balance:${row.id}`),
      voucherRefs: [],
    };
  });
}

function cashflowEquityProvider(deps: LedgerStatementCloseProviderDependencies): FinanceCloseProvider {
  return buildFinanceCloseWorkpaperProvider("cashflow-equity-statements", "finance-cashflow-equity-v2", deps, async (scope) => {
    const facts = await deps.loadStandaloneFacts(scope);
    const inspected = standaloneInspection(scope, facts, "unused");
    const cashFlow = facts.statements.find((row) => row.reportType === "cashFlow");
    const balance = facts.statements.find((row) => row.reportType === "balanceSheet");
    const equityLines = balance?.lines.filter((row) => row.section === "equity") ?? [];
    return {
      payload: {
        cashFlowLineCount: cashFlow?.lines.length ?? 0,
        cashFlowTotals: cashFlow?.totals ?? {},
        equityLineCount: equityLines.length,
        equityLineCodes: equityLines.map((row) => row.lineCode),
      },
      blockers: inspected.blockers,
      evidenceRefs: [
        `finance-statement:${scope.companyCode}:${scope.year}-${scope.month}:cashFlow`,
        `finance-statement:${scope.companyCode}:${scope.year}-${scope.month}:balanceSheet:equity`,
      ],
      voucherRefs: [],
    };
  });
}

function inspection(
  status: FinanceCloseTaskStatus,
  contributorVersion: string,
  deepLink: string,
  payload: unknown,
  blockers: FinanceCloseBlockerDto[] = [],
  evidenceRefs: string[] = [],
  voucherRefs: string[] = [],
): FinanceCloseProviderInspection {
  return {
    status, contributorVersion,
    inputFingerprint: financeCloseInspectionFingerprint({ status, blockers, evidenceRefs, voucherRefs, deepLink, payload }),
    blockers, evidenceRefs, voucherRefs, deepLink, payload,
  };
}

function blocker(code: string, message: string, deepLink: string): FinanceCloseBlockerDto {
  return { code, message, deepLink };
}

function workpaperLink(taskKey: string) {
  return `/finance/ledger?tab=closing&taskKey=${encodeURIComponent(taskKey)}`;
}

function statementsLink() {
  return "/finance/statements";
}

function money(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function moneyToCents(value: number) {
  const correction = value === 0 ? 0 : Math.sign(value) * Number.EPSILON;
  return Math.round((value + correction) * 100);
}
