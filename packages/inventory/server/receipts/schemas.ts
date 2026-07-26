import { z } from "zod";
import { isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE } from "@workspace/platform/production-batch-number";

const decimalInput = z.union([z.number(), z.string()]);
const isNonNegativeInteger = (value: unknown) => String(value ?? "").trim() !== "" && Number.isInteger(Number(value)) && Number(value) >= 0;
const nonNegativeIntegerInput = decimalInput.refine(isNonNegativeInteger, "整件数必须是非负整数");
const optionalNonNegativeIntegerInput = decimalInput.optional().nullable().refine(
  (value) => value === null || value === undefined || String(value).trim() === "" || isNonNegativeInteger(value),
  "尾数必须是非负整数",
);
const nonNegativeNumberInput = decimalInput.refine(
  (value) => String(value).trim() !== "" && Number.isFinite(Number(value)) && Number(value) >= 0,
  "工分必须是非负数",
);

export const InventoryReceiptCreateSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  productId: z.coerce.number().int().positive("产品主数据必填"),
  batchNumber: z.string().trim().refine(isProductionBatchNumber, PRODUCTION_BATCH_NUMBER_MESSAGE),
  inputQuantityTenThousands: decimalInput,
  caseQuantity: nonNegativeIntegerInput,
  extraPackageQuantity: optionalNonNegativeIntegerInput,
  packagingNote: z.string().trim().min(1, "包装备注必填"),
  batchId: z.coerce.number().int().positive().optional(),
  productWorkPointVersion: z.coerce.number().int().positive().optional(),
  workPoints: nonNegativeNumberInput,
});

export const InventoryReceiptUpdateSchema = InventoryReceiptCreateSchema.omit({
  batchId: true,
}).extend({
  version: z.coerce.number().int().positive(),
  batchVersion: z.coerce.number().int().positive(),
});

export const InventoryReceiptReportActionSchema = z.object({
  expectedVersion: z.coerce.number().int().positive(),
});

export type InventoryReceiptCreateInput = z.infer<typeof InventoryReceiptCreateSchema>;
export type InventoryReceiptUpdateInput = z.infer<typeof InventoryReceiptUpdateSchema>;
export type InventoryReceiptReportActionInput = z.infer<typeof InventoryReceiptReportActionSchema>;
