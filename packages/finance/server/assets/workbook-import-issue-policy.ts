import type { AssetWorkbookBlocker } from "./current-period-workbook-types";

const MANUAL_REVIEW_WARNING_CODES = new Set([
  "FIXED_RESIDUAL_RATE_MISSING",
  "FIXED_DEPRECIATION_START_MISSING",
  "INTANGIBLE_USEFUL_LIFE_IMPLIED_ONLY",
  "INTANGIBLE_USEFUL_LIFE_MISSING",
  "LAND_USE_RIGHT_RECOGNITION_REVIEW",
  "LICENSE_RECOGNITION_REVIEW",
  "DEFERRED_USEFUL_LIFE_IMPLIED_ONLY",
  "LEASEHOLD_IMPROVEMENT_EVIDENCE_MISSING",
  "SHORT_TERM_ACCOUNT_CLASSIFICATION_MISSING",
  "RENOVATION_COST_EXCLUSION_REASON_MISSING",
  "RENOVATION_CARD_EVIDENCE_MISSING",
]);

const MANUAL_REVIEW_NOTE = "证据完整性由人工复核，不阻断导入";

export function partitionFinanceAssetWorkbookIssues(issues: AssetWorkbookBlocker[]) {
  const blockers: AssetWorkbookBlocker[] = [];
  const warnings: AssetWorkbookBlocker[] = [];
  for (const issue of issues) {
    if (isFinanceAssetManualReviewIssue(issue.code)) warnings.push({ ...issue, note: issue.note ?? MANUAL_REVIEW_NOTE });
    else blockers.push(issue);
  }
  return { blockers, warnings };
}

export function isFinanceAssetManualReviewIssue(code: string) {
  return MANUAL_REVIEW_WARNING_CODES.has(code) || code.includes("EVIDENCE");
}
