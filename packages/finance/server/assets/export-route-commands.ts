import type { FinanceAssetExportView, FinanceAssetPeriodRowDto } from "../../types/assets";
import { matchAnyField } from "@workspace/platform/search";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { buildLedgerWorkbook, type LedgerWorkbookInput } from "../ledger/ledger-workbook";
import { workbookFormula, type FinanceWorkbookCell } from "../workbook-formula-contract";
import { listFinanceAssetWorkspace } from "./service";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const cents = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

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
      ? assetPeriodWorkbook(workspace.periodRows, { year: command.year!, month: command.month! }, command.keyword)
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

export function assetPeriodWorkbook(
  rows: FinanceAssetPeriodRowDto[],
  scope: { year: number; month: number },
  keyword?: string,
): LedgerWorkbookInput {
  const filtered = filterRows(rows, keyword, (row) => ({ assetCode: row.assetCode, name: row.name, accountCode: row.accountCode }));
  const periodEndDate = new Date(Date.UTC(scope.year, scope.month, 0)).toISOString().slice(0, 10);
  return {
    sheetName: "本期折旧摊销",
    columns: [
      textColumn("资产编号", 18), textColumn("资产名称", 30), textColumn("累计科目", 16),
      textColumn("起算日期", 14), amountColumn("原值", 16), amountColumn("残值率", 12),
      amountColumn("残值额", 14), amountColumn("期限（月）", 12), amountColumn("减值（期初）", 14),
      amountColumn("应折旧额", 16), amountColumn("月折旧额", 14), amountColumn("期初累计", 16),
      amountColumn("正常计算", 16), amountColumn("调整", 16), amountColumn("本期入账", 16),
      textColumn("凭证", 20),
    ],
    rows: filtered.map((row, index) => assetPeriodWorkbookRow(row, index + 2, periodEndDate)),
  };
}

function assetPeriodWorkbookRow(
  row: FinanceAssetPeriodRowDto,
  excelRow: number,
  periodEndDate: string,
): FinanceWorkbookCell[] {
  const standard = row.initializationMode === "standard";
  // 复核可见链：工作簿内可见前驱重算的结果必须与后台口径分毫不差，否则派生列整体冻结为数值。
  const residualVisible = cents(row.originalCost * row.residualRate);
  const depreciableVisible = Math.max(0, cents(row.originalCost - residualVisible - row.impairmentBefore));
  const monthlyVisible = row.usefulLifeMonths != null ? cents(depreciableVisible / row.usefulLifeMonths) : null;
  const normalVisible = monthlyVisible != null
    ? Math.max(0, cents(Math.min(monthlyVisible, depreciableVisible - row.accumulatedBefore)))
    : null;
  const chainMatches = standard && row.impairmentBefore === 0 && monthlyVisible != null
    && monthlyVisible === row.monthlyAmount && normalVisible === row.normalAmount;
  const started = row.depreciationStartDate != null && row.depreciationStartDate <= periodEndDate;
  let residualValueCell: FinanceWorkbookCell = "";
  let depreciableCell: FinanceWorkbookCell = "";
  let monthlyCell: FinanceWorkbookCell = "";
  let normalCell: FinanceWorkbookCell = row.normalAmount;
  if (standard) {
    residualValueCell = workbookFormula(`ROUND(E${excelRow}*F${excelRow},2)`, residualVisible);
    if (chainMatches && monthlyVisible != null) {
      depreciableCell = workbookFormula(`MAX(0,ROUND(E${excelRow}-G${excelRow}-I${excelRow},2))`, depreciableVisible);
      monthlyCell = workbookFormula(`ROUND(J${excelRow}/H${excelRow},2)`, monthlyVisible);
      normalCell = started
        ? workbookFormula(`MAX(0,MIN(K${excelRow},J${excelRow}-L${excelRow}))`, row.normalAmount)
        : row.normalAmount;
    } else if (row.impairmentBefore === 0 && row.usefulLifeMonths != null) {
      // 一分钱舍入边界：可见链复核未通过，派生列冻结为后台数值，保证表内自洽。
      depreciableCell = depreciableVisible;
      monthlyCell = row.monthlyAmount ?? "";
    } else {
      depreciableCell = workbookFormula(`MAX(0,ROUND(E${excelRow}-G${excelRow}-I${excelRow},2))`, depreciableVisible);
    }
  }
  return [
    row.assetCode, row.name, row.accountCode, row.depreciationStartDate ?? "",
    row.originalCost, standard ? row.residualRate : "", residualValueCell,
    row.usefulLifeMonths ?? "", row.impairmentBefore, depreciableCell, monthlyCell,
    row.accumulatedBefore, normalCell, row.adjustmentAmount,
    workbookFormula(`ROUND(M${excelRow}+N${excelRow},2)`, row.periodAmount), row.voucherNo ?? "待关联",
  ];
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
