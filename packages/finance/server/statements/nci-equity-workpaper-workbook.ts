import * as XLSX from "xlsx";

import type { ConsolidatedReportOutputPackage } from "@workspace/finance/types";
import { formulaAwareSheet, workbookFormula, type FinanceWorkbookCell } from "../workbook-formula-contract";

const AMOUNT_FORMAT = "#,##0.00;[Red]-#,##0.00;;@";

export function buildNciEquityWorkpaperWorkbook(report: ConsolidatedReportOutputPackage): Buffer {
  const workpaper = report.nciEquityWorkpaper;
  if (!workpaper) throw new Error("缺少少数股东权益变动底稿");
  const rows: FinanceWorkbookCell[][] = [
    ["少数股东权益变动表", "", ""],
    [`编制单位：${report.batch.parentCompanyName}`, `${report.batch.year}.${String(report.batch.month).padStart(2, "0")}`, "单位：元"],
    ["项目", "金额", "来源/勾稽"],
    ["期初少数股东权益", workpaper.openingBalance, "上期已锁定合并报表"],
    ["加：少数股东投入", workpaper.contributions, "有日期的合并凭证"],
    ["加：少数股东应占净利润", workpaper.profitLoss, "逐自然月合并凭证"],
    ["加：少数股东应占其他综合收益", workpaper.otherComprehensiveIncome, "逐项OCI合并凭证"],
    ["减：向少数股东分红", workpaper.distributions, "分红合并凭证"],
    ["加减：持股比例变化", workpaper.ownershipChanges, "股权交易合并凭证"],
    ["加减：其他有证据调整", workpaper.otherAdjustments, "仅限已分类并批准的凭证"],
    ["变动表计算期末余额", workbookFormula("ROUND(B4+SUM(B5:B10),2)", workpaper.calculatedClosingBalance), "连续权益变动"],
    ["合并资产负债表期末余额", workpaper.reportedClosingBalance, "正式/预览合并报表"],
    ["变动表勾稽差异", workbookFormula("ROUND(B12-B11,2)", workpaper.rollforwardDifference), workpaper.status === "reconciled" ? "已勾稽" : "必须查明，不自动入账"],
    ["期末净资产×有效少数股东比例", workpaper.netAssetsCrossCheck, "仅作独立交叉复核"],
    ["比例复核差异", workbookFormula("ROUND(B12-B14,2)", workpaper.crossCheckDifference), "不生成补数凭证"],
    [],
    ["日期", "主体", "变动类型", "合并凭证", "少数股东份额", "来源与证据"],
    ...workpaper.movements.map((movement) => [
      movement.postingDate ?? "期初",
      movement.companyName ? `${movement.companyCode ?? ""} ${movement.companyName}` : "集团",
      movement.label,
      movement.entryNo ?? "—",
      movement.amount,
      movement.evidence,
    ]),
  ];
  const sheet = formulaAwareSheet(rows);
  sheet["!merges"] = [XLSX.utils.decode_range("A1:C1")];
  sheet["!cols"] = [{ wch: 34 }, { wch: 24 }, { wch: 28 }, { wch: 20 }, { wch: 18 }, { wch: 70 }];
  for (let row = 4; row <= rows.length; row += 1) {
    for (const column of [2, 5]) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row - 1, c: column - 1 })];
      if (cell && typeof cell.v === "number") cell.z = AMOUNT_FORMAT;
    }
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "少数股东权益变动底稿");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function nciEquityWorkpaperFilename(report: ConsolidatedReportOutputPackage) {
  const entity = report.batch.parentCompanyName.replace(/[\\/:*?"<>|]/g, "_");
  return `${entity}-${report.batch.year}.${String(report.batch.month).padStart(2, "0")}-少数股东底稿.xlsx`;
}
