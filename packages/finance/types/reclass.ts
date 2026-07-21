export interface RuleCandidate {
  accountCode: string;
  accountName: string;
  balanceDirection: string;
  abnormalSide: "debit" | "credit" | "both";
  abnormalAmount: number;
  hasHistoricalAbnormalBalance: boolean;
  effectiveDecision: "reclassify" | "no_reclass" | null;
  existingRuleId: number | null;
  existingTarget: string | null;
  existingDecision: "reclassify" | "no_reclass" | null;
  existingSource: string | null;
  existingRuleSourceAccountCode: string | null;
  existingEnabled: boolean | null;
}

export interface GroupAccountOption {
  code: string;
  name: string;
}

export interface ScanCandidatesResult {
  accountOptions: GroupAccountOption[];
  candidates: RuleCandidate[];
  stats: {
    totalGroupAccounts: number;
    historicallyAbnormal: number;
    reclassified: number;
    noReclass: number;
    unconfirmed: number;
  };
}

export type ReclassClassification =
  | "reclass_candidate"
  | "pending_review"
  | "allowed_negative"
  | "contra_account"
  | "non_balance_sheet_negative"
  | "legacy_voucher_adjustment";

export type ReclassWorkbenchStatus =
  | "pending"
  | "configured"
  | "approved"
  | "adjusted"
  | "rejected"
  | "exempt"
  | "historical";

export interface ReclassEntry {
  id: string;
  periodId: number;
  accountCode: string;
  accountName: string;
  balanceSide: "debit" | "credit";
  naturalSide: "debit" | "credit";
  closingDebit: number;
  closingCredit: number;
  amount: number;
  currentAbnormalAmount: number | null;
  stale: boolean;
  classification: ReclassClassification;
  status: ReclassWorkbenchStatus;
  targetAccountCode: string | null;
  targetAccountName: string | null;
  sourceType: string;
  detailCount: number;
  abnormalSide: "debit" | "credit";
  ruleId: number | null;
  adjustmentId: number | null;
  reason: string;
}

export interface ReclassWorkbenchSummary {
  total: number;
  attention: number;
  processed: number;
  exempt: number;
  historical: number;
  attentionAmount: number;
  processedAmount: number;
}
