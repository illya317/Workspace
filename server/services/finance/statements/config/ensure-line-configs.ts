/**
 * P3 Batch 1: ensureStatementLineConfigs(companyCode, year, reportType).
 *
 * Cascade seeding for line config:
 *   1. If current (company, year, reportType) already has rows → no-op.
 *   2. Else if previous year has rows for the same (company, reportType)
 *      → copy them to current year.
 *   3. Else → seed from the TS default (load-config.ts → BALANCE_SHEET_LINES
 *      / INCOME_STATEMENT_LINES / CASH_FLOW_LINES).
 *
 * The 3-tier cascade is the same pattern as ensureStatementMappings; the
 * difference is the table (FinanceStatementLineConfig vs
 * FinanceStatementAccountMapping) and the TS default set.
 *
 * P3 Batch 1: framework only. No compute, no UI, no API changes.
 */

import { prisma } from "@/lib/prisma";
import { loadBalanceSheetConfig } from "./load-config";
import { loadIncomeStatementConfig, loadCashFlowConfig } from "./load-config-reports";

export type ReportType = "balanceSheet" | "incomeStatement" | "cashFlow";

export interface EnsureLineConfigResult {
  reportType: ReportType;
  companyCode: string;
  year: number;
  /** "existing" / "copied" / "migrated" — same vocabulary as M11.6. */
  source: "existing" | "copied" | "migrated";
  /** Final row count for the (company, year, reportType). */
  count: number;
}

export async function ensureStatementLineConfigs(
  companyCode: string,
  year: number,
  reportType: ReportType,
): Promise<EnsureLineConfigResult> {
  // 1. Already has this year's config? no-op.
  const existing = await prisma.financeStatementLineConfig.count({
    where: { companyCode, year, reportType, enabled: true },
  });
  if (existing > 0) {
    return { reportType, companyCode, year, source: "existing", count: existing };
  }

  // 2 + 3. Either copy from prev year (DB will have rows after the loader
  // finishes its copy branch) or seed from TS default. Both happen
  // inside the loader. The loaders are idempotent (upsert), so calling
  // them is safe.
  if (reportType === "balanceSheet") {
    await loadBalanceSheetConfig(companyCode, year);
  } else if (reportType === "incomeStatement") {
    await loadIncomeStatementConfig(companyCode, year);
  } else {
    await loadCashFlowConfig(companyCode, year);
  }

  // Determine which branch the loader used. If the previous year had
  // any rows, the copy branch ran; otherwise the seed branch ran.
  let source: "copied" | "migrated" = "migrated";
  if (year > 2024) {
    const prevCount = await prisma.financeStatementLineConfig.count({
      where: { companyCode, year: year - 1, reportType, enabled: true },
    });
    // We can only know "copied" vs "migrated" if prev year had anything
    // before this call. Since the loaders are idempotent and the prev
    // year is unchanged, the count here is the pre-existing prev count
    // (unless we just seeded prev year, but for batch 1 we don't).
    if (prevCount > 0) source = "copied";
  }

  const finalCount = await prisma.financeStatementLineConfig.count({
    where: { companyCode, year, reportType, enabled: true },
  });
  return { reportType, companyCode, year, source, count: finalCount };
}

/** Convenience: ensure line configs for all 3 report types at once. */
export async function ensureAllStatementLineConfigs(
  companyCode: string,
  year: number,
): Promise<EnsureLineConfigResult[]> {
  const out: EnsureLineConfigResult[] = [];
  for (const rt of ["balanceSheet", "incomeStatement", "cashFlow"] as ReportType[]) {
    out.push(await ensureStatementLineConfigs(companyCode, year, rt));
  }
  return out;
}
