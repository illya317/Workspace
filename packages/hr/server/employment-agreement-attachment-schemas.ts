import { z } from "zod";

export const EmploymentAgreementAttachmentUploadSchema = z.object({
  file: z.instanceof(File),
  note: z.string().trim().max(1000).optional(),
});

export const EmploymentAgreementAttachmentRemoveSchema = z.object({
  reason: z.string().trim().min(1, "请填写移除原因").max(500),
});

export const EmploymentAgreementAttachmentParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  agreementUid: z.string().uuid(),
});

export const EmploymentAgreementAttachmentTargetParamsSchema = EmploymentAgreementAttachmentParamsSchema.extend({
  attachmentUid: z.string().uuid(),
});
