import type { FinanceCloseCatalogItem, FinanceCloseScope } from "../../types/close";

export const FINANCE_CLOSE_TASK_CATALOG = [
  item(1, "inventory-records", "inventory.operations.records", "inventory.operations", "存货记录", "/inventory/operations", "完整的期间存货收发存记录"),
  item(2, "inventory-count-differences", "inventory.operations.count-differences", "inventory.operations", "盘点差异复核入账", "/inventory/operations", "盘点差异复核结论及入账证据"),
  item(3, "bank-receipts", "finance.treasury.receipts", "finance.treasury", "银行回单收集", "/finance/treasury?view=bank-reconciliation", "期间银行回单完整性证据"),
  item(4, "bank-reconciliation", "finance.treasury.reconciliation", "finance.treasury", "银行对账及余额调节", "/finance/treasury?view=bank-reconciliation", "已勾稽的银行对账及余额调节底稿"),
  item(5, "loans-and-interest", "finance.treasury.interest", "finance.treasury", "借款增减及利息计提", "/finance/treasury?view=interest", "借款变动、利息底稿及凭证勾稽证据"),
  item(6, "employee-reimbursements", "finance.ledger.employee-reimbursements", "finance.ledger", "员工报销入账", "/finance/ledger", "期间员工报销完整入账证据"),
  item(7, "payroll-accruals", "finance.ledger.payroll-accruals", "finance.ledger", "工资社保奖金公积金计提", "/finance/ledger", "工资社保奖金公积金计提及凭证证据"),
  item(8, "contract-and-rd-assessment", "finance.ledger.contract-rd-assessment", "finance.ledger", "合同履约与研发费用评估", "/finance/ledger", "合同履约与研发费用评估结论"),
  item(9, "asset-movements", "finance.assets.movements", "finance.assets", "资产及长期待摊增减", "/finance/assets", "资产及长期待摊增减记录"),
  item(10, "depreciation-amortization", "finance.assets.depreciation", "finance.assets", "折旧摊销", "/finance/assets", "期间折旧摊销计算及凭证勾稽证据"),
  item(11, "asset-inventory-estimates", "finance.ledger.asset-inventory-estimates", "finance.ledger", "资产存货暂估", "/finance/ledger", "资产和存货暂估依据及入账证据"),
  item(12, "expense-cost-accruals", "finance.ledger.expense-cost-accruals", "finance.ledger", "费用成本预提", "/finance/ledger", "费用成本预提依据及入账证据"),
  item(13, "advance-receipts-review", "finance.ledger.advance-receipts", "finance.ledger", "预收账款审核入账", "/finance/ledger", "预收账款审核及入账证据"),
  item(14, "other-receivables-review", "finance.ledger.other-receivables", "finance.ledger", "其他应收审核入账", "/finance/ledger", "其他应收款审核及入账证据"),
  item(15, "asset-impairment", "finance.assets.impairment", "finance.assets", "资产减值", "/finance/assets", "资产减值测试及会计处理证据"),
  item(16, "payables-and-prepayments", "finance.ledger.payables-prepayments", "finance.ledger", "应付预付及其他应付", "/finance/ledger", "应付预付及其他应付余额审核证据"),
  item(17, "contract-execution-review", "finance.ledger.contract-execution", "finance.ledger", "合同执行检查", "/finance/ledger", "重大合同执行情况检查结论"),
  item(18, "tax-accruals", "finance.tax.accrual", "finance.tax", "税金计提", "/finance/tax?view=accrual", "税金计提、申报缴款及勾稽证据"),
  item(19, "fx-and-profit-closing", "finance.ledger.fx-profit-closing", "finance.ledger", "汇兑及月损益结转", "/finance/ledger", "汇兑损益及月末损益结转凭证"),
  item(20, "account-usage-review", "finance.ledger.account-usage", "finance.ledger", "科目使用检查", "/finance/ledger", "科目使用及异常余额检查结论"),
  item(21, "standalone-statements", "finance.statements.standalone", "finance.statements", "单体财务报表", "/finance/statements", "单体财务报表及总账勾稽证据"),
  item(22, "group-accounting-adjustments", "finance.statements.group-adjustments", "finance.statements", "合并层面科目/准则调整", "/finance/statements", "合并层面科目及准则调整底稿"),
  item(23, "related-party-reconciliation", "finance.ledger.related-party-reconciliation", "finance.ledger", "关联方清单与对账", "/finance/ledger", "关联方清单、余额及交易对账证据"),
  item(24, "unusual-transactions-contingencies", "finance.ledger.unusual-contingencies", "finance.ledger", "非常规交易及或有事项", "/finance/ledger", "非常规交易及或有事项评估结论"),
  item(25, "consolidated-statements", "finance.statements.consolidated", "finance.statements", "合并报表", "/finance/statements", "合并工作底稿及合并报表证据"),
  item(26, "cashflow-equity-statements", "finance.statements.cashflow-equity", "finance.statements", "现金流量/权益变动表", "/finance/statements", "现金流量表及权益变动表编制证据"),
  item(27, "close-process-review", "finance.close.process-review", "finance.ledger", "关账流程复核", "/finance/ledger?tab=closing", "关账任务完整性与例外复核结论"),
] as const satisfies readonly FinanceCloseCatalogItem[];

function item(
  sequence: number,
  taskKey: string,
  contributorKey: string,
  ownerResourceKey: string,
  label: string,
  deepLink: string,
  requiredEvidence: string,
): FinanceCloseCatalogItem {
  return { sequence, taskKey, contributorKey, ownerResourceKey, label, deepLink, requiredEvidence };
}

export function financeCloseDeepLink(deepLink: string, scope: FinanceCloseScope) {
  const url = new URL(deepLink, "http://workspace.local");
  url.searchParams.set("companyCode", scope.companyCode);
  url.searchParams.set("year", String(scope.year));
  url.searchParams.set("month", String(scope.month));
  return `${url.pathname}${url.search}`;
}

export function financeCloseCatalogByTaskKey(taskKey: string) {
  return FINANCE_CLOSE_TASK_CATALOG.find((item) => item.taskKey === taskKey) ?? null;
}
