import { z } from "zod";

const dateText = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/);
const nullableDateText = z.preprocess(
  (value) => value == null || value === "" ? null : value,
  dateText.nullable(),
);
const nullableReason = z.preprocess(
  (value) => typeof value === "string" && value.trim() ? value.trim() : null,
  z.string().max(1000).nullable(),
);

export const financeAssetPeriodReplayPreviewSchema = z.object({
  companyCode: z.string().trim().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  rows: z.array(z.object({
    sourceKey: z.string().trim().min(1).max(500),
    assetKind: z.enum(["fixed_asset", "intangible", "prepaid", "long_term_deferred"]),
    originalCost: z.coerce.number().finite().nonnegative(),
    residualRate: z.coerce.number().finite().min(0).lt(1),
    usefulLifeMonths: z.preprocess(
      (value) => value == null || value === "" ? null : value,
      z.coerce.number().int().positive().nullable(),
    ),
    acquisitionDate: dateText,
    depreciationStartDate: nullableDateText.optional(),
    openingAccumulatedAmount: z.coerce.number().finite().nonnegative(),
    openingImpairmentAmount: z.coerce.number().finite().nonnegative().optional().default(0),
    openingAsOfDate: dateText,
    nonAmortizationReason: nullableReason.optional(),
    sourcePeriodAmountControl: z.coerce.number().finite(),
    sourceClosingNetControl: z.coerce.number().finite(),
  })).min(1).max(10000),
});
