import type * as XLSX from "xlsx";
import { fixedCategoryCandidate } from "./current-period-category";
import type { AssetWorkbookBlocker, AssetWorkbookControl, AssetWorkbookScope, ParsedCurrentPeriodAsset } from "./current-period-workbook-types";
import { cellNumber, cellText, factRange, money, openingAsOfDate, parseSourceDate, readRows, recordControl, recordPeriodEvidence, sourceCellFormula } from "./current-period-workbook-utils";

type FixedParseResult = {
  assets: ParsedCurrentPeriodAsset[];
  controls: AssetWorkbookControl[];
  blockers: AssetWorkbookBlocker[];
  periodEvidence: Array<{ sourceSheet: string; sourceRange: string; year?: number; month?: number; raw: string }>;
  companyLabel?: string;
};

export function parseCurrentPeriodFixedAssets(workbook: XLSX.WorkBook, scope: AssetWorkbookScope): FixedParseResult {
  const rows = readRows(workbook, "9&10-1");
  if (cellText(rows[1]?.[0]) === "序号") return parseFenghua(rows, scope);
  if (cellText(rows[1]?.[0]) === "资产编号") return parseYuetong(workbook, rows, scope);
  if (cellText(rows[3]?.[0]) === "编号") return parseTianlitong(rows, scope);
  throw new Error("9&10-1 固定资产版式不属于本期三种已验收版式");
}

function parseFenghua(rows: unknown[][], scope: AssetWorkbookScope): FixedParseResult {
  const result = baseResult();
  recordPeriodEvidence(result.periodEvidence, result.blockers, scope, "9&10-1", "9&10-1!A1", rows[0]?.[0]);
  result.companyLabel = companyLabel(rows[0]?.[0]);
  for (let index = 3; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Number.isFinite(Number(row?.[0])) || !cellText(row?.[2])) continue;
    const sourceRow = index + 1;
    const current = money(row[14]);
    const closingAccumulated = money(row[15]);
    result.assets.push({
      ...evidence(scope, sourceRow, "T", "折旧", "累计折旧", [row[8], row[9]].filter(Boolean).join("-")),
      assetCode: `FA-${String(Number(row[0])).padStart(4, "0")}`,
      name: cellText(row[2]),
      assetKind: "fixed_asset",
      categoryCandidate: fixedCategoryCandidate(cellText(row[1]), cellText(row[2])),
      sourceCategory: cellText(row[1]) || undefined,
      acquisitionDate: parseSourceDate(row[3]),
      depreciationStartDate: missingDepreciationStart(result.blockers, sourceRow, "T"),
      originalCost: money(row[10]),
      residualRate: requiredResidual(row[12], result.blockers, sourceRow),
      usefulLifeMonths: cellNumber(row[11]) ? Number(row[11]) * 12 : undefined,
      usefulLifeEvidence: cellNumber(row[11]) ? "source_field" : undefined,
      openingAccumulatedAmount: money(closingAccumulated - current),
      openingAsOfDate: openingAsOfDate(scope),
      closingNetAmount: money(row[16]),
      currentDepreciation: current,
      accumulatedDepreciation: closingAccumulated,
    });
  }
  const total = rows.find((row) => cellText(row[0]).replace(/\s/g, "") === "合计");
  fixedControls(result, "9&10-1!K47:Q47", total, result.assets, { original: 10, current: 14, accumulated: 15, net: 16 });
  return result;
}

