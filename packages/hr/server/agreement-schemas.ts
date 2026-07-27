import { z } from "zod";
import {
  employmentAgreementFieldRequired,
  type EmploymentAgreementCommandKind,
} from "@workspace/hr/employment-agreement-field-contract";

const nullableText = z.string().max(1000).nullable().optional();
const businessDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
function commandMeta(kind: EmploymentAgreementCommandKind) {
  return {
    sourceKind: z.string().min(1).max(64).optional(),
    sourceRef: z.string().max(200).nullable().optional(),
    reason: employmentAgreementFieldRequired(kind, "reason")
      ? z.string().trim().min(1).max(1000)
      : nullableText,
  };
}
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

const EmploymentAgreementContentPatchSchema = EmploymentAgreementContentSchema.refine(
  (value) => Object.keys(value).length > 0,
  { message: "至少提交一个协议资料字段" },
);

export const EmploymentAgreementCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("create"),
    employmentId: z.coerce.number().int().positive(),
    isPrimary: z.boolean().optional(),
    effectiveFrom: businessDate,
    effectiveThrough: businessDate.nullable().optional(),
    termKind: z.enum(["initial", "permanent"]).optional(),
    content: EmploymentAgreementContentSchema,
    ...commandMeta("create"),
  }).strict(),
  z.object({
    kind: z.literal("renew"),
    ...target,
    effectiveFrom: businessDate,
    effectiveThrough: businessDate.nullable().optional(),
    termKind: z.enum(["renewal", "permanent"]).optional(),
    ...commandMeta("renew"),
  }).strict(),
  z.object({
    kind: z.literal("end"),
    ...termTarget,
    effectiveThrough: businessDate,
    ...commandMeta("end"),
  }).strict(),
  z.object({
    kind: z.literal("correct"),
    ...termTarget,
    effectiveFrom: businessDate,
    effectiveThrough: businessDate.nullable().optional(),
    termKind: z.enum(["initial", "renewal", "permanent"]).optional(),
    ...commandMeta("correct"),
  }).strict(),
  z.object({ kind: z.literal("supplement-missing"), ...target, patch: EmploymentAgreementContentPatchSchema, ...commandMeta("supplement-missing") }).strict(),
  z.object({ kind: z.literal("correct-existing"), ...target, patch: EmploymentAgreementContentPatchSchema, ...commandMeta("correct-existing") }).strict(),
  z.object({ kind: z.literal("set-primary"), ...target, ...commandMeta("set-primary") }).strict(),
  z.object({ kind: z.literal("cancel-future"), ...termTarget, ...commandMeta("cancel-future") }).strict(),
]);

export const EmploymentAgreementEmployeeParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const EmploymentAgreementListQuerySchema = z.object({
  asOf: businessDate.optional(),
}).strict();
