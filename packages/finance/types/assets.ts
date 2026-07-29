export type FinanceAssetKind = "fixed_asset" | "intangible" | "prepaid" | "long_term_deferred";
export type FinanceAssetDepreciationMethod = "straight_line";
export type FinanceAssetExportView = "cards" | "period" | "adjustments";
export type FinanceAssetUsefulLifeMode = "required" | "required_or_indefinite_basis";
export type FinanceAssetPolicySource = "group" | "company_override" | "system_default";
export type FinanceAssetImpairmentConclusion = "no_indication" | "no_impairment" | "impairment_recorded";

export type FinanceAssetCategoryDto = {
  id: number;
  code: string;
  name: string;
  assetKind: FinanceAssetKind;
  defaultUsefulLifeMonths: number | null;
  defaultResidualRatePercent: number | null;
  defaultMethod: FinanceAssetDepreciationMethod;
  depreciable: boolean;
  policyId: number | null;
  policyVersion: number;
  companyPolicyVersion: number;
  policySource: FinanceAssetPolicySource;
  policyMappingIssue: string | null;
  assetAccountId: number | null;
  assetAccountCode: string | null;
  assetAccountName: string | null;
  accumulatedAccountId: number | null;
  accumulatedAccountCode: string | null;
  accumulatedAccountName: string | null;
  expenseAccountId: number | null;
  expenseAccountCode: string | null;
  expenseAccountName: string | null;
  impairmentLossAccountId: number | null;
  impairmentLossAccountCode: string | null;
  impairmentLossAccountName: string | null;
  impairmentAllowanceAccountId: number | null;
  impairmentAllowanceAccountCode: string | null;
  impairmentAllowanceAccountName: string | null;
  disposalGainLossAccountId: number | null;
  disposalGainLossAccountCode: string | null;
  disposalGainLossAccountName: string | null;
  usefulLifeMode: FinanceAssetUsefulLifeMode;
  minimumUsefulLifeMonths: number | null;
  maximumUsefulLifeMonths: number | null;
  reviewRequired: boolean;
  classificationRule: string;
};

export type FinanceAssetCardDto = {
  id: number;
  companyCode: string;
  assetCode: string;
  name: string;
  assetKind: FinanceAssetKind;
  categoryId: number;
  categoryCode: string;
  categoryName: string;
  assetAccountId: number | null;
  assetAccountCode: string;
  assetAccountName: string | null;
  accumulatedAccountId: number | null;
  accumulatedAccountCode: string | null;
  accumulatedAccountName: string | null;
  acquisitionDate: string | null;
  depreciationStartDate: string | null;
  originalCost: number;
  residualRate: number;
  usefulLifeMonths: number | null;
  method: FinanceAssetDepreciationMethod;
  openingAccumulatedAmount: number;
  status: string;
  nonAmortizationReason: string | null;
  note: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  openingAsOfDate: string | null;
  version: number;
  grossCost: number;
  waivedCost: number;
  capitalizedCost: number;
};

export type FinanceAssetPeriodRowDto = {
  assetId: number;
  assetCode: string;
  name: string;
  assetKind: FinanceAssetKind;
  accountCode: string;
  depreciationStartDate: string | null;
  originalCost: number;
  normalAmount: number;
  adjustmentAmount: number;
  periodAmount: number;
  status: string;
  voucherNo: string | null;
};

export type FinanceAssetAdjustmentDto = {
  id: number;
  assetId: number | null;
  assetName: string | null;
  accountId: number | null;
  accountCode: string;
  accountName: string | null;
  amount: number;
  reason: string;
  status: string;
  voucherNo: string | null;
  sourceSheet: string | null;
  sourceRow: number | null;
  createdAt: string;
};

export type FinanceAssetImpairmentAssessmentDto = {
  id: number;
  conclusion: FinanceAssetImpairmentConclusion;
  basis: string;
  evidenceRef: string;
  impairmentAmount: number;
  voucherId: number | null;
  voucherNo: string | null;
  assetScopeFingerprint: string;
  calculationBasisFingerprint: string;
  assetCount: number;
  status: "confirmed";
  assessedBy: number;
  confirmedAt: string;
  version: number;
  allocations: Array<{ assetId: number; assetCode: string; assetName: string; amount: number }>;
};

