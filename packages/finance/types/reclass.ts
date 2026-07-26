export type ReclassBasis = "account_net" | "counterparty_gross";

export interface RuleCandidate {
  policyVersionId: number;
  groupAccountId: number;
  accountCode: string;
  accountName: string;
  balanceDirection: string;
  abnormalSide: "debit" | "credit" | "both";
  abnormalAmount: number;
  hasHistoricalAbnormalBalance: boolean;
  effectiveDecision: "reclassify" | "no_reclass" | null;
  existingRuleId: number | null;
  existingRuleSourceGroupAccountId: number | null;
  inheritedFromAccountCode: string | null;
  existingTarget: string | null;
  existingTargetGroupAccountId: number | null;
  existingDecision: "reclassify" | "no_reclass" | null;
  existingSource: string | null;
  existingEnabled: boolean | null;
  existingBasis: ReclassBasis | null;
  defaultBasis: ReclassBasis;
  hasAuxiliaryFacts: boolean;
}

export interface GroupAccountOption {
  id: number;
  code: string;
  name: string;
}

export interface FinanceAccountingPolicyVersionOption {
  id: number;
  versionNo: number;
  code: string;
  name: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  createdAt: string;
  isCurrent: boolean;
}

export interface ScanCandidatesResult {
  policyVersion: FinanceAccountingPolicyVersionOption;
  versions: FinanceAccountingPolicyVersionOption[];
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
  | "automatic"
  | "manual"
  | "no_process"
  | "pending"
  | "historical";

export type ReclassDecision = "reclassify" | "no_reclass";
export type ReclassHistoricalMethod = "automatic" | "manual" | "no_process" | "legacy";

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
  decision: ReclassDecision | null;
  historicalMethod: ReclassHistoricalMethod | null;
  targetAccountCode: string | null;
  targetAccountName: string | null;
  sourceType: string;
  detailCount: number;
  abnormalSide: "debit" | "credit";
  basis: ReclassBasis;
  ruleId: number | null;
  adjustmentId: number | null;
  historyAt: string | null;
  archiveReason: string | null;
  reason: string;
}

export interface ReclassWorkbenchSummary {
  total: number;
  automatic: number;
  manual: number;
  noProcess: number;
  pending: number;
  historical: number;
  currentAmount: number;
}
