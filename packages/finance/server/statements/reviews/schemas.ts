import { z } from "zod";

export const reviewReportTypeSchema = z.enum(["incomeStatement", "cashFlow"]);

export const reviewQuerySchema = z.union([
  z.object({
    workpaperId: z.coerce.number().int().positive(),
  }),
  z.object({
    companyCode: z.string().min(1),
    year: z.coerce.number().int().positive(),
    month: z.coerce.number().int().min(1).max(12),
    reportType: reviewReportTypeSchema,
  }),
]);

export const generateReviewSchema = z.object({
  workpaperId: z.number().int().positive(),
});

export const reviewIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const reviewLineStatusSchema = z.enum(["pending", "confirmed", "adjusted", "flagged"]);

export const updateReviewSchema = z.object({
  lines: z.array(
    z.object({
      lineCode: z.string().min(1),
      adjustedAmount: z.number().finite().nullable().optional(),
      status: reviewLineStatusSchema.optional(),
      comment: z.string().nullable().optional(),
    }),
  ),
  note: z.string().nullable().optional(),
});
