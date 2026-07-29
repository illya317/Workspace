import { z } from "zod";
import { FINANCE_CLOSE_WORKPAPER_TASK_KEYS } from "../../types/close";
import { financeCloseScopeSchema } from "./schemas";

const taskKey = z.enum(FINANCE_CLOSE_WORKPAPER_TASK_KEYS);
const idempotencyKey = z.string().trim().min(8).max(128);
const reference = z.string().trim().min(1).max(500);
const voucherReference = z.string().trim().regex(/^finance-voucher:[1-9]\d*$/).max(64);

export const financeCloseWorkpaperQuerySchema = financeCloseScopeSchema.extend({
  taskKey: taskKey.optional(),
});

export const saveFinanceCloseWorkpaperSchema = financeCloseScopeSchema.extend({
  taskKey,
  status: z.enum(["draft", "prepared", "blocked"]),
  conclusion: z.string().trim().min(1).max(4000).nullable(),
  evidenceRefs: z.array(reference).max(100),
  voucherRefs: z.array(voucherReference).max(100),
  expectedVersion: z.coerce.number().int().positive().nullable(),
  idempotencyKey,
});

export const reviewFinanceCloseWorkpaperSchema = financeCloseScopeSchema.extend({
  taskKey,
  expectedVersion: z.coerce.number().int().positive(),
  idempotencyKey,
});
