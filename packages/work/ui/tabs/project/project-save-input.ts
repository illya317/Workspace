import { z } from "zod";

import { validateCompletionSchedule } from "@workspace/platform/completion-date-policy";

import type { ProjectDraft } from "./model";

const nullableDateSchema = z.preprocess(
  (value) => value === "" ? null : value,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式错误").nullable(),
);

const projectSaveSchema = z.object({
  name: z.string().trim().min(1, "项目名称不能为空"),
  projectType: z.enum(["company", "department", "other"]),
  leadingDepartmentId: z.number().nullable(),
  enablingDepartmentIds: z.array(z.number()),
  workspaceEnabled: z.boolean(),
  status: z.enum(["pending", "active", "done"]),
  plannedStartDate: nullableDateSchema,
  plannedEndDate: nullableDateSchema,
  actualStartDate: nullableDateSchema,
  actualEndDate: nullableDateSchema,
}).superRefine((data, ctx) => {
  if (data.enablingDepartmentIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "请选择赋能部门", path: ["enablingDepartmentIds"] });
  }
  if (data.projectType === "department" && !data.leadingDepartmentId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "部门项目必须选择归口部门", path: ["leadingDepartmentId"] });
  }
  const scheduleError = validateCompletionSchedule(data);
  if (scheduleError) ctx.addIssue({ code: z.ZodIssueCode.custom, message: scheduleError, path: ["actualEndDate"] });
});

export function projectSaveInputError(draft: ProjectDraft, name: string) {
  const validation = projectSaveSchema.safeParse({
    name,
    projectType: draft.projectType,
    leadingDepartmentId: draft.leadingDepartmentId,
    enablingDepartmentIds: draft.enablingDepartmentIds,
    workspaceEnabled: draft.workspaceEnabled,
    status: draft.status as "pending" | "active" | "done",
    plannedStartDate: draft.plannedStartDate,
    plannedEndDate: draft.plannedEndDate,
    actualStartDate: draft.actualStartDate,
    actualEndDate: draft.actualEndDate,
  });
  return validation.success ? null : validation.error.issues[0]?.message || "项目信息无效";
}