function parseYuetong(workbook: XLSX.WorkBook, rows: unknown[][], scope: AssetWorkbookScope): FixedParseResult {
  const result = baseResult();
  recordPeriodEvidence(result.periodEvidence, result.blockers, scope, "9&10-1", "9&10-1!A1", rows[0]?.[0]);
  result.companyLabel = companyLabel(rows[0]?.[0]);
  for (let index = 2; index < rows.length; index += 1) {
    const row = rows[index];
    if (!cellText(row?.[0]) || !cellText(row?.[1]) || cellText(row[0]).includes("合计")) continue;
    const sourceRow = index + 1;
    const originalCost = money(row[4] ?? row[3]);
    const residualAmount = cellNumber(row[5]);
    const formula = sourceCellFormula(workbook, "9&10-1", `G${sourceRow}`);
    const formulaLifeYears = formula?.match(/\/(\d+)\/12/)?.[1];
    result.assets.push({
      ...evidence(scope, sourceRow, "AG", "本月折旧", "2026年6月累计折旧"),
      assetCode: `FA-${cellText(row[0]).padStart(4, "0")}`,
      name: cellText(row[1]),
      assetKind: "fixed_asset",
      categoryCandidate: fixedCategoryCandidate(undefined, cellText(row[1])),
      acquisitionDate: parseSourceDate(row[27]),
      depreciationStartDate: missingDepreciationStart(result.blockers, sourceRow, "AG"),
      originalCost,
      residualRate: residualAmount == null || originalCost === 0 ? missingResidual(result.blockers, sourceRow) : residualAmount / originalCost,
      usefulLifeMonths: formulaLifeYears ? Number(formulaLifeYears) * 12 : undefined,
      usefulLifeEvidence: formulaLifeYears ? "source_formula" : undefined,
      openingAccumulatedAmount: money(row[24]),
      openingAsOfDate: openingAsOfDate(scope),
      closingNetAmount: money(row[26]),
      currentDepreciation: money(row[6]),
      accumulatedDepreciation: money(row[25]),
    });
  }
  const total = rows.find((row) => cellText(row[0]).replace(/\s/g, "") === "合计");
  fixedControls(result, "9&10-1!D22:AA22", total, result.assets, { original: 4, current: 6, accumulated: 25, net: 26 });
  recordControl(result.controls, result.blockers, { key: "fixed_opening_accumulated", sourceSheet: "9&10-1", sourceRange: "9&10-1!Y22", expected: money(total?.[24]), actual: sum(result.assets, "openingAccumulatedAmount"), blockerCode: "FIXED_OPENING_CONTROL_FAILED" });
  return result;
}

function parseTianlitong(rows: unknown[][], scope: AssetWorkbookScope): FixedParseResult {
  const result = baseResult();
  recordPeriodEvidence(result.periodEvidence, result.blockers, scope, "9&10-1", "9&10-1!B3", rows[2]?.[1]);
  for (let index = 5; index < rows.length; index += 1) {
    const row = rows[index];
    if (!Number.isFinite(Number(row?.[0])) || !cellText(row?.[1])) continue;
    const sourceRow = index + 1;
    const current = money(row[12]);
    const closingAccumulated = money(row[14]);
    const depreciationStart = depreciationStartFromUsedMonthsAndCutoff(row[11], row[17], result.blockers, sourceRow);
    result.assets.push({
      ...evidence(scope, sourceRow, "T", "本月折旧", "累计折旧"),
      assetCode: `FA-${String(Number(row[0])).padStart(4, "0")}`,
      name: cellText(row[1]),
      assetKind: "fixed_asset",
      categoryCandidate: fixedCategoryCandidate(cellText(row[2]), cellText(row[1])),
      sourceCategory: cellText(row[2]) || undefined,
      acquisitionDate: parseSourceDate(row[3]),
      ...depreciationStart,
      originalCost: money(row[7]),
      residualRate: requiredResidual(row[9], result.blockers, sourceRow),
      usefulLifeMonths: cellNumber(row[8]) ? Number(row[8]) * 12 : undefined,
      usefulLifeEvidence: cellNumber(row[8]) ? "source_field" : undefined,
      openingAccumulatedAmount: money(closingAccumulated - current),
      openingAsOfDate: openingAsOfDate(scope),
      closingNetAmount: money(row[15]),
      currentDepreciation: current,
      accumulatedDepreciation: closingAccumulated,
    });
  }
  const total = rows[4];
  fixedControls(result, "9&10-1!H5:P5", total, result.assets, { original: 7, current: 12, accumulated: 14, net: 15 });
  recordControl(result.controls, result.blockers, { key: "fixed_calculated_accumulated", sourceSheet: "9&10-1", sourceRange: "9&10-1!O5:S5", expected: money(total?.[14]), actual: money(total?.[18]), blockerCode: "FIXED_CALCULATED_ACCUMULATION_MISMATCH", blockerMessage: "累计折旧与计算值不一致" });
  return result;
}

