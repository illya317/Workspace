import type { BalanceItem, ReportPeriod, ReclassEntry } from "../report-helpers";
import { loadBalanceSheetConfig } from "../config/load-config";
import { computeBalanceSheet } from "../compute-balance-sheet";
import type { ComputedLine } from "../compute-balance-sheet";
import { aggregateMappingBasedBalances } from "../mapping-based-balances";
import { resolveReclassEntriesToLines } from "../mapping/reclass-routing";
import type { ReclassLineRouting } from "../mapping/reclass-routing";
import { balanceSheetOpeningPoint } from "@workspace/finance/types/statement-period";

interface ReportLineItem {
  lineCode: string; label: string; code: string; amount: number;
  section: string; side: "debit" | "credit";
  previousAmount?: number;
  isHeader?: boolean; isTotal?: boolean; isGrandTotal?: boolean;
}

function toReportLine(cl: ComputedLine & { _section: string; _side: "debit" | "credit"; previousAmount?: number }): ReportLineItem {
  return { lineCode: cl.lineCode, label: cl.label, code: cl.displayCode, amount: cl.amount,
    previousAmount: cl.previousAmount, section: cl._section, side: cl._side,
    ...(cl.isHeader ? { isHeader: true as const } : {}),
    ...(cl.isTotal ? { isTotal: true as const } : {}),
    ...(cl.isGrandTotal ? { isGrandTotal: true as const } : {}),
  };
}

const ASSET_SECTIONS = ["currentAssets", "nonCurrentAssets"];
const LIABILITY_SECTIONS = ["currentLiabilities", "nonCurrentLiabilities"];
const EQUITY_SECTIONS = ["equity"];

function filterBySections(
  lines: (ComputedLine & { _section: string; _side: "debit" | "credit" })[],
  sections: string[],
): ReportLineItem[] {
  return lines.filter((l) => sections.includes(l._section)).map(toReportLine);
}

function emptyReclassRouting(): ReclassLineRouting {
  return { deductionsByLine: new Map(), additionsByLine: new Map(), unresolved: [] };
}

function totals(lines: (ComputedLine & { previousAmount?: number })[]) {
  const current = (lines.find((line) => line.lineCode === "totalLiabilities")?.amount || 0)
    + (lines.find((line) => line.lineCode === "totalEquity")?.amount || 0);
  const previous = (lines.find((line) => line.lineCode === "totalLiabilities")?.previousAmount || 0)
    + (lines.find((line) => line.lineCode === "totalEquity")?.previousAmount || 0);
  return { current: +current.toFixed(2), previous: +previous.toFixed(2) };
}

export async function generateBalanceSheet(
  period: ReportPeriod, balances: BalanceItem[], reclassEntries?: ReclassEntry[],
  openingReclassEntries?: ReclassEntry[],
) {
  if (!period.companyCode) throw new Error("资产负债表期间缺少公司编号");
  const config = await loadBalanceSheetConfig(period.companyCode, period.year);
  const warnings: string[] = [];

  const openingPeriod = balanceSheetOpeningPoint(period);
  const [agg, openingAgg] = await Promise.all([
    aggregateMappingBasedBalances(period.companyCode, period.year, period.month, "balance"),
    aggregateMappingBasedBalances(
      period.companyCode,
      openingPeriod.year,
      openingPeriod.month,
      "balance",
      "opening",
    ),
  ]);
  const mappingByLine = new Map(agg.byLineCode.map((line) => [
    line.lineCode,
    { debit: line.debit, credit: line.credit },
  ]));
  if (agg.balanceBearingCount > 0 && agg.resolvedCount === 0) {
    throw new Error("资产负债表没有可用的科目映射");
  }
  if (agg.unresolved.length > 0) {
    warnings.push(`存在 ${agg.unresolved.length} 个叶子科目未映射，未计入资产负债表: ${agg.unresolved.map((item) => item.accountCode).slice(0, 20).join(", ")}${agg.unresolved.length > 20 ? "..." : ""}`);
  }
  if (period.month === 12 && agg.profitOrLossCarryforward.length > 0) {
    warnings.push(`存在 ${agg.profitOrLossCarryforward.length} 个尚未结转的损益类余额，已计入未分配利润: ${agg.profitOrLossCarryforward.map((item) => item.accountCode).slice(0, 20).join(", ")}${agg.profitOrLossCarryforward.length > 20 ? "..." : ""}`);
  }

  const [reclassByLine, openingReclassByLine] = await Promise.all([
    resolveReclassEntriesToLines(period.companyCode, period.year, reclassEntries || []),
    openingReclassEntries?.length
      ? resolveReclassEntriesToLines(period.companyCode, openingPeriod.year, openingReclassEntries)
      : Promise.resolve(emptyReclassRouting()),
  ]);
  for (const unresolved of reclassByLine.unresolved) {
    const label = unresolved.reason === "noSourceLine" ? "源科目" : "目标科目";
    warnings.push(`重分类${label} ${unresolved.entry.sourceAccount}→${unresolved.entry.targetAccount} (${unresolved.entry.amount}) 无法解析到报表行，已跳过`);
  }
  for (const unresolved of openingReclassByLine.unresolved) {
    const label = unresolved.reason === "noSourceLine" ? "源科目" : "目标科目";
    warnings.push(`期初重分类${label} ${unresolved.entry.sourceAccount}→${unresolved.entry.targetAccount} (${unresolved.entry.amount}) 无法解析到报表行，已跳过`);
  }

  const { lines, diagnostics } = computeBalanceSheet(config, mappingByLine, reclassByLine);
  const openingMappingByLine = new Map(openingAgg.byLineCode.map((line) => [
    line.lineCode,
    { debit: line.debit, credit: line.credit },
  ]));
  const previousLines = computeBalanceSheet(config, openingMappingByLine, openingReclassByLine).lines;
  const previousByCode = new Map(previousLines.map((line) => [line.lineCode, line.amount]));
  const allDiagnostics = [...warnings, ...diagnostics];

  const sectionMap = new Map(config.map((c) => [c.lineCode, c.section]));
  const sideMap = new Map(config.map((c) => [c.lineCode, c.side]));
  const linesWithSection = lines.map((l) => ({
    ...l,
    previousAmount: previousByCode.get(l.lineCode) ?? 0,
    _section: sectionMap.get(l.lineCode) || "",
    _side: sideMap.get(l.lineCode) ?? "debit",
  }));

  const assets = filterBySections(linesWithSection, ASSET_SECTIONS);
  const liabilities = filterBySections(linesWithSection, LIABILITY_SECTIONS);
  const equity = filterBySections(linesWithSection, EQUITY_SECTIONS);

  const balanceTotals = totals(linesWithSection);

  const payload: Record<string, unknown> = {
    type: "balance",
    period,
    source: "system",
    assets,
    liabilities,
    equity,
    totalLiabilitiesAndEquity: balanceTotals.current,
    previousTotalLiabilitiesAndEquity: balanceTotals.previous,
  };
  if (allDiagnostics.length > 0) payload.diagnostics = allDiagnostics;
  return Response.json(payload);
}
