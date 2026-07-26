import type {
  FinanceCounterpartyBalanceCategory,
  FinanceCounterpartyBalanceRow,
  FinanceLedgerExportView,
} from "../../types/ledger";
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
}

export function buildLedgerExportCommand(input: LedgerExportCommand): DomainValidationResult<LedgerExportCommand> {
  if ((input.view === "balances" || input.view === "counterparty")
    && (!input.companyCode || input.year === undefined || input.month === undefined)) {
    return failCommand("请选择公司和会计期间后再下载", 400, "companyCode");
  }
  if (input.view === "counterparty" && !input.category) {
    return failCommand("请选择应收应付类型后再下载", 400, "category");
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
  const vouchers = await collectPages(
    (page) => listVouchers({
      companyCode: command.companyCode,
      year: command.year,
      month: command.month,
      keyword: command.keyword,
      page,
      pageSize: EXPORT_PAGE_SIZE,
    }),
    (result) => result.data,
  );
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
