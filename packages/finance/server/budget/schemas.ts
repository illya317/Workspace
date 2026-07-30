import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : value),
  z.string().optional(),
);

export const budgetQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2099),
  companyCode: optionalString,
  versionId: z.coerce.number().int().positive().optional(),
});

export const budgetVersionQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2099),
  companyCode: optionalString,
});

export const createBudgetVersionSchema = z.object({
  year: z.coerce.number().int().positive(),
  companyCode: optionalString,
  name: z.string().min(1),
  type: z.enum(["dept", "rd", "all"]).default("all"),
});

export const budgetVersionIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});
