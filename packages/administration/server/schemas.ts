import { z } from "zod";

const nullableText = z.string().trim().optional().nullable();
const nullableId = z.coerce.number().int().positive().optional().nullable();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").optional().nullable();
const nullableAmount = z.union([z.string(), z.number()]).optional().nullable();

export const ContractLegalFieldsSchema = z.object({
  name: z.string().trim().min(1, "合同名称必填"),
  contractNo: nullableText,
  partyA: nullableText,
  partyB: nullableText,
  shareholder: nullableText,
  categoryId: z.coerce.number().int().positive("合同类型必填"),
  content: nullableText,
  owningCompanyId: nullableId,
  ownerDepartmentId: nullableId,
  partyAId: nullableId,
  partyBId: nullableId,
  handlerEmployeeId: nullableId,
  signedOn: nullableDate,
  expiresOn: nullableDate,
  amount: nullableAmount,
  executedAmount: nullableAmount,
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "币种应为三位代码"),
  confidentialityLevel: z.coerce.number().int().min(2).max(4),
  location: nullableText,
  remark: nullableText,
});

export const ContractCreateSchema = ContractLegalFieldsSchema;
export const ContractUpdateSchema = ContractLegalFieldsSchema.partial();

export const ContractRevisionCreateSchema = ContractLegalFieldsSchema.partial().extend({
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  reason: z.string().trim().min(1, "修订原因必填").max(1000),
});

export const ContractRevisionPublishSchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

export const ContractStateTransitionSchema = z.object({
  axis: z.enum(["lifecycle", "signature", "performance"]),
  toState: z.string().trim().min(1),
  effectiveOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  reason: z.string().trim().min(1, "状态变更原因必填").max(1000),
});

export const ContractStateReverseSchema = z.object({
  reason: z.string().trim().min(1, "冲销原因必填").max(1000),
});

export type ContractCreateInput = z.infer<typeof ContractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof ContractUpdateSchema>;
export type ContractRevisionCreateInput = z.infer<typeof ContractRevisionCreateSchema>;
export type ContractRevisionPublishInput = z.infer<typeof ContractRevisionPublishSchema>;
export type ContractStateTransitionInput = z.infer<typeof ContractStateTransitionSchema>;
export type ContractStateReverseInput = z.infer<typeof ContractStateReverseSchema>;
