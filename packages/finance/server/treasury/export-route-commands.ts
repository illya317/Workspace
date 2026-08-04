import type { TreasuryInterestWorkpaperDto, TreasuryWorkspaceDto } from "../../types/treasury";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { buildLedgerWorkbook, type LedgerWorkbookInput } from "../ledger/ledger-workbook";
import { workbookFormula, type FinanceWorkbookCell } from "../workbook-formula-contract";
import { listTreasuryWorkspace } from "./service";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface TreasuryInterestExportCommand {
  companyCode?: string;
  year?: number;
  month?: number;
}

export function buildTreasuryInterestExportCommand(
  input: TreasuryInterestExportCommand,
): DomainValidationResult<TreasuryInterestExportCommand> {
  if (!input.companyCode || input.year === undefined || input.month === undefined) {
    return failCommand("请选择公司和会计期间后再下载", 400, "companyCode");
  }
  return okCommand(input);
}

export async function executeTreasuryInterestExportCommand(command: TreasuryInterestExportCommand) {
  const workspace = await listTreasuryWorkspace({
    companyCode: command.companyCode!,
    year: command.year!,
    month: command.month!,
  });
  const filename = `${command.companyCode}-${command.year}.${String(command.month).padStart(2, "0")}-利息底稿.xlsx`
    .replace(/[\\/:*?"<>|]/g, "_");
  return new Response(buildLedgerWorkbook(treasuryInterestWorkbook(workspace)) as unknown as BodyInit, {
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      "Cache-Control": "no-store",
    },
  });
}

export function treasuryInterestWorkbook(workspace: TreasuryWorkspaceDto): LedgerWorkbookInput {
  const rows: FinanceWorkbookCell[][] = [];
  for (const workpaper of workspace.interestWorkpapers) {
    rows.push(...interestWorkpaperRows(workpaper, rows.length + 2, workspace));
  }
  return {
    sheetName: "利息底稿",
    columns: [
      textColumn("借款", 28), textColumn("底稿状态", 12), textColumn("计息口径", 16),
      textColumn("行号", 8), textColumn("计息开始", 14), textColumn("计息结束", 14),
      amountColumn("计息天数", 12), amountColumn("年基准天数", 12), amountColumn("计息本金", 16),
      amountColumn("年利率", 12), amountColumn("计算利息", 14), amountColumn("来源利息", 14),
      amountColumn("来源差额", 12), amountColumn("凭证金额", 14), amountColumn("凭证差额", 12),
    ],
    rows,
  };
}

function interestWorkpaperRows(
  workpaper: TreasuryInterestWorkpaperDto,
  firstExcelRow: number,
  workspace: TreasuryWorkspaceDto,
): FinanceWorkbookCell[][] {
  const loan = workspace.loans.find((item) => item.id === workpaper.loanId);
  const loanLabel = loan ? `${loan.loanNo} · ${loan.name}` : "未识别借款合同";
  const statusLabel = treasuryStatusLabel(workpaper.status);
  const conventionLabel = dayCountConventionLabel(workpaper.dayCountConvention);
  const divisor = workpaper.dayCountConvention === "actual_365" ? 365 : 360;
  const detailRows = workpaper.lines.map((line, index) => {
    const excelRow = firstExcelRow + index;
    return [
      loanLabel, statusLabel, conventionLabel, line.lineNo, line.accrualFrom, line.accrualThrough,
      line.dayCount, divisor, line.principalBasis, line.annualRate,
      workbookFormula(`ROUND(I${excelRow}*J${excelRow}*G${excelRow}/H${excelRow},2)`, line.calculatedAmount),
      line.sourceReportedInterestAmount ?? "",
      line.sourceDifference != null
        ? workbookFormula(`ROUND(K${excelRow}-L${excelRow},2)`, line.sourceDifference)
        : "",
      "", "",
    ] satisfies FinanceWorkbookCell[];
  });
  const totalExcelRow = firstExcelRow + detailRows.length;
  const calculation = workpaper.calculation;
  const totalRow: FinanceWorkbookCell[] = detailRows.length > 0 ? [
    "", "", "", "合计", "", "", "", "", "", "",
    workbookFormula(`ROUND(SUM(K${firstExcelRow}:K${totalExcelRow - 1}),2)`, calculation.calculatedAmount),
    calculation.sourceReportedAmount != null
      ? workbookFormula(`ROUND(SUM(L${firstExcelRow}:L${totalExcelRow - 1}),2)`, calculation.sourceReportedAmount)
      : "",
    calculation.sourceDifference != null
      ? workbookFormula(`ROUND(K${totalExcelRow}-L${totalExcelRow},2)`, calculation.sourceDifference)
      : "",
    calculation.voucherAmount,
    workbookFormula(`ROUND(K${totalExcelRow}-N${totalExcelRow},2)`, calculation.voucherDifference),
  ] : [
    "", "", "", "合计", "", "", "", "", "", "",
    calculation.calculatedAmount, calculation.sourceReportedAmount ?? "", calculation.sourceDifference ?? "",
    calculation.voucherAmount, calculation.voucherDifference,
  ];
  return [...detailRows, totalRow];
}

function treasuryStatusLabel(status: string) {
  return ({
    draft: "草稿",
    prepared: "已编制",
    reconciled: "已核对",
    blocked: "有阻断",
  } as Record<string, string>)[status] ?? status;
}

function dayCountConventionLabel(convention: TreasuryInterestWorkpaperDto["dayCountConvention"]) {
  return ({
    actual_365: "实际天数 / 365",
    actual_360: "实际天数 / 360",
    "30_360": "30 / 360",
  } as Record<string, string>)[convention] ?? convention;
}

function textColumn(header: string, width: number) {
  return { header, width };
}

function amountColumn(header: string, width: number) {
  return { header, width, numeric: true };
}
