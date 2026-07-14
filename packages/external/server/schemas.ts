import { z } from "zod";

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const ExternalPartyQuerySchema = z.object({
  keyword: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().catch(1),
  pageSize: z.coerce.number().int().positive().max(200).catch(50),
});

export const ExternalPartyCreateSchema = z.object({
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
  identityNumber: optionalText(64),
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
  isActive: z.boolean().optional(),
});

export const ExternalPartyUpdateSchema = ExternalPartyCreateSchema.partial();

export type ExternalPartyCreateInput = z.infer<typeof ExternalPartyCreateSchema>;
export type ExternalPartyUpdateInput = z.infer<typeof ExternalPartyUpdateSchema>;
