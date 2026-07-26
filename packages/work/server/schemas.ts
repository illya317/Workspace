import { z } from "zod";
import { todayDateString } from "@workspace/platform/completion-date-policy";

const dateStringSchema = z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "日期格式错误");
const startDateSchema = dateStringSchema
  .optional()
  .nullable()
  .refine((value) => !value || value <= todayDateString(), "实际开始不能晚于今日");
const endDateSchema = dateStringSchema
  .optional()
  .nullable()
  .refine((value) => !value || value <= todayDateString(), "结项日期不能晚于今日");
const positiveIntArraySchema = z.array(z.coerce.number().int().positive()).optional().nullable();
const projectMemberSchema = z.object({
  employeeId: z.coerce.number().int().positive(),
  role: z.enum(["负责人", "执行负责", "支持协作", "咨询参与", "知会"]),
});

export const WorkProjectIdParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  description: z.string().optional().nullable(),
  projectType: z.enum(["company", "department", "other"]),
  projectLevel: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  milestones: z.string().optional().nullable(),
  budgetAmount: z.coerce.number().optional().nullable(),
  budgetNote: z.string().optional().nullable(),
  riskNote: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  status: z.enum(["pending", "active", "done"]).default("pending"),
  plannedStartDate: dateStringSchema.optional().nullable(),
  plannedEndDate: dateStringSchema.optional().nullable(),
  actualStartDate: startDateSchema,
  actualEndDate: endDateSchema,
  completionPercent: z.coerce.number().min(0, "完成度不能小于 0").optional().nullable(),
  leadingDepartmentId: z.coerce.number().int().positive("归口部门不能为空").optional().nullable(),
  enablingDepartmentIds: positiveIntArraySchema,
  workspaceEnabled: z.coerce.boolean().optional().nullable(),
  leaderEmployeeId: z.coerce.number().int().positive().optional().nullable(),
  members: z.array(projectMemberSchema).optional().nullable(),
});

export type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;
