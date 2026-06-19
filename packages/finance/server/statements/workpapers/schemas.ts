import { z } from "zod";

export const workpaperReportTypeSchema = z.enum(["incomeStatement", "cashFlow"]);

export const workpaperQuerySchema = z.object({
  companyCode: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  reportType: workpaperReportTypeSchema,
});

const workpaperLineSchema = z.object({
  lineCode: z.string().min(1),
  manualAmount: z.number().finite(),
  importedAmount: z.number().finite(),
  formulaText: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
});

export const saveWorkpaperSchema = z.object({
  companyCode: z.string().min(1),
  year: z.number().int().min(2000).max(2100),
  month: z.number().int().min(1).max(12),
  reportType: workpaperReportTypeSchema,
  note: z.string().nullable().optional(),
  lines: z.array(workpaperLineSchema),
});
