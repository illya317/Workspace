import { NextResponse } from "next/server";
import type { BalanceItem, ReportPeriod, ReclassEntry } from "../report-helpers";
import { reclassifyFromEntries } from "../report-helpers";
import { BALANCE_SHEET_LINES } from "../config/balance-sheet-lines";
import { loadBalanceSheetConfig } from "../config/load-config";
import { computeBalanceSheet } from "../compute-balance-sheet";
import type { ComputedLine } from "../compute-balance-sheet";
import { aggregateMappingBasedBalances } from "../mapping-based-balances";
import { resolveReclassEntriesToLines } from "../mapping/reclass-routing";
import type { ReclassLineRouting } from "../mapping/reclass-routing";

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
  const reclass = reclassifyFromEntries(reclassEntries || []);
  const warnings: string[] = [];

  // M10b: try mapping-based leaf aggregation first
  let mappingByLine: Map<string, { debit: number; credit: number }> | undefined;
  if (period.companyCode) {
    try {
      const agg = await aggregateMappingBasedBalances(period.companyCode, period.year, period.month, "balance");
      if (agg.resolvedCount > 0 && agg.byLineCode.length > 0) {
        mappingByLine = new Map(agg.byLineCode.map((l) => [l.lineCode, { debit: l.debit, credit: l.credit }]));
      } else {
        warnings.push("mapping 聚合 resolvedCount=0，回退到旧 prefixes 口径");
      }
      if (agg.unresolved.length > 0) {
        warnings.push(`存在 ${agg.unresolved.length} 个叶子科目未映射，未计入资产负债表: ${agg.unresolved.map((u) => u.accountCode).slice(0, 20).join(", ")}${agg.unresolved.length > 20 ? "..." : ""}`);
      }
    } catch (e) {
      warnings.push(`mapping 聚合失败 (${(e as Error).message})，回退 prefixes 口径`);
    }
  }

  // M11: in mapping mode, also resolve reclass entries to lineCodes so the
  // compute step can apply per-line deltas without prefix-matching.
  let reclassByLine: ReclassLineRouting | undefined;
  if (mappingByLine && period.companyCode) {
    try {
      reclassByLine = await resolveReclassEntriesToLines(period.companyCode, period.year, reclassEntries || []);
      for (const u of reclassByLine.unresolved) {
        const label = u.reason === "noSourceLine" ? "源科目" : "目标科目";
        warnings.push(`重分类${label} ${u.entry.sourceAccount}→${u.entry.targetAccount} (${u.entry.amount}) 无法解析到报表行，已跳过`);
      }
    } catch (e) {
      warnings.push(`reclass lineCode 路由失败 (${(e as Error).message})，回退 prefixes 路由`);
      reclassByLine = undefined;
    }
  }

  const { lines, diagnostics } = computeBalanceSheet(config, balances, reclass, mappingByLine, reclassByLine);
  if (mappingByLine) {
    warnings.push(
      reclassByLine
        ? "(M11: 使用 mapping-based 路由，含 reclass)"
        : "(M10b: 使用 mapping-based leaf aggregation，reclass 走旧 prefixes 路由)",
    );
  }
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