export type FinanceAssetDisposalDto = {
  id: number;
  assetId: number;
  assetCode: string;
  assetName: string;
  disposalDate: string;
  disposalType: "sold" | "scrapped" | "retired" | "other";
  proceedsAmount: number;
  reason: string;
  evidenceRef: string;
  voucherId: number;
  voucherNo: string;
  status: "confirmed";
  confirmedAt: string;
  version: number;
};

export type FinanceAssetPeriodVoucherLinkDto = {
  voucherNo: string | null;
  linkFingerprint: string;
};

export type FinanceAssetWorkspaceDto = {
  scope: { companyId: number; companyCode: string; companyName: string; year: number; month: number; periodId: number | null; isClosed: boolean };
  policyGroup: {
    companyCode: string;
    companyName: string;
    categories: FinanceAssetCategoryDto[];
  };
  categories: FinanceAssetCategoryDto[];
  cards: FinanceAssetCardDto[];
  periodRows: FinanceAssetPeriodRowDto[];
  adjustments: FinanceAssetAdjustmentDto[];
  impairmentAssessment: FinanceAssetImpairmentAssessmentDto | null;
  disposals: FinanceAssetDisposalDto[];
  periodVoucherLink: FinanceAssetPeriodVoucherLinkDto;
  metrics: {
    normalAmount: number;
    adjustmentAmount: number;
    periodAmount: number;
  };
};

export type CreateFinanceAssetCardInput = {
  companyCode: string;
  assetCode?: string;
  idempotencyKey?: string;
  name: string;
  assetKind: FinanceAssetKind;
  categoryId: number;
  accountYear: number;
  acquisitionDate?: string | null;
  depreciationStartDate?: string | null;
  originalCost: number;
  residualRatePercent?: number;
  usefulLifeMonths?: number | null;
  method?: FinanceAssetDepreciationMethod;
  openingAccumulatedAmount?: number;
  openingAsOfDate?: string | null;
  nonAmortizationReason?: string | null;
  note?: string | null;
};

export type UpdateFinanceAssetCardInput = Omit<CreateFinanceAssetCardInput, "assetCode" | "idempotencyKey"> & {
  assetCode: string;
  id: number;
  version: number;
};

export type UpdateFinanceAssetCategoryPolicyInput = {
  companyCode: string;
  year: number;
  categoryId: number;
  version: number;
  assetAccountId: number;
  accumulatedAccountId?: number | null;
  expenseAccountId?: number | null;
  impairmentLossAccountId?: number | null;
  impairmentAllowanceAccountId?: number | null;
  disposalGainLossAccountId?: number | null;
  defaultUsefulLifeMonths?: number | null;
  defaultResidualRatePercent: number;
  defaultMethod: "straight_line";
  usefulLifeMode: FinanceAssetUsefulLifeMode;
  minimumUsefulLifeMonths?: number | null;
  maximumUsefulLifeMonths?: number | null;
  reviewRequired: boolean;
  classificationRule: string;
};

export type DeleteFinanceAssetCategoryPolicyInput = {
  companyCode: string;
  year: number;
  categoryId: number;
  version: number;
};

export type ConfirmFinanceAssetImpairmentAssessmentInput = {
  companyCode: string;
  year: number;
  month: number;
  version: number;
  conclusion: FinanceAssetImpairmentConclusion;
  basis: string;
  evidenceRef: string;
  impairmentAmount: number;
  voucherNo?: string | null;
  allocations: Array<{ assetId: number; amount: number }>;
};

export type ConfirmFinanceAssetAcquisitionEvidenceInput = {
  companyCode: string;
  year: number;
  month: number;
  assetId: number;
  assetVersion: number;
  voucherNo: string;
  evidenceRef: string;
};

export type ConfirmFinanceAssetDisposalInput = {
  companyCode: string;
  year: number;
  month: number;
  assetId: number;
  assetVersion: number;
  disposalDate: string;
  disposalType: "sold" | "scrapped" | "retired" | "other";
  proceedsAmount: number;
  reason: string;
  evidenceRef: string;
  voucherNo: string;
};

export type LinkFinanceAssetPeriodVoucherInput = {
  companyCode: string;
  year: number;
  month: number;
  voucherNo: string;
  expectedLinkFingerprint: string;
};
