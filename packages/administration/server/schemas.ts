import { z } from "zod";

const nullableText = z.string().trim().optional().nullable();
const nullableId = z.coerce.number().int().positive().optional().nullable();
const nullableDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD").optional().nullable();
const nullableAmount = z.union([z.string(), z.number()]).optional().nullable();

export const ContractCreateSchema = z.object({
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
  lifecycleStatus: z.enum(["draft", "active", "terminated", "expired", "closed", "unknown"]),
  signatureStatus: z.enum(["unknown", "unsigned", "signed"]),
  performanceStatus: z.enum(["unknown", "not_started", "in_progress", "fulfilled", "breached", "waived"]),
  amount: nullableAmount,
  executedAmount: nullableAmount,
  currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "币种应为三位代码"),
  confidentialityLevel: z.coerce.number().int().min(2).max(4),
  location: nullableText,
  remark: nullableText,
});

export const ContractUpdateSchema = ContractCreateSchema.partial();

export type ContractCreateInput = z.infer<typeof ContractCreateSchema>;
export type ContractUpdateInput = z.infer<typeof ContractUpdateSchema>;
