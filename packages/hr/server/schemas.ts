import { z } from "zod";

export const OrganizationStructureLifecycleSchema = z.object({
  kind: z.enum(["schedule", "correct", "end-date", "cancel-future"]).optional(),
  effectiveOn: z.string().optional(),
  expectedSequence: z.coerce.number().int().min(0).optional(),
  reason: z.string().optional().nullable(),
  targetVersionId: z.coerce.number().int().positive().optional().nullable(),
}).optional();

export const EmployeeCreateSchema = z.object({
  employeeId: z.string().min(1, "员工编号必填"),
  name: z.string().min(1, "姓名必填"),
  alias: z.string().optional().nullable(),
  gender: z.union([z.boolean(), z.string()]).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  ethnicity: z.string().optional().nullable(),
  hometown: z.string().optional().nullable(),
  politics: z.string().optional().nullable(),
  education: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  school: z.string().optional().nullable(),
  major: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  workStartDate: z.string().optional().nullable(),
  idNumber: z.string().optional().nullable(),
  otherId: z.string().optional().nullable(),
  userId: z.coerce.number().optional().nullable(),
});

export const DepartmentCreateSchema = z.object({
  code: z.string().min(1, "编码必填"),
  name: z.string().min(1, "名称必填"),
  alias: z.string().optional().nullable(),
  hierarchyKind: z.enum(["G", "M"]).optional().nullable(),
  level: z.number().optional().nullable(),
  parentId: z.coerce.number().optional().nullable(),
  managerPositionId: z.coerce.number().optional().nullable(),
  lifecycle: OrganizationStructureLifecycleSchema,
});

export const PositionCreateSchema = z.object({
  code: z.string().min(1, "编码必填"),
  name: z.string().min(1, "名称必填"),
  alias: z.string().optional().nullable(),
  departmentId: z.union([z.number(), z.string()]).optional().nullable(),
  reportToPositionId: z.union([z.number(), z.string()]).optional().nullable(),
  positionDescription: z.object({
    positionPurpose: z.string().optional().nullable(),
    summary: z.string().optional().nullable(),
    headcount: z.union([z.string(), z.number()]).optional().nullable(),
    version: z.string().optional().nullable(),
    effectiveDate: z.string().optional().nullable(),
    sourceFile: z.string().optional().nullable(),
    details: z.string().optional().nullable(),
  }).optional().nullable(),
  lifecycle: OrganizationStructureLifecycleSchema,
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  description: z.string().optional().nullable(),
  status: z.string().optional().nullable(),
  priority: z.string().optional().nullable(),
  stage: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  milestones: z.string().optional().nullable(),
  budgetAmount: z.coerce.number().optional().nullable(),
  budgetNote: z.string().optional().nullable(),
  riskNote: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});
