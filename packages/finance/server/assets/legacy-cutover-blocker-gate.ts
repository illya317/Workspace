import type { AssetWorkbookBlocker } from "./current-period-workbook-types";

export const FINANCE_ASSET_LEGACY_CUTOVER_DATE = "2026-06-30";

export const FINANCE_ASSET_GL_OVERRIDE_BLOCKER_CODES = [
  "FIXED_ORIGINAL_CONTROL_FAILED",
  "DEFERRED_ACCUMULATED_CONTROL_FAILED",
  "FIXED_DEPRECIATION_CONTROL_FAILED",
  "FIXED_CALCULATED_ACCUMULATION_MISMATCH",
  "ASSET_PERIOD_MISMATCH",
  "DEFERRED_OPENING_BALANCE_CONTROL_FAILED",
  "FIXED_ACCUMULATED_CONTROL_FAILED",
  "FIXED_NET_CONTROL_FAILED",
  "FIXED_OPENING_CONTROL_FAILED",
  "DEFERRED_SOURCE_TOTAL_MISSING",
  "DEFERRED_CURRENT_CONTROL_FAILED",
  "INTANGIBLE_SOURCE_TOTAL_MISSING",
  "INTANGIBLE_AMORTIZATION_CONTROL_FAILED",
  "INTANGIBLE_ACCUMULATED_CONTROL_FAILED",
  "INTANGIBLE_NET_CONTROL_FAILED",
  "RENOVATION_INVOICE_CONTROL_FAILED",
  "RENOVATION_TOTAL_FORMULA_UNINTERPRETABLE",
] as const;

const GL_OVERRIDE_CODES = new Set<string>(FINANCE_ASSET_GL_OVERRIDE_BLOCKER_CODES);
const GL_OVERRIDE_NOTE = `${FINANCE_ASSET_LEGACY_CUTOVER_DATE} legacy_cutover：历史 Excel 公式/控制由 ERP GL reconciliation 覆盖；原始阻断证据保留`;

export function gateFinanceAssetLegacyCutoverBlockers(input: {
  year: number;
  month: number;
  hasErpGlReconciliation: boolean;
  blockers: AssetWorkbookBlocker[];
}) {
  const overrideEnabled = input.year === 2026 && input.month === 6 && input.hasErpGlReconciliation;
  const blocking: AssetWorkbookBlocker[] = [];
  const warnings: AssetWorkbookBlocker[] = [];

  for (const blocker of input.blockers) {
    if (overrideEnabled && GL_OVERRIDE_CODES.has(blocker.code)) {
      warnings.push({ ...blocker, note: GL_OVERRIDE_NOTE });
    } else {
      blocking.push(blocker);
    }
  }

  return {
    cutoverDate: FINANCE_ASSET_LEGACY_CUTOVER_DATE,
    overrideEnabled,
    blocking,
    warnings,
  };
}