function fixedControls(result: FixedParseResult, sourceRange: string, total: unknown[] | undefined, assets: ParsedCurrentPeriodAsset[], columns: { original: number; current: number; accumulated: number; net: number }) {
  recordControl(result.controls, result.blockers, { key: "fixed_original_cost", sourceSheet: "9&10-1", sourceRange, expected: money(total?.[columns.original]), actual: sum(assets, "originalCost"), blockerCode: "FIXED_ORIGINAL_CONTROL_FAILED" });
  recordControl(result.controls, result.blockers, { key: "fixed_current_depreciation", sourceSheet: "9&10-1", sourceRange, expected: money(total?.[columns.current]), actual: sum(assets, "currentDepreciation"), blockerCode: "FIXED_DEPRECIATION_CONTROL_FAILED", blockerMessage: "固定资产逐行本月折旧与来源总计不一致" });
  recordControl(result.controls, result.blockers, { key: "fixed_accumulated_depreciation", sourceSheet: "9&10-1", sourceRange, expected: money(total?.[columns.accumulated]), actual: sum(assets, "accumulatedDepreciation"), blockerCode: "FIXED_ACCUMULATED_CONTROL_FAILED" });
  recordControl(result.controls, result.blockers, { key: "fixed_closing_net", sourceSheet: "9&10-1", sourceRange, expected: money(total?.[columns.net]), actual: sum(assets, "closingNetAmount"), blockerCode: "FIXED_NET_CONTROL_FAILED" });
}

function evidence(scope: AssetWorkbookScope, row: number, endColumn: string, sourceCurrentLabel: string, sourceAccumulatedLabel: string, sourceVoucherReference?: string) {
  return { sourceFile: scope.sourceFile, sourceSheet: "9&10-1", sourceRow: row, sourceRange: factRange("9&10-1", "A", endColumn, row), sourceKey: `9&10-1:${row}`, sourceCurrentLabel, sourceAccumulatedLabel, sourceAccountHint: "固定资产", sourceVoucherReference: sourceVoucherReference || undefined };
}

function requiredResidual(value: unknown, blockers: AssetWorkbookBlocker[], row: number) {
  const number = cellNumber(value);
  return number == null ? missingResidual(blockers, row) : number;
}

function missingResidual(blockers: AssetWorkbookBlocker[], row: number) {
  blockers.push({ code: "FIXED_RESIDUAL_RATE_MISSING", message: "固定资产残值率缺少来源政策，不得由解析器补 3%", sourceSheet: "9&10-1", sourceRange: `9&10-1!A${row}:AG${row}` });
  return undefined;
}

function missingDepreciationStart(blockers: AssetWorkbookBlocker[], row: number, endColumn: string) {
  blockers.push({
    code: "FIXED_DEPRECIATION_START_MISSING",
    message: "固定资产只有入账日期，缺少明确的首个计提月份；不得据入账日期猜测折旧起算日期",
    sourceSheet: "9&10-1",
    sourceRange: factRange("9&10-1", "A", endColumn, row),
  });
  return undefined;
}

function depreciationStartFromUsedMonthsAndCutoff(
  rawUsedMonths: unknown,
  rawCutoffDate: unknown,
  blockers: AssetWorkbookBlocker[],
  row: number,
): Pick<ParsedCurrentPeriodAsset, "depreciationStartDate" | "depreciationStartEvidence" | "depreciationStartSourceRange"> {
  const usedMonths = cellNumber(rawUsedMonths);
  const cutoffDate = parseSourceDate(rawCutoffDate);
  const sourceRange = factRange("9&10-1", "L", "R", row);
  if (!Number.isInteger(usedMonths) || Number(usedMonths) <= 0 || !cutoffDate) {
    blockers.push({
      code: "FIXED_DEPRECIATION_START_MISSING",
      message: "固定资产缺少可复核的已使用月份或实际计算截止日期，无法还原折旧起算月份",
      sourceSheet: "9&10-1",
      sourceRange,
    });
    return {};
  }
  const cutoffMonth = new Date(Date.UTC(Number(cutoffDate.slice(0, 4)), Number(cutoffDate.slice(5, 7)) - 1, 1));
  cutoffMonth.setUTCMonth(cutoffMonth.getUTCMonth() - (Number(usedMonths) - 1));
  return {
    depreciationStartDate: cutoffMonth.toISOString().slice(0, 10),
    depreciationStartEvidence: "source_used_months_and_cutoff",
    depreciationStartSourceRange: sourceRange,
  };
}

function sum(assets: ParsedCurrentPeriodAsset[], key: keyof ParsedCurrentPeriodAsset) {
  return money(assets.reduce((total, asset) => total + Number(asset[key] ?? 0), 0));
}

function baseResult(): FixedParseResult {
  return { assets: [], controls: [], blockers: [], periodEvidence: [] };
}

function companyLabel(value: unknown) {
  return cellText(value).split(/[-\r\n]/)[0]?.trim() || undefined;
}
