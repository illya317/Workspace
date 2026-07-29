import type {
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyObjectType,
  FinanceCounterpartyBalanceRow,
  FinanceCounterpartyRelationScope,
  FinanceGroupVoucherDocumentType,
  FinanceLedgerExportMode,
  FinanceLedgerExportView,
  FinanceVoucherPeriodScope,
} from "../../types/ledger";
import type { FinanceGroupAccountUsage } from "../../types/group-account";
import type { StatementPeriodKind } from "@workspace/finance/types/statement-period";
import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import { listFinanceAccounts, type FinanceAccountScope } from "./accounts";
import { listFinanceBalances } from "./balance-api";
import { listCounterpartyBalances } from "./counterparty-balances";
import { buildLedgerWorkbook, type LedgerWorkbookInput } from "./ledger-workbook";
import { listVouchers } from "./voucher-service";
import { listFinanceGroupAccounts } from "./group-accounts";
import { buildGroupVoucherWorkbook } from "./group-voucher-export";
import { workbookFormula } from "../workbook-formula-contract";
import { counterpartyPeriodValidationMessage } from "./counterparty-period";
import { ledgerWorkbookFilename } from "./ledger-workbook-filename";
import { voucherPeriodValidationIssue } from "./voucher-period";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXPORT_PAGE_SIZE = 2000;
const GROUP_DETAIL_EXPORT_PAGE_SIZE = 100;

export interface LedgerExportCommand {
  view: FinanceLedgerExportView;
  companyCode?: string;
  year?: number;
  month?: number;
  periodKind?: StatementPeriodKind;
  keyword?: string;
  subjectLevel?: string;
  scope?: FinanceAccountScope;
  category?: FinanceCounterpartyBalanceCategory;
  relationScope?: FinanceCounterpartyRelationScope;
  objectType?: FinanceCounterpartyObjectType;
  voucherKind?: "standard" | "group";
  documentType?: FinanceGroupVoucherDocumentType;
  origin?: "manual" | "system";
  exportMode?: FinanceLedgerExportMode;
  voucherPeriodScope?: FinanceVoucherPeriodScope;
  policyVersionId?: number;
  accountCategory?: string;
  accountUsage?: FinanceGroupAccountUsage;
  reviewStatus?: "confirmed" | "reviewed" | "pending_review" | "pending_delete";
}

export function buildLedgerExportCommand(input: LedgerExportCommand): DomainValidationResult<LedgerExportCommand> {
  if ((input.view === "balances" || input.view === "counterparty")
    && (!input.companyCode || input.year === undefined || input.month === undefined))
    return failCommand("请选择公司和会计期间后再下载", 400, "companyCode");
  if (input.view === "counterparty" && !input.category) return failCommand("请选择应收应付类型后再下载", 400, "category");
  if (input.view === "counterparty" && input.year !== undefined && input.month !== undefined) {
    const periodKind = input.periodKind ?? "month";
    const periodError = counterpartyPeriodValidationMessage(input.year, input.month, periodKind);
    if (periodError) return failCommand(periodError, 400, "month");
  }
  const voucherIssue = input.view === "vouchers" || input.voucherPeriodScope === "history"
    ? voucherPeriodValidationIssue(input)
    : null;
  if (voucherIssue) return failCommand(voucherIssue.error, 400, voucherIssue.field);
  if (input.exportMode === "detail" && (input.view !== "vouchers" || input.voucherKind !== "group")) {
    return failCommand("明细导出仅适用于合并明细", 400, "exportMode");
  }
  return okCommand(input);
}

