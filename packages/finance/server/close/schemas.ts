import { z } from "zod";

const companyCode = z.string().trim().min(1).max(64);
const year = z.coerce.number().int().min(2000).max(2099);
const month = z.coerce.number().int().min(1).max(12);
const idempotencyKey = z.string().trim().min(8).max(128);

export const financeCloseScopeSchema = z.object({ companyCode, year, month });

export const openFinanceCloseSchema = financeCloseScopeSchema.extend({ idempotencyKey });

export const refreshFinanceCloseSchema = z.object({
  runId: z.coerce.number().int().positive(),
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey,
});
