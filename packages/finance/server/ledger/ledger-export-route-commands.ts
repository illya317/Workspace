import type {
  FinanceAssetExportView,
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyBalanceRow,
  FinanceGroupVoucherDocumentType,
  FinanceLedgerExportView,
} from "../../types/ledger";
import type { FinanceGroupAccountUsage } from "../../types/group-account";
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
import { listFinanceAssetWorkspace } from "../assets/service";
import { matchAnyField } from "@workspace/platform/search";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const EXPORT_PAGE_SIZE = 2000;

export interface LedgerExportCommand {
  view: FinanceLedgerExportView;
  companyCode?: string;
  year?: number;
  month?: number;
  keyword?: string;
  subjectLevel?: string;
  scope?: FinanceAccountScope;
  category?: FinanceCounterpartyBalanceCategory;
  voucherKind?: "standard" | "group";
  documentType?: FinanceGroupVoucherDocumentType;
  origin?: "manual" | "system";
  policyVersionId?: number;
  accountCategory?: string;
  accountUsage?: FinanceGroupAccountUsage;
  reviewStatus?: "confirmed" | "reviewed" | "pending_review" | "pending_delete";
  assetView?: FinanceAssetExportView;
}

export function buildLedgerExportCommand(input: LedgerExportCommand): DomainValidationResult<LedgerExportCommand> {
  if ((input.view === "balances" || input.view === "counterparty")
    && (!input.companyCode || input.year === undefined || input.month === undefined)) {
    return failCommand("请选择公司和会计期间后再下载", 400, "companyCode");
  }
  if (input.view === "counterparty" && !input.category) {
    return failCommand("请选择应收应付类型后再下载", 400, "category");
  }
  if (input.view === "assets"
    && (!input.companyCode || input.year === undefined || input.month === undefined)) {
    return failCommand("请选择公司和会计期间后再下载", 400, "companyCode");
  }
  if (input.view === "assets" && !input.assetView) {
    return failCommand("请选择折旧摊销页签后再下载", 400, "assetView");
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
  if (command.view === "counterparty") return loadCounterpartyWorkbook(command);
  return loadAssetWorkbook(command);
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
  const vouchers = await collectPages(
    (page) => listVouchers({
      companyCode: command.companyCode,
      year: command.year,
      month: command.month,
      keyword: command.keyword,
      page,
      pageSize: EXPORT_PAGE_SIZE,
      voucherKind: command.voucherKind ?? "standard",
      documentType: command.documentType,
      origin: command.origin,
    }),
    (result) => result.data,
  );
  if (command.voucherKind === "group") {
    return {
      sheetName: "合并明细",
      columns: [
        textColumn("凭证号", 20), textColumn("凭证日期", 14), textColumn("发生日期", 14),
        textColumn("合并主体", 28), textColumn("分录序号", 10), textColumn("科目编码", 16),
        textColumn("科目名称", 30), textColumn("公司主体", 18),
        amountColumn("借方", 16), amountColumn("贷方", 16), textColumn("状态", 12),
      ],
      rows: vouchers.flatMap((voucher) => voucher.items.map((item, index) => [
        voucher.voucherNo,
        dateLabel(voucher.date),
        "sourceDate" in item ? item.sourceDate ?? "" : "",
        voucher.description ?? "",
        index + 1,
        item.account.code,
        item.account.name,
        "entityName" in item ? item.entityName ?? "" : "",
        Number(item.debit),
        Number(item.credit),
        voucher.status,
      ])),
    };
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
    rows: rows.map((row) => [
      row.account.code,
      row.account.name,
      categories[row.account.category] ?? row.account.category,
      Number(row.openingDebit),
      Number(row.openingCredit),
      Number(row.currentDebit),
      Number(row.currentCredit),
      Number(row.closingDebit),
      Number(row.closingCredit),
    ]),
  };
}

async function loadCounterpartyWorkbook(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  const category = command.category!;
  const rows = await collectPages(
    (page) => listCounterpartyBalances({
      companyCode: command.companyCode!,
      year: command.year!,
      month: command.month!,
      category,
      keyword: command.keyword,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    }),
    (result) => result.data,
  );
  const sheetName = { ar: "应收", ap: "应付", otherAr: "其他应收", otherAp: "其他应付" }[category];
  const nameHeader = category === "ar" ? "客户名称" : category === "ap" ? "供应商名称" : "往来对象名称";
  return {
    sheetName,
    columns: [textColumn(nameHeader, 36), ...balanceColumns()],
    rows: rows.map(counterpartyRow),
  };
}

async function loadAssetWorkbook(command: LedgerExportCommand): Promise<LedgerWorkbookInput> {
  const workspace = await listFinanceAssetWorkspace({
    companyCode: command.companyCode!,
    year: command.year!,
    month: command.month!,
  });
  const view = command.assetView!;
  if (view === "cards") return assetCardWorkbook(workspace.cards, command.keyword);
  if (view === "period") return assetPeriodWorkbook(workspace.periodRows, command.keyword);
  if (view === "adjustments") return assetAdjustmentWorkbook(workspace.adjustments, command.keyword);
  return assetReconciliationWorkbook(workspace.reconciliation, command.keyword);
}

function assetCardWorkbook(
  rows: Awaited<ReturnType<typeof listFinanceAssetWorkspace>>["cards"],
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterExportRows(rows, keyword, (row) => ({
    assetCode: row.assetCode,
    name: row.name,
    category: row.category,
    assetAccountCode: row.assetAccountCode,
  }));
  return {
    sheetName: "资产卡片",
    columns: [
      textColumn("资产编号", 18), textColumn("资产名称", 30), textColumn("类型", 18),
      textColumn("资产科目", 16), textColumn("累计折旧摊销科目", 20), textColumn("取得日期", 14),
      textColumn("起算日期", 14), amountColumn("入账原值", 16), textColumn("残值率", 12),
      textColumn("期限（月）", 12), amountColumn("期初累计金额", 16), textColumn("状态", 12),
    ],
    rows: filtered.map((row) => [
      row.assetCode,
      row.name,
      assetKindLabel(row.assetKind),
      row.assetAccountCode,
      row.accumulatedAccountCode ?? "",
      row.acquisitionDate ?? "",
      row.depreciationStartDate ?? "",
      row.originalCost,
      `${row.residualRate * 100}%`,
      row.usefulLifeMonths ?? "",
      row.openingAccumulatedAmount,
      row.status === "active" ? "使用中" : row.status,
    ]),
  };
}

function assetPeriodWorkbook(
  rows: Awaited<ReturnType<typeof listFinanceAssetWorkspace>>["periodRows"],
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterExportRows(rows, keyword, (row) => ({
    assetCode: row.assetCode,
    name: row.name,
    accountCode: row.accountCode,
  }));
  return {
    sheetName: "本期折旧摊销",
    columns: [
      textColumn("资产编号", 18), textColumn("资产名称", 30), textColumn("累计科目", 16),
      textColumn("起算日期", 14), amountColumn("原值", 16), amountColumn("正常计算", 16),
      amountColumn("调整", 16), amountColumn("本期入账", 16), textColumn("凭证", 20),
    ],
    rows: filtered.map((row) => [
      row.assetCode, row.name, row.accountCode, row.depreciationStartDate ?? "",
      row.originalCost, row.normalAmount, row.adjustmentAmount, row.periodAmount, row.voucherNo ?? "待关联",
    ]),
  };
}

function assetAdjustmentWorkbook(
  rows: Awaited<ReturnType<typeof listFinanceAssetWorkspace>>["adjustments"],
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterExportRows(rows, keyword, (row) => ({
    accountCode: row.accountCode,
    assetName: row.assetName,
    reason: row.reason,
    voucherNo: row.voucherNo,
  }));
  return {
    sheetName: "调整事项",
    columns: [
      textColumn("累计科目", 16), textColumn("关联资产", 30), amountColumn("调整金额", 16),
      textColumn("调整原因", 40), textColumn("凭证", 20), textColumn("来源", 24), textColumn("状态", 12),
    ],
    rows: filtered.map((row) => [
      row.accountCode,
      row.assetName ?? "期间级调整",
      row.amount,
      row.reason,
      row.voucherNo ?? "待关联",
      row.sourceSheet ? `${row.sourceSheet}${row.sourceRow ? ` 第${row.sourceRow}行` : ""}` : "手工",
      row.status === "confirmed" ? "已确认" : row.status,
    ]),
  };
}

function assetReconciliationWorkbook(
  rows: Awaited<ReturnType<typeof listFinanceAssetWorkspace>>["reconciliation"],
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterExportRows(rows, keyword, (row) => ({ accountCode: row.accountCode, status: row.status }));
  return {
    sheetName: "折旧摊销勾稽",
    columns: [
      textColumn("科目", 16), amountColumn("折旧摊销表", 16), amountColumn("关联凭证", 16),
      amountColumn("总账本期净额", 16), amountColumn("凭证差异", 16), amountColumn("总账差异", 16),
      textColumn("勾稽", 12),
    ],
    rows: filtered.map((row) => [
      row.accountCode, row.scheduleAmount, row.voucherAmount, row.ledgerAmount,
      row.voucherDifference, row.ledgerDifference, row.status === "matched" ? "已勾稽" : "有差异",
    ]),
  };
}

function filterExportRows<T>(
  rows: T[],
  keyword: string | undefined,
  fields: (row: T) => Record<string, unknown>,
) {
  return keyword ? rows.filter((row) => matchAnyField(fields(row), keyword)) : rows;
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

function counterpartyRow(row: FinanceCounterpartyBalanceRow): Array<string | number> {
  return [
    row.counterpartyName,
    row.openingDebit,
    row.openingCredit,
    row.currentDebit,
    row.currentCredit,
    row.closingDebit,
    row.closingCredit,
  ];
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

function assetKindLabel(value: string) {
  return {
    fixed_asset: "固定资产",
    intangible: "无形资产",
    prepaid: "预付及其他流动资产",
    long_term_deferred: "长期待摊费用",
  }[value] ?? value;
}

function dateLabel(value: Date | string) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function ledgerWorkbookFilename(command: LedgerExportCommand, sheetName: string) {
  const company = command.companyCode || "全部公司";
  const period = command.year === undefined
    ? "全部期间"
    : command.month === undefined
      ? String(command.year)
      : `${command.year}.${String(command.month).padStart(2, "0")}`;
  return `${company}-${period}-${sheetName}.xlsx`.replace(/[\\/:*?"<>|]/g, "_");
}