export async function executeLedgerExportCommand(command: LedgerExportCommand) {
  const workbook = await loadWorkbookInput(command);
  const filename = ledgerWorkbookFilename(command, workbook.sheetName);
  return new Response(buildLedgerWorkbook(workbook) as unknown as BodyInit, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

async function loadWorkbookInput(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  if (command.view === "accounts") return loadAccountWorkbook(command);
  if (command.view === "groupAccounts") return loadGroupAccountWorkbook(command);
  if (command.view === "vouchers") return loadVoucherWorkbook(command);
  if (command.view === "balances") return loadBalanceWorkbook(command);
  return loadCounterpartyWorkbook(command);
}

async function loadAccountWorkbook(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  const rows = await collectPages(
    (page) => listFinanceAccounts({
      companyCode: command.companyCode,
      year: command.year === undefined ? undefined : String(command.year),
      keyword: command.keyword,
      subjectLevel: command.subjectLevel,
      scope: command.scope ?? "all",
      page,
      pageSize: EXPORT_PAGE_SIZE,
    }),
    (result) => result.data,
  );
  const categories: Record<string, string> = {
    asset: "资产", liability: "负债", equity: "权益", cost: "成本",
    revenue: "收入", expense: "费用", other: "其他",
  };
  return {
    sheetName: "科目设置",
    columns: [
      textColumn("编码", 16), textColumn("名称", 30), textColumn("公司", 14),
      textColumn("类别", 12), textColumn("层级", 10), textColumn("余额方向", 12),
      textColumn("集团科目", 30), textColumn("币种", 10),
      textColumn("父级科目", 30), textColumn("状态", 10),
    ],
    rows: rows.map((row) => [
      row.code,
      row.name,
      row.companyCode ?? "",
      categories[row.category] ?? row.category,
      row.subjectLevel ?? "",
      row.balanceDirection === "debit" ? "借" : "贷",
      row.groupAccount ? `${row.groupAccount.code} ${row.groupAccount.name}` : "",
      row.currency ?? "",
      row.parent ? `${row.parent.code} ${row.parent.name}` : "",
      row.isActive ? "启用" : "停用",
    ]),
  };
}

async function loadVoucherWorkbook(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  const groupExportMode = command.exportMode ?? "summary";
  const vouchers = await collectPages(
    (page) => listVouchers({
      companyCode: command.companyCode,
      year: command.year,
      month: command.month,
      periodKind: command.periodKind,
      voucherPeriodScope: command.voucherPeriodScope,
      keyword: command.keyword,
      page,
      pageSize: command.voucherKind === "group" && groupExportMode === "detail"
        ? GROUP_DETAIL_EXPORT_PAGE_SIZE
        : EXPORT_PAGE_SIZE,
      voucherKind: command.voucherKind ?? "standard",
      includeSourceTraces: command.voucherKind === "group" && groupExportMode === "detail",
      documentType: command.documentType,
      origin: command.origin,
    }),
    (result) => result.data,
  );
  if (command.voucherKind === "group") {
    return buildGroupVoucherWorkbook(vouchers, groupExportMode);
  }
  return {
    sheetName: "凭证明细",
    columns: [
      textColumn("凭证号", 20), textColumn("日期", 14), textColumn("公司", 12),
      textColumn("期间", 12), textColumn("凭证摘要", 32), textColumn("分录序号", 10),
      textColumn("科目编码", 16), textColumn("科目名称", 30), textColumn("分录摘要", 36),
      amountColumn("借方", 16), amountColumn("贷方", 16), textColumn("状态", 12),
    ],
    rows: vouchers.flatMap((voucher) => voucher.items.map((item, index) => [
      voucher.voucherNo,
      dateLabel(voucher.date),
      voucher.companyCode ?? "",
      `${voucher.period.year}年${voucher.period.month}月`,
      voucher.description ?? "",
      index + 1,
      item.account.code,
      item.account.name,
      item.description ?? "",
      Number(item.debit),
      Number(item.credit),
      voucher.status,
    ])),
  };
}

async function loadGroupAccountWorkbook(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  const result = await listFinanceGroupAccounts({
    policyVersionId: command.policyVersionId,
    keyword: command.keyword,
    category: command.accountCategory,
    accountUsage: command.accountUsage,
    reviewStatus: command.reviewStatus,
  });
  return {
    sheetName: "集团科目",
    columns: [
      textColumn("编码", 16), textColumn("名称", 30), textColumn("类别", 12),
      textColumn("余额方向", 12), textColumn("层级", 10), textColumn("币种", 10),
      textColumn("父级科目", 30), textColumn("合并用途", 18), textColumn("对方公司", 12),
      textColumn("取数口径", 14), textColumn("折算方法", 14), textColumn("公司科目映射数", 16),
      textColumn("适用年份", 18), textColumn("复核状态", 12),
    ],
    rows: result.rows.map((row) => [
      row.code,
      row.name,
      groupAccountCategoryLabel(row.category),
      row.balanceDirection === "debit" ? "借" : "贷",
      row.subjectLevel ?? "",
      row.currency ?? "",
      row.parent ? `${row.parent.code} ${row.parent.name}` : "",
      groupAccountConsolidationRoleLabel(row.consolidationRole),
      { none: "不采集", optional: "可选", required: "必填" }[row.counterpartyRequirement],
      { closingBalance: "期末余额", periodMovement: "期间发生额", transaction: "逐笔交易" }[row.movementType],
      { closing: "期末汇率", average: "平均汇率", historical: "历史汇率", transactionDate: "交易日汇率" }[row.translationRateType],
      row.mappingCount,
      row.years.join("、"),
      { confirmed: "已确认", reviewed: "已复核", pending_review: "待复核", pending_delete: "待删除" }[row.reviewStatus],
    ]),
  };
}

async function loadBalanceWorkbook(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  const rows = await collectPages(
    (page) => listFinanceBalances({
      companyCode: command.companyCode,
      year: command.year,
      month: command.month,
      keyword: command.keyword,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    }),
    (result) => result.data ?? result.balances,
  );
  const categories: Record<string, string> = {
    asset: "资产", liability: "负债", equity: "权益", cost: "成本", revenue: "损益",
  };
  return {
    sheetName: "余额表",
    columns: [
      textColumn("科目编码", 16), textColumn("科目名称", 30), textColumn("类别", 12),
      ...balanceColumns(),
    ],
    rows: rows.map((row, index) => {
      const excelRow = index + 2;
      return [
        row.account.code,
        row.account.name,
        categories[row.account.category] ?? row.account.category,
        Number(row.openingDebit),
        Number(row.openingCredit),
        Number(row.currentDebit),
        Number(row.currentCredit),
        workbookFormula(`ROUND(MAX(D${excelRow}-E${excelRow}+F${excelRow}-G${excelRow},0),2)`, Number(row.closingDebit)),
        workbookFormula(`ROUND(MAX(-(D${excelRow}-E${excelRow}+F${excelRow}-G${excelRow}),0),2)`, Number(row.closingCredit)),
      ];
    }),
  };
}

async function loadCounterpartyWorkbook(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  const category = command.category!;
  const rows = await collectPages(
    (page) => listCounterpartyBalances({
      companyCode: command.companyCode!,
      year: command.year!,
      month: command.month!,
      periodKind: command.periodKind ?? "month",
      category,
      keyword: command.keyword,
      relationScope: command.relationScope,
      objectType: command.objectType,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    }),
    (result) => result.data,
  );
  const sheetName = { ar: "应收", ap: "应付", otherAr: "其他应收", otherAp: "其他应付" }[category];
  const nameHeader = category === "ar" ? "客户名称" : category === "ap" ? "供应商名称" : "往来对象名称";
  return {
    sheetName,
    columns: [
      textColumn(nameHeader, 36),
      textColumn("对象类型", 16),
      textColumn("关系性质", 16),
      textColumn("科目", 28),
      ...balanceColumns(),
    ],
    rows: rows.map(counterpartyRow),
  };
}

async function collectPages<T, R extends { totalPages?: number }>(
  load: (page: number) => Promise<R>,
  select: (result: R) => T[],
) {
  const rows: T[] = [];
  let page = 1;
  while (true) {
    const result = await load(page);
    rows.push(...select(result));
    const totalPages = Math.max(1, result.totalPages ?? 1);
    if (page >= totalPages) return rows;
    page += 1;
  }
}

function counterpartyRow(row: FinanceCounterpartyBalanceRow, index: number) {
  const excelRow = index + 2;
  return [
    row.counterpartyName,
    counterpartyObjectKindLabel(row.counterpartyObjectKind),
    row.relatedPartyType ? relatedPartyTypeLabel(row.relatedPartyType) : row.identityMatched ? "非关联方" : "未匹配",
    `${row.accountCode} ${row.accountName}`,
    row.openingDebit,
    row.openingCredit,
    row.currentDebit,
    row.currentCredit,
    workbookFormula(`ROUND(MAX(E${excelRow}-F${excelRow}+G${excelRow}-H${excelRow},0),2)`, row.closingDebit),
    workbookFormula(`ROUND(MAX(-(E${excelRow}-F${excelRow}+G${excelRow}-H${excelRow}),0),2)`, row.closingCredit),
  ];
}

function counterpartyObjectKindLabel(value: FinanceCounterpartyBalanceRow["counterpartyObjectKind"]) {
  return {
    groupCompany: "集团公司",
    customer: "客户",
    supplier: "供应商",
    employee: "员工",
    department: "部门",
    other: "其他单位/个人",
  }[value];
}

function relatedPartyTypeLabel(value: NonNullable<FinanceCounterpartyBalanceRow["relatedPartyType"]>) {
  return {
    group: "集团内",
    joint_venture_associate: "合营/联营",
    investor_influence: "重大影响",
    key_management_related: "管理人员",
    other_related: "其他关联方",
  }[value];
}

function balanceColumns() {
  return [
    amountColumn("期初借方", 16), amountColumn("期初贷方", 16),
    amountColumn("本期借方", 16), amountColumn("本期贷方", 16),
    amountColumn("期末借方", 16), amountColumn("期末贷方", 16),
  ];
}

function textColumn(header: string, width: number) {
  return { header, width };
}

function amountColumn(header: string, width: number) {
  return { header, width, numeric: true };
}

function groupAccountCategoryLabel(value: string) {
  return {
    asset: "资产",
    liability: "负债",
    common: "共同",
    equity: "权益",
    cost: "成本",
    revenue: "收入",
    expense: "费用",
  }[value] ?? value;
}

function groupAccountConsolidationRoleLabel(value: string) {
  return {
    none: "无",
    intercompanyReceivable: "内部应收",
    intercompanyPayable: "内部应付",
    intercompanyRevenue: "内部收入",
    intercompanyExpense: "内部费用",
    investmentInSubsidiary: "对子公司投资",
    shareCapital: "股本",
    capitalReserve: "资本公积",
    dividendReceivable: "应收股利",
    dividendPayable: "应付股利",
    inventory: "存货",
    fixedAsset: "固定资产",
    cashFlow: "现金流",
    difference: "差额",
  }[value] ?? value;
}

function dateLabel(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}
