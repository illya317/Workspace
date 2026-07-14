import { NextResponse } from "next/server";
import { prisma } from "@workspace/platform/server/prisma";
import type { BalanceItem, ReportPeriod, ReclassEntry } from "../report-helpers";
import { loadBalanceSheetConfig } from "../config/load-config";
import { computeBalanceSheet } from "../compute-balance-sheet";
import type { ComputedLine } from "../compute-balance-sheet";
import { aggregateMappingBasedBalances } from "../mapping-based-balances";
import { resolveReclassEntriesToLines } from "../mapping/reclass-routing";
import type { ReclassLineRouting } from "../mapping/reclass-routing";
import type { BalanceSheetLineConfig } from "../config/balance-sheet-lines";

interface ReportLineItem {
  label: string; code: string; amount: number;
  previousAmount?: number;
  isHeader?: boolean; isTotal?: boolean; isGrandTotal?: boolean;
}

function toReportLine(cl: ComputedLine & { _section: string; previousAmount?: number }): ReportLineItem {
  return { label: cl.label, code: cl.displayCode, amount: cl.amount, previousAmount: cl.previousAmount,
    ...(cl.isHeader ? { isHeader: true as const } : {}),
    ...(cl.isTotal ? { isTotal: true as const } : {}),
    ...(cl.isGrandTotal ? { isGrandTotal: true as const } : {}),
  };
}

const ASSET_SECTIONS = ["currentAssets", "nonCurrentAssets"];
const LIABILITY_SECTIONS = ["currentLiabilities", "nonCurrentLiabilities"];
const EQUITY_SECTIONS = ["equity"];

function filterBySections(lines: (ComputedLine & { _section: string })[], sections: string[]): ReportLineItem[] {
  return lines.filter((l) => sections.includes(l._section)).map(toReportLine);
}

function emptyReclassRouting(): ReclassLineRouting {
  return { deductionsByLine: new Map(), additionsByLine: new Map(), unresolved: [] };
}

function workpaperAmounts(lines: { lineCode: string; manualAmount: number; importedAmount: number }[] | undefined) {
  return new Map(lines?.map((line) => [line.lineCode, line.manualAmount + line.importedAmount]) ?? []);
}

function workpaperLines(
  config: BalanceSheetLineConfig[],
  current: Map<string, number>,
  previous: Map<string, number>,
): (ComputedLine & { _section: string; previousAmount?: number })[] {
  return config.map((line) => ({
    lineCode: line.lineCode,
    label: line.label,
    displayCode: line.displayCode,
    amount: current.get(line.lineCode) ?? 0,
    previousAmount: previous.get(line.lineCode) ?? 0,
    ...(line.isHeader ? { isHeader: true as const } : {}),
    ...(line.isTotal ? { isTotal: true as const } : {}),
    ...(line.isGrandTotal ? { isGrandTotal: true as const } : {}),
    _debit: 0,
    _credit: 0,
    _section: line.section,
  }));
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
) {
  if (!period.companyCode) throw new Error("资产负债表期间缺少公司编号");
  const [config, currentWorkpaper, previousWorkpaper] = await Promise.all([
    loadBalanceSheetConfig(period.companyCode, period.year),
    prisma.financeStatementWorkpaper.findUnique({
      where: { companyCode_year_month_reportType: {
        companyCode: period.companyCode, year: period.year, month: period.month, reportType: "balanceSheet",
      } },
      include: { lines: true },
    }),
    prisma.financeStatementWorkpaper.findUnique({
      where: { companyCode_year_month_reportType: {
        companyCode: period.companyCode, year: period.year - 1, month: period.month, reportType: "balanceSheet",
      } },
      include: { lines: true },
    }),
  ]);
  const warnings: string[] = [];

  if (currentWorkpaper) {
    const linesWithSection = workpaperLines(
      config,
      workpaperAmounts(currentWorkpaper.lines),
      workpaperAmounts(previousWorkpaper?.lines),
    );
    const balanceTotals = totals(linesWithSection);
    return NextResponse.json({
      type: "balance",
      period,
      source: "workpaper",
      assets: filterBySections(linesWithSection, ASSET_SECTIONS),
      liabilities: filterBySections(linesWithSection, LIABILITY_SECTIONS),
      equity: filterBySections(linesWithSection, EQUITY_SECTIONS),
      totalLiabilitiesAndEquity: balanceTotals.current,
      previousTotalLiabilitiesAndEquity: balanceTotals.previous,
    });
  }

  const [agg, openingAgg] = await Promise.all([
    aggregateMappingBasedBalances(period.companyCode, period.year, period.month, "balance"),
    aggregateMappingBasedBalances(period.companyCode, period.year, period.month, "balance", "opening"),
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

  const reclassByLine = await resolveReclassEntriesToLines(
    period.companyCode,
    period.year,
    reclassEntries || [],
  );
  for (const unresolved of reclassByLine.unresolved) {
    const label = unresolved.reason === "noSourceLine" ? "源科目" : "目标科目";
    warnings.push(`重分类${label} ${unresolved.entry.sourceAccount}→${unresolved.entry.targetAccount} (${unresolved.entry.amount}) 无法解析到报表行，已跳过`);
  }

  const { lines, diagnostics } = computeBalanceSheet(config, mappingByLine, reclassByLine);
  const openingMappingByLine = new Map(openingAgg.byLineCode.map((line) => [
    line.lineCode,
    { debit: line.debit, credit: line.credit },
  ]));
  const previousLines = computeBalanceSheet(config, openingMappingByLine, emptyReclassRouting()).lines;
  const previousByCode = new Map(previousLines.map((line) => [line.lineCode, line.amount]));
  const allDiagnostics = [...warnings, ...diagnostics];

  const sectionMap = new Map(config.map((c) => [c.lineCode, c.section]));
  const linesWithSection = lines.map((l) => ({
    ...l,
    previousAmount: previousByCode.get(l.lineCode) ?? 0,
    _section: sectionMap.get(l.lineCode) || "",
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
  return NextResponse.json(payload);
}
