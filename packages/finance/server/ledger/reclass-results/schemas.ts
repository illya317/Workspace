import { z } from "zod";

export const reclassStatusSchema = z.enum([
  "pending",
  "approved",
  "adjusted",
  "rejected",
  "all",
]);

export const listReclassResultsSchema = z.object({
  periodId: z.coerce.number().int().positive(),
  status: reclassStatusSchema.catch("pending"),
  keyword: z.string().min(1).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(200).catch(50),
});

export const buildReclassResultsSchema = z.object({
  periodId: z.coerce.number().int().positive(),
  dryRun: z.boolean().optional(),
});

export const reclassResultIdSchema = z.object({
  id: z.coerce.number().int().min(0),
});

export const manualReclassResultSchema = z.object({
  periodId: z.coerce.number().int().positive(),
  voucherItemId: z.coerce.number().int().positive(),
  sourceAccount: z.string().optional().default(""),
  targetAccount: z.string().min(1),
  amount: z.coerce.number().finite().optional().default(0),
});

export const reviewReclassPayloadSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    note: z.string().optional(),
  }),
  z.object({
    action: z.literal("reject"),
    note: z.string().optional(),
  }),
  z.object({
    action: z.literal("revert"),
  }),
  z.object({
    action: z.literal("mark_pending"),
    note: z.string().optional(),
  }),
  z.object({
    action: z.literal("adjust"),
    targetAccount: z.string().min(1),
    amount: z.coerce.number().finite(),
    note: z.string().optional(),
  }),
]);
