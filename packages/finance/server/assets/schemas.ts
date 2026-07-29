import { z } from "zod";

const nullableText = z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : null, z.string().nullable().optional());
const nullablePositiveInteger = z.preprocess(
  (value) => value === "" || value == null ? null : value,
  z.coerce.number().int().positive().nullable(),
);

export const financeAssetScopeSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const createFinanceAssetCardSchema = z.object({
  companyCode: z.string().trim().min(1),
  idempotencyKey: z.string().trim().uuid(),
  name: z.string().trim().min(1),
  assetKind: z.enum(["fixed_asset", "intangible", "prepaid", "long_term_deferred"]),
  categoryId: z.coerce.number().int().positive(),
  accountYear: z.coerce.number().int().min(2000).max(2100),
  acquisitionDate: nullableText,
  depreciationStartDate: nullableText,
  originalCost: z.coerce.number().nonnegative(),
  residualRatePercent: z.coerce.number().int().min(0).max(99).optional(),
  usefulLifeMonths: z.coerce.number().int().positive().nullable().optional(),
  method: z.literal("straight_line").optional(),
  openingAccumulatedAmount: z.coerce.number().nonnegative().optional(),
  openingAsOfDate: nullableText,
  nonAmortizationReason: nullableText,
  note: nullableText,
});

export const updateFinanceAssetCardSchema = createFinanceAssetCardSchema.omit({ idempotencyKey: true }).extend({
  assetCode: z.string().trim().min(1),
  id: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
});

export const financeAssetCodePreviewSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  categoryId: z.coerce.number().int().positive(),
});

export const updateFinanceAssetCategoryPolicySchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  categoryId: z.coerce.number().int().positive(),
  version: z.coerce.number().int().min(0),
  assetAccountId: z.coerce.number().int().positive(),
  accumulatedAccountId: nullablePositiveInteger.optional(),
  expenseAccountId: nullablePositiveInteger.optional(),
  impairmentLossAccountId: nullablePositiveInteger.optional(),
  impairmentAllowanceAccountId: nullablePositiveInteger.optional(),
  disposalGainLossAccountId: nullablePositiveInteger.optional(),
  defaultUsefulLifeMonths: nullablePositiveInteger.optional(),
  defaultResidualRatePercent: z.coerce.number().int().min(0).max(99),
  defaultMethod: z.literal("straight_line"),
  usefulLifeMode: z.enum(["required", "required_or_indefinite_basis"]),
  minimumUsefulLifeMonths: nullablePositiveInteger.optional(),
  maximumUsefulLifeMonths: nullablePositiveInteger.optional(),
  reviewRequired: z.boolean(),
  classificationRule: z.string().trim().min(1).max(1000),
});

export const deleteFinanceAssetCategoryPolicySchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  categoryId: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
});

export const confirmFinanceAssetImpairmentAssessmentSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  version: z.coerce.number().int().min(0),
  conclusion: z.enum(["no_indication", "no_impairment", "impairment_recorded"]),
  basis: z.string().trim().min(1).max(4000),
  evidenceRef: z.string().trim().min(1).max(1000),
  impairmentAmount: z.coerce.number().nonnegative(),
  voucherNo: nullableText,
  allocations: z.array(z.object({
    assetId: z.coerce.number().int().positive(),
    amount: z.coerce.number().positive(),
  })).max(10000),
});

export const confirmFinanceAssetAcquisitionEvidenceSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  assetId: z.coerce.number().int().positive(),
  assetVersion: z.coerce.number().int().positive(),
  voucherNo: z.string().trim().min(1),
  evidenceRef: z.string().trim().min(1).max(1000),
});

export const confirmFinanceAssetDisposalSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  assetId: z.coerce.number().int().positive(),
  assetVersion: z.coerce.number().int().positive(),
  disposalDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/),
  disposalType: z.enum(["sold", "scrapped", "retired", "other"]),
  proceedsAmount: z.coerce.number().nonnegative(),
  reason: z.string().trim().min(1).max(4000),
  evidenceRef: z.string().trim().min(1).max(1000),
  voucherNo: z.string().trim().min(1),
});

export const linkFinanceAssetPeriodVoucherSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  voucherNo: z.string().trim().min(1),
  expectedLinkFingerprint: z.string().trim().regex(/^[a-f0-9]{64}$/),
});
