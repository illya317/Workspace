import { z } from "zod";

export const ContractAttachmentUploadSchema = z.object({
  file: z.instanceof(File),
  kind: z.enum(["signed_contract", "approval_record", "supplement", "supporting_material", "other"]),
  note: z.string().trim().max(1000).optional(),
});

export const ContractAttachmentRemoveSchema = z.object({
  reason: z.string().trim().min(1, "请填写移除原因").max(500),
});

export const ContractRecordCreateSchema = z.object({
  recordType: z.enum(["filing", "supplement", "note"]),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  title: z.string().trim().min(1, "记录标题必填").max(200),
  content: z.string().trim().max(5000).optional(),
});

export const ContractApprovalReferenceSchema = z.object({
  sourceKey: z.string().trim().min(1).max(80),
  externalRecordId: z.string().trim().min(1).max(200),
  externalUrl: z.string().trim().url().max(2000).optional(),
  statusSnapshot: z.string().trim().max(100).optional(),
  approvedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD"),
  note: z.string().trim().max(2000).optional(),
});

export type ContractAttachmentUploadInput = z.infer<typeof ContractAttachmentUploadSchema>;
export type ContractAttachmentRemoveInput = z.infer<typeof ContractAttachmentRemoveSchema>;
export type ContractRecordCreateInput = z.infer<typeof ContractRecordCreateSchema>;
export type ContractApprovalReferenceInput = z.infer<typeof ContractApprovalReferenceSchema>;
