export type FinanceGroupAccountMappingMethod =
  | "unmatched"
  | "reference_seed"
  | "exact_code_name"
  | "exact_name"
  | "suggested"
  | "hierarchy_match"
  | "manual_override";

export type FinanceGroupAccountMappingReviewClass =
  | "confirmed"
  | "reviewed"
  | "pending_review"
  | "pending_delete";

export type FinanceGroupAccountSourceKind = "reference_seed" | "suggested" | "manual";
export type FinanceGroupAccountReviewStatus =
  | "confirmed"
  | "reviewed"
  | "pending_review"
  | "pending_delete";

export type FinanceConsolidationRole =
  | "none"
  | "intercompanyReceivable"
  | "intercompanyPayable"
  | "intercompanyRevenue"
  | "intercompanyExpense"
  | "investmentInSubsidiary"
  | "shareCapital"
  | "capitalReserve"
  | "dividendReceivable"
  | "dividendPayable"
  | "inventory"
  | "fixedAsset"
  | "cashFlow"
  | "difference";

export type FinanceCounterpartyRequirement = "none" | "optional" | "required";
export type FinanceConsolidationMovementType = "closingBalance" | "periodMovement" | "transaction";
export type FinanceTranslationRateType = "closing" | "average" | "historical" | "transactionDate";
export type FinanceGroupAccountUsage = "consolidation" | "reclassification";

export interface FinanceAccountingPolicyVersionRow {
  id: number;
  versionNo: number;
  code: string;
  name: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  status: string;
  createdAt: string;
}

export interface CreateFinanceGroupAccountInput {
  code: string;
  name: string;
  category: "asset" | "liability" | "common" | "equity" | "cost" | "revenue" | "expense";
  balanceDirection: "debit" | "credit";
  mnemonicCode: string | null;
  currency: string | null;
  parentGroupAccountId: number | null;
  consolidationRole: FinanceConsolidationRole;
  counterpartyRequirement: FinanceCounterpartyRequirement;
  movementType: FinanceConsolidationMovementType;
  translationRateType: FinanceTranslationRateType;
}

export interface UpdateFinanceGroupAccountInput extends CreateFinanceGroupAccountInput {
  expectedUpdatedAt: string;
}

export interface ReviewFinanceGroupAccountInput {
  decision: "approve" | "reject";
  expectedUpdatedAt: string;
}

export interface FinanceGroupAccountOption {
  policyVersionId: number;
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
}

export interface FinanceGroupAccountCatalogRow {
  id: number;
  code: string;
  name: string;
  category: string;
  balanceDirection: string;
  companyCode: null;
  subjectLevel: number | null;
  mnemonicCode: string | null;
  currency: string | null;
  isActive: boolean;
  groupAccount: null;
  sourceKind: FinanceGroupAccountSourceKind;
  reviewStatus: FinanceGroupAccountReviewStatus;
  reviewedBy: number | null;
  reviewedAt: string | null;
  consolidationRole: FinanceConsolidationRole;
  counterpartyRequirement: FinanceCounterpartyRequirement;
  movementType: FinanceConsolidationMovementType;
  translationRateType: FinanceTranslationRateType;
  originCompanyCode: string | null;
  mappingCount: number;
  years: number[];
  updatedAt: string;
  parent: {
    id: number;
    code: string;
    name: string;
  } | null;
  parentRecommendation:
    | {
        kind: "mapped";
        localParent: { code: string; name: string };
        groupAccount: { id: number; code: string; name: string };
      }
    | {
        kind: "top_level";
      }
    | {
        kind: "unresolved";
        localParent: { code: string; name: string };
      }
    | null;
}

export interface FinanceGroupAccountCatalogResponse {
  currentPolicyVersionId: number;
  selectedPolicyVersionId: number;
  policyVersions: FinanceAccountingPolicyVersionRow[];
  rows: FinanceGroupAccountCatalogRow[];
  treeRows: FinanceGroupAccountCatalogRow[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface FinanceGroupAccountMappedLocalAccountRow {
  mappingId: number;
  companyCode: string;
  companyName: string;
  sourceScopeKey: string;
  sourceSystem: string | null;
  sourceDatabase: string | null;
  sourceLedger: string | null;
  localAccountCode: string;
  localAccountName: string;
  localCategory: string;
  localBalanceDirection: string;
  years: number[];
  latestYear: number | null;
  mappingMethod: FinanceGroupAccountMappingMethod;
  reviewClass: FinanceGroupAccountMappingReviewClass;
}

export interface FinanceGroupAccountMappedLocalAccountsResponse {
  policyVersionId: number;
  groupAccountId: number;
  rows: FinanceGroupAccountMappedLocalAccountRow[];
}
