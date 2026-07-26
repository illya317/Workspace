import { z } from "zod";

const optionalText = z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : undefined, z.string().optional());
const nullableText = z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : null, z.string().nullable().optional());

export const financeAssetScopeSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export const createFinanceAssetCardSchema = z.object({
  companyCode: z.string().trim().min(1),
  assetCode: z.string().trim().min(1),
  name: z.string().trim().min(1),
  assetKind: z.enum(["fixed_asset", "intangible", "prepaid", "long_term_deferred"]),
  category: nullableText,
  assetAccountCode: z.string().trim().min(1),
  accumulatedAccountCode: nullableText,
  acquisitionDate: nullableText,
  depreciationStartDate: nullableText,
  originalCost: z.coerce.number().nonnegative(),
  residualRate: z.coerce.number().min(0).max(0.999999).optional(),
  usefulLifeMonths: z.coerce.number().int().positive().nullable().optional(),
  method: optionalText,
  openingAccumulatedAmount: z.coerce.number().nonnegative().optional(),
  openingAsOfDate: nullableText,
  nonAmortizationReason: nullableText,
  note: nullableText,
});

export const updateFinanceAssetCardSchema = createFinanceAssetCardSchema.extend({
  id: z.coerce.number().int().positive(),
  version: z.coerce.number().int().positive(),
});

export const createFinanceAssetAdjustmentSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  assetId: z.coerce.number().int().positive().nullable().optional(),
  accountCode: z.string().trim().min(1),
  amount: z.coerce.number().refine((value) => value !== 0),
  reason: z.string().trim().min(1),
});
