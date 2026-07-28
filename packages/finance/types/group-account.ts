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
export type FinanceTranslationRateType =
  | "closing"
  | "average"
  | "historical"
  | "retainedEarningsRollforward"
  | "translationDifference";
export type FinanceGroupAccountUsage = "consolidation" | "reclassification";

/**
 * 集团报表法定折算口径。该值只由科目性质派生，不能作为用户可覆盖的配置。
 */
export function deriveFinanceGroupAccountTranslationRateType(input: {
  code: string;
  name: string;
  category: string;
  consolidationRole?: FinanceConsolidationRole | string;
}): FinanceTranslationRateType {
  const code = input.code.trim();
  const name = input.name.trim();
  if (input.consolidationRole === "difference"
    || /^(4003|4005)/.test(code)
    || /外币报表折算差额|其他综合收益/.test(name)) return "translationDifference";
  if (/^(4104|310415)/.test(code) || name.includes("未分配利润")) {
    return "retainedEarningsRollforward";
  }
  if (input.consolidationRole === "shareCapital"
    || input.consolidationRole === "capitalReserve"
    || /^(4001|3001|4002|3002|4101|3101)/.test(code)
    || /实收资本|股本|资本公积|盈余公积|其他权益工具|库存股/.test(name)) return "historical";
  if (input.consolidationRole === "cashFlow"
    || ["revenue", "cost", "expense"].includes(input.category)) return "average";
  if (input.category === "equity") return "historical";
  return "closing";
}

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
