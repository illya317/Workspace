import { NextResponse } from "next/server";
import type { BalanceItem, ReportPeriod, ReclassEntry } from "../report-helpers";
import { reclassifyFromEntries, reclassify } from "../report-helpers";
import { BALANCE_SHEET_LINES } from "../config/balance-sheet-lines";
import { loadBalanceSheetConfig } from "../config/load-config";
import { computeBalanceSheet } from "../compute-balance-sheet";
import type { ComputedLine } from "../compute-balance-sheet";

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
  const config = period.companyCode
    ? await loadBalanceSheetConfig(period.companyCode, period.year)
    : BALANCE_SHEET_LINES;
  const reclass = reclassEntries && reclassEntries.length > 0
    ? reclassifyFromEntries(reclassEntries)
    : reclassify(balances);

  const { lines, diagnostics } = computeBalanceSheet(config, balances, reclass);
  const sectionMap = new Map(config.map((c) => [c.lineCode, c.section]));
  const linesWithSection = lines.map((l) => ({ ...l, _section: sectionMap.get(l.lineCode) || "" }));

  const assets = filterBySections(linesWithSection, ASSET_SECTIONS);
  const liabilities = filterBySections(linesWithSection, LIABILITY_SECTIONS);
  const equity = filterBySections(linesWithSection, EQUITY_SECTIONS);

  const totalLiabilitiesAndEquity = +(
    (liabilities.find((l) => l.label === "负债合计")?.amount || 0) +
    (equity.find((l) => l.label === "所有者权益合计")?.amount || 0)
  ).toFixed(2);

  const payload: Record<string, unknown> = { type: "balance", period, assets, liabilities, equity, totalLiabilitiesAndEquity };
  if (diagnostics.length > 0) payload.diagnostics = diagnostics;
  return NextResponse.json(payload);
}
