import { z } from "zod";
import { SOCIAL_INSURANCE_STOP_REASONS } from "@workspace/hr/constants";
import { EMPLOYEE_SOCIAL_INSURANCE_STATUSES } from "@workspace/hr/employee-social-insurance-contract";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "月份格式应为 YYYY-MM");
const note = z.string().trim().max(1000).nullable().optional();
const target = {
  periodUid: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive(),
};

export const EmployeeSocialInsuranceCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("register"),
    insuranceStatus: z.enum(EMPLOYEE_SOCIAL_INSURANCE_STATUSES),
    companyId: z.coerce.number().int().positive().nullable().optional(),
    startMonth: month.nullable().optional(),
    endMonth: month.nullable().optional(),
    stopReason: z.enum(SOCIAL_INSURANCE_STOP_REASONS).nullable().optional(),
    note,
  }).strict(),
  z.object({
    kind: z.literal("transfer"),
    ...target,
    companyId: z.coerce.number().int().positive(),
    startMonth: month,
    note,
  }).strict(),
  z.object({
    kind: z.literal("stop"),
    ...target,
    endMonth: month,
    stopReason: z.enum(SOCIAL_INSURANCE_STOP_REASONS),
    note,
  }).strict(),
  z.object({
    kind: z.literal("supplement-missing"),
    ...target,
    patch: z.object({
      companyId: z.coerce.number().int().positive().optional(),
      startMonth: month.optional(),
      endMonth: month.optional(),
      stopReason: z.enum(SOCIAL_INSURANCE_STOP_REASONS).optional(),
    }).strict(),
    reason: z.string().trim().min(1).max(1000),
  }).strict(),
]);

export type EmployeeSocialInsuranceCommandInput = z.infer<typeof EmployeeSocialInsuranceCommandSchema>;
