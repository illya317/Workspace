import { z } from "zod";

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
  parentId: z.coerce.number().int().positive().optional().nullable(),
  leadingDepartmentId: z.coerce.number().int().positive("主导部门不能为空"),
});
