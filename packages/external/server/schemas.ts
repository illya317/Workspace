import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const ExternalPartyQuerySchema = z.object({
  keyword: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce.number().int().positive().max(1000).catch(50),
  asOfDate: z.iso.date({ error: "基准日必须是有效的 YYYY-MM-DD 日期" }).optional(),
});

const ExternalPartyFieldsSchema = z.object({
  existingPartyId: z.number().int().positive().optional(),
  subjectType: z.enum(["organization", "individual"]).optional(),
  relatedPartyType: z.enum([
    "unrelated",
    "group",
    "joint_venture_associate",
    "investor_influence",
    "key_management_related",
    "other_related",
  ]).optional(),
  code: z.string().trim().min(1, "编码必填").max(64),
  name: z.string().trim().min(1, "名称必填").max(120),
  fullName: optionalText(200),
  classification: optionalText(80),
  identityNumber: z.string().trim().min(1, "统一代码或证件号码必填").max(64),
  legalRepresentative: optionalText(80),
  contactPerson: optionalText(80),
  phone: optionalText(64),
  email: optionalText(160).refine(
    (value) => !value || z.string().email().safeParse(value).success,
    "邮箱格式不正确",
  ),
  bankName: optionalText(160),
  bankAccount: optionalText(80),
  address: optionalText(300),
  invoiceTitle: optionalText(200),
  invoiceAddressPhone: optionalText(300),
  settlementTerms: optionalText(120),
  creditLimit: z.number().finite().nonnegative().optional().nullable(),
  creditDays: z.number().int().nonnegative().max(3650).optional().nullable(),
  taxRate: z.number().finite().min(0).max(100).optional().nullable(),
  remark: optionalText(500),
  effectiveOn: z.iso.date({ error: "生效日必须是有效的 YYYY-MM-DD 日期" }).optional(),
  legalFactReason: optionalText(500),
});

export const ExternalPartyCreateSchema = ExternalPartyFieldsSchema.extend({
  availabilityFrom: z.iso.date({ error: "角色启用日必须是有效的 YYYY-MM-DD 日期" }).optional().nullable(),
  availabilityThrough: z.iso.date({ error: "角色结束日必须是有效的 YYYY-MM-DD 日期" }).optional().nullable(),
});

export const ExternalPartyUpdateSchema = ExternalPartyFieldsSchema.partial().extend({
  legalFactRevision: z.number().int().nonnegative().optional(),
});

const availabilityPeriodFields = {
  validFrom: z.iso.date({ error: "角色启用日必须是有效的 YYYY-MM-DD 日期" }).nullable(),
  validThrough: z.iso.date({ error: "角色结束日必须是有效的 YYYY-MM-DD 日期" }).nullable(),
};

export const ExternalPartyRoleAvailabilityCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("schedule"),
    ...availabilityPeriodFields,
    reason: optionalText(500),
  }).strict(),
  z.object({
    kind: z.literal("correct"),
    periodId: z.number().int().positive(),
    ...availabilityPeriodFields,
    reason: z.string().trim().min(1, "更正原因必填").max(500),
  }).strict(),
  z.object({
    kind: z.literal("cancel-future"),
    periodId: z.number().int().positive(),
    reason: z.string().trim().min(1, "取消原因必填").max(500),
  }).strict(),
]);

export const ExternalPartyRoleEndSchema = z.object({
  effectiveOn: z.iso.date({ error: "停用生效日必须是有效的 YYYY-MM-DD 日期" }),
  reason: z.string().trim().min(1, "停用原因必填").max(500),
}).strict();

export type ExternalPartyCreateInput = z.infer<typeof ExternalPartyCreateSchema>;
export type ExternalPartyUpdateInput = z.infer<typeof ExternalPartyUpdateSchema>;
export type ExternalPartyRoleAvailabilityCommandInput = z.infer<typeof ExternalPartyRoleAvailabilityCommandSchema>;
export type ExternalPartyRoleEndInput = z.infer<typeof ExternalPartyRoleEndSchema>;
