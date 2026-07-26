import { z } from "zod";

const nullableText = (max: number) => z.string().trim().max(max).optional().nullable();
const positiveDecimal = z.number().finite().positive().optional().nullable();

export const ProductQuerySchema = z.object({
  keyword: z.string().trim().max(120).optional(),
});

export const ProductCreateSchema = z.object({
  code: z.string().trim().min(1, "产品编码必填").max(64),
  name: z.string().trim().min(1, "产品名称必填").max(120),
  dosageForm: nullableText(80),
  strength: nullableText(120),
  approvalNumber: nullableText(120),
  status: z.enum(["active", "inactive"]).optional(),
  note: nullableText(500),
});

export const ProductUpdateSchema = ProductCreateSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
});

export const ProductSkuCreateSchema = z.object({
  code: z.string().trim().min(1, "SKU 编码必填").max(64),
  name: z.string().trim().min(1, "SKU 名称必填").max(120),
  specification: nullableText(160),
  baseUnit: z.string().trim().min(1, "基本单位必填").max(32),
  contentUnit: nullableText(32),
  unitsPerPackage: positiveDecimal,
  packagesPerCase: positiveDecimal,
  barcode: nullableText(80),
  status: z.enum(["active", "inactive"]).optional(),
});

export const ProductSkuUpdateSchema = ProductSkuCreateSchema.partial().extend({
  expectedVersion: z.number().int().positive(),
});

export type ProductCreateInput = z.infer<typeof ProductCreateSchema>;
export type ProductUpdateInput = z.infer<typeof ProductUpdateSchema>;
export type ProductSkuCreateInput = z.infer<typeof ProductSkuCreateSchema>;
export type ProductSkuUpdateInput = z.infer<typeof ProductSkuUpdateSchema>;
