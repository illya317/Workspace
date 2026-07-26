import { z } from "zod";

const nullableText = z.string().max(1000).nullable().optional();
const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const commandMeta = {
  sourceKind: z.string().min(1).max(64).optional(),
  sourceRef: z.string().max(200).nullable().optional(),
  reason: nullableText,
};
const target = {
  agreementUid: z.string().min(8).max(128),
  expectedVersion: z.coerce.number().int().positive(),
};
const termTarget = { ...target, termUid: z.string().min(8).max(128) };

export const EmploymentAgreementContentSchema = z.object({
  company: z.string().max(200).nullable().optional(),
  insuranceStatus: z.string().max(100).nullable().optional(),
  legalRelation: z.string().max(100).nullable().optional(),
  contractType: z.string().max(100).nullable().optional(),
  employmentForm: z.string().max(100).nullable().optional(),
  confidentialityDate: businessDate.nullable().optional(),
  nonCompeteDate: businessDate.nullable().optional(),
}).strict();

export const EmploymentAgreementCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    employmentId: z.coerce.number().int().positive(),
    isPrimary: z.boolean().optional(),
    effectiveFrom: businessDate,
    effectiveThrough: businessDate.nullable().optional(),
    termKind: z.enum(["initial", "permanent"]).optional(),
    content: EmploymentAgreementContentSchema,
    ...commandMeta,
  }).strict(),
  z.object({
    kind: z.literal("renew"),
    ...target,
    effectiveFrom: businessDate,
    effectiveThrough: businessDate.nullable().optional(),
    termKind: z.enum(["renewal", "permanent"]).optional(),
    ...commandMeta,
  }).strict(),
  z.object({
    kind: z.literal("end"),
    ...termTarget,
    effectiveThrough: businessDate,
    ...commandMeta,
  }).strict(),
  z.object({
    kind: z.literal("correct"),
    ...termTarget,
    effectiveFrom: businessDate,
    effectiveThrough: businessDate.nullable().optional(),
    termKind: z.enum(["initial", "renewal", "permanent"]).optional(),
    ...commandMeta,
  }).strict(),
  z.object({ kind: z.literal("revise"), ...target, content: EmploymentAgreementContentSchema, ...commandMeta }).strict(),
  z.object({ kind: z.literal("publish"), ...target, revisionUid: z.string().min(8).max(128), ...commandMeta }).strict(),
  z.object({ kind: z.literal("supersede"), ...target, content: EmploymentAgreementContentSchema, ...commandMeta }).strict(),
  z.object({ kind: z.literal("set-primary"), ...target, ...commandMeta }).strict(),
  z.object({ kind: z.literal("cancel-future"), ...termTarget, ...commandMeta }).strict(),
]);

export const EmploymentAgreementEmployeeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const EmploymentAgreementListQuerySchema = z.object({
  asOf: businessDate.optional(),
}).strict();
