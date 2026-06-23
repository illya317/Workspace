import { z } from "zod";

function todayDateString() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const dateStringSchema = z.string().refine((value) => value === "" || /^\d{4}-\d{2}-\d{2}$/.test(value), "日期格式错误");
const endDateSchema = dateStringSchema
  .optional()
  .nullable()
  .refine((value) => !value || value <= todayDateString(), "结项日期不能晚于今日");

export const ProjectCreateSchema = z.object({
  name: z.string().min(1, "名称不能为空"),
  description: z.string().optional().nullable(),
  projectLevel: z.string().optional().nullable(),
  plan: z.string().optional().nullable(),
  goal: z.string().optional().nullable(),
  milestones: z.string().optional().nullable(),
  budgetAmount: z.coerce.number().optional().nullable(),
  budgetNote: z.string().optional().nullable(),
  riskNote: z.string().optional().nullable(),
  remark: z.string().optional().nullable(),
  startDate: dateStringSchema.optional().nullable(),
  endDate: endDateSchema,
  completionPercent: z.coerce.number().min(0, "完成度不能小于 0").optional().nullable(),
  leadingDepartmentId: z.coerce.number().int().positive("主导部门不能为空").optional().nullable(),
  leaderEmployeeId: z.coerce.number().int().positive().optional().nullable(),
});
