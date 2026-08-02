import type { FinanceAssetExportView } from "../../types/assets";
import { matchAnyField } from "@workspace/platform/search";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { buildLedgerWorkbook, type LedgerWorkbookInput } from "../ledger/ledger-workbook";
import { workbookFormula } from "../workbook-formula-contract";
import { listFinanceAssetWorkspace } from "./service";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface FinanceAssetExportCommand {
  view: FinanceAssetExportView;
  companyCode?: string;
  year?: number;
  month?: number;
  keyword?: string;
}

export function buildFinanceAssetExportCommand(
  input: FinanceAssetExportCommand,
): DomainValidationResult<FinanceAssetExportCommand> {
  if (!input.companyCode || input.year === undefined || input.month === undefined) {
    return failCommand("请选择公司和会计期间后再下载", 400, "companyCode");
  }
  return okCommand(input);
}

export async function executeFinanceAssetExportCommand(command: FinanceAssetExportCommand) {
  const workspace = await listFinanceAssetWorkspace({
    companyCode: command.companyCode!,
    year: command.year!,
    month: command.month!,
  });
  const workbook = command.view === "cards"
    ? assetCardWorkbook(workspace.cards, command.keyword)
    : command.view === "period"
      ? assetPeriodWorkbook(workspace.periodRows, command.keyword)
      : assetAdjustmentWorkbook(workspace.adjustments, command.keyword);
  const filename = `${command.companyCode}-${command.year}.${String(command.month).padStart(2, "0")}-${workbook.sheetName}.xlsx`
    .replace(/[\\/:*?"<>|]/g, "_");
  return new Response(buildLedgerWorkbook(workbook) as unknown as BodyInit, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

function assetCardWorkbook(
  rows: Awaited<ReturnType<typeof listFinanceAssetWorkspace>>["cards"],
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterRows(rows, keyword, (row) => ({
    assetCode: row.assetCode, name: row.name, category: row.categoryName, assetAccountCode: row.assetAccountCode,
  }));
  return {
    sheetName: "资产卡片",
    columns: [
      textColumn("资产编号", 18), textColumn("资产名称", 30), textColumn("类型", 18),
      textColumn("资产分类", 20), textColumn("资产科目", 16), textColumn("累计折旧摊销科目", 20), textColumn("取得日期", 14),
      textColumn("起算日期", 14), amountColumn("入账原值", 16), textColumn("残值率", 12),
      textColumn("期限（月）", 12), amountColumn("期初累计金额", 16), textColumn("状态", 12),
    ],
    rows: filtered.map((row) => [
      row.assetCode, row.name, assetKindLabel(row.assetKind), row.categoryName, row.assetAccountCode,
      row.accumulatedAccountCode ?? "", row.acquisitionDate ?? "", row.depreciationStartDate ?? "",
      row.originalCost, `${row.residualRate * 100}%`, row.usefulLifeMonths ?? "",
      row.openingAccumulatedAmount, row.status === "active" ? "使用中" : row.status,
    ]),
  };
}

function assetPeriodWorkbook(
  rows: Awaited<ReturnType<typeof listFinanceAssetWorkspace>>["periodRows"],
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterRows(rows, keyword, (row) => ({ assetCode: row.assetCode, name: row.name, accountCode: row.accountCode }));
  return {
    sheetName: "本期折旧摊销",
    columns: [
      textColumn("资产编号", 18), textColumn("资产名称", 30), textColumn("累计科目", 16),
      textColumn("起算日期", 14), amountColumn("原值", 16), amountColumn("正常计算", 16),
      amountColumn("调整", 16), amountColumn("本期入账", 16), textColumn("凭证", 20),
    ],
    rows: filtered.map((row, index) => {
      const excelRow = index + 2;
      return [
        row.assetCode, row.name, row.accountCode, row.depreciationStartDate ?? "",
        row.originalCost, row.normalAmount, row.adjustmentAmount,
        workbookFormula(`ROUND(F${excelRow}+G${excelRow},2)`, row.periodAmount), row.voucherNo ?? "待关联",
      ];
    }),
  };
}

function assetAdjustmentWorkbook(
  rows: Awaited<ReturnType<typeof listFinanceAssetWorkspace>>["adjustments"],
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterRows(rows, keyword, (row) => ({
    accountCode: row.accountCode, assetName: row.assetName, reason: row.reason, voucherNo: row.voucherNo,
  }));
  return {
    sheetName: "历史调整",
    columns: [
      textColumn("累计科目", 16), textColumn("关联资产", 30), amountColumn("调整金额", 16),
      textColumn("调整原因", 40), textColumn("凭证", 20), textColumn("来源", 24), textColumn("状态", 12),
    ],
    rows: filtered.map((row) => [
      row.accountCode, row.assetName ?? "期间级调整", row.amount, row.reason, row.voucherNo ?? "待关联",
      row.sourceSheet ? `${row.sourceSheet}${row.sourceRow ? ` 第${row.sourceRow}行` : ""}` : "手工",
      row.status === "confirmed" ? "已确认" : row.status,
    ]),
  };
}

function filterRows<T>(rows: T[], keyword: string | undefined, fields: (row: T) => Record<string, unknown>) {
  return keyword ? rows.filter((row) => matchAnyField(fields(row), keyword)) : rows;
}

function textColumn(header: string, width: number) {
  return { header, width };
}

function amountColumn(header: string, width: number) {
  return { header, width, numeric: true };
}

function assetKindLabel(value: string) {
  return {
    fixed_asset: "固定资产",
    intangible: "无形资产",
    prepaid: "预付及其他流动资产",
    long_term_deferred: "长期待摊费用",
  }[value] ?? value;
}
