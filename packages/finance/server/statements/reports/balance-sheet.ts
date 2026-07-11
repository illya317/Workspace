import { NextResponse } from "next/server";
import type { BalanceItem, ReportPeriod, ReclassEntry } from "../report-helpers";
import { loadBalanceSheetConfig } from "../config/load-config";
import { computeBalanceSheet } from "../compute-balance-sheet";
import type { ComputedLine } from "../compute-balance-sheet";
import { aggregateMappingBasedBalances } from "../mapping-based-balances";
import { resolveReclassEntriesToLines } from "../mapping/reclass-routing";

interface ReportLineItem {
  label: string; code: string; amount: number;
  isHeader?: boolean; isTotal?: boolean; isGrandTotal?: boolean;
}

function toReportLine(cl: ComputedLine & { _section: string }): ReportLineItem {
  return { label: cl.label, code: cl.displayCode, amount: cl.amount,
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

export async function generateBalanceSheet(
  period: ReportPeriod, balances: BalanceItem[], reclassEntries?: ReclassEntry[],
) {
  if (!period.companyCode) throw new Error("资产负债表期间缺少公司编号");
  const config = await loadBalanceSheetConfig(period.companyCode, period.year);
  const warnings: string[] = [];

  const agg = await aggregateMappingBasedBalances(period.companyCode, period.year, period.month, "balance");
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
  const allDiagnostics = [...warnings, ...diagnostics];

  const sectionMap = new Map(config.map((c) => [c.lineCode, c.section]));
  const linesWithSection = lines.map((l) => ({ ...l, _section: sectionMap.get(l.lineCode) || "" }));

  const assets = filterBySections(linesWithSection, ASSET_SECTIONS);
  const liabilities = filterBySections(linesWithSection, LIABILITY_SECTIONS);
  const equity = filterBySections(linesWithSection, EQUITY_SECTIONS);

  const totalLiabilitiesAndEquity = +(
    (linesWithSection.find((l) => l.lineCode === "totalLiabilities")?.amount || 0) +
    (linesWithSection.find((l) => l.lineCode === "totalEquity")?.amount || 0)
  ).toFixed(2);

  const payload: Record<string, unknown> = { type: "balance", period, assets, liabilities, equity, totalLiabilitiesAndEquity };
  if (allDiagnostics.length > 0) payload.diagnostics = allDiagnostics;
  return NextResponse.json(payload);
}
