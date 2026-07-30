import { z } from "zod";

const nullableText = z.preprocess((value) => typeof value === "string" && value.trim() ? value.trim() : null, z.string().nullable().optional());

export const inventoryScopeSchema = z.object({ companyCode: z.string().trim().min(1), year: z.coerce.number().int().min(2000).max(2100), month: z.coerce.number().int().min(1).max(12) });
export const createInventoryDocumentSchema = z.object({
  companyCode: z.string().trim().min(1), documentNo: z.string().trim().min(1), documentType: z.enum(["receipt", "issue", "adjustment", "transfer"]), documentDate: z.string().trim().min(10), counterparty: nullableText, counterpartyPartyId: z.coerce.number().int().positive().nullable().optional(), referenceNo: nullableText, note: nullableText,
  lines: z.array(z.object({ itemId: z.coerce.number().int().positive(), warehouseId: z.coerce.number().int().positive(), batchId: z.coerce.number().int().positive().nullable().optional(), quantity: z.coerce.number().positive(), unit: z.string().trim().min(1), unitFactor: z.coerce.number().positive().optional(), unitPrice: z.coerce.number().nonnegative().nullable().optional() })).min(1),
});
export const inventoryLifecycleSchema = z.object({ action: z.enum(["post", "reverse"]) });
export const linkInventoryVoucherSchema = inventoryScopeSchema.extend({ voucherId: z.coerce.number().int().positive() });
