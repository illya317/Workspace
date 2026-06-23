import type { z } from "zod";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { ProjectCreateSchema } from "../schemas";
import {
  canDeleteProject,
  canEditProject,
  canManageProject,
  isSystemAdminUser,
} from "../access";
import {
  PROJECT_CONFIG,
  PROJECT_CLOSURE_TYPES,
  PROJECT_LEVELS,
  generateProjectCode,
  hasValidProjectDates,
  isFutureDateValue,
  isAllowedProjectOption,
  normalizeLeadingDepartmentId,
  nullableString,
  parseDate,
} from "../project-normalization";

type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

export type ProjectFieldUpdateCommand =
  | { kind: "field"; data: Record<string, unknown> };

export interface ProjectCreateCommand {
  data: Prisma.ProjectUncheckedCreateInput;
  leaderEmployeeId: number | null;
}

export interface ProjectDeleteCommand {
  projectId: number;
}

const PROJECT_MANAGE_FIELDS = new Set(["name", "leadingDepartmentId", "isArchived"]);
const PROJECT_EDIT_FIELDS = new Set([
  "description",
  "projectLevel",
  "plan",
  "goal",
  "milestones",
  "budgetAmount",
  "budgetNote",
  "riskNote",
  "remark",
  "startDate",
  "endDate",
  "closureType",
]);

export async function buildProjectCreateCommand(
  userId: number,
  input: ProjectCreateInput,
): Promise<DomainValidationResult<ProjectCreateCommand>> {
  if (!hasValidProjectDates(input.startDate, input.endDate)) return failCommand("日期格式错误");
  if (isFutureDateValue(input.endDate)) return failCommand("结项日期不能晚于今日");
  if (!isAllowedProjectOption(input.projectLevel, PROJECT_LEVELS)) return failCommand("项目级别无效");
  if (!isAllowedProjectOption(input.closureType, PROJECT_CLOSURE_TYPES)) return failCommand("结项方式无效");
  if (input.endDate && !input.closureType) return failCommand("请选择结项方式");
  if (input.closureType && !input.endDate) return failCommand("请先填写结项日期");

  const leadingDepartmentResult = input.leadingDepartmentId
    ? await normalizeLeadingDepartmentId(input.leadingDepartmentId)
    : null;
  if (!leadingDepartmentResult) return failCommand("请选择主导部门");
  if (leadingDepartmentResult && "error" in leadingDepartmentResult) return failCommand(leadingDepartmentResult.error);
  if (
    leadingDepartmentResult
    && !("error" in leadingDepartmentResult)
    && leadingDepartmentResult.department.managerUserId !== userId
    && !(await isSystemAdminUser(userId))
  ) {
    return failCommand("只有当前部门负责人可以发起部门项目", 403);
  }

  const leaderEmployee = input.leaderEmployeeId ? await prisma.employee.findUnique({
    where: { id: input.leaderEmployeeId },
    select: { id: true },
  }) : await prisma.employee.findFirst({
    where: { userId },
    select: { id: true },
  });
  if (input.leaderEmployeeId && !leaderEmployee) return failCommand("负责人不存在");

  const startDate = parseDate(input.startDate);
  const code = leadingDepartmentResult && !("error" in leadingDepartmentResult)
    ? await generateProjectCode(leadingDepartmentResult.department.code, startDate)
    : null;

  return okCommand({
    data: {
      code,
      name: input.name,
      description: nullableString(input.description),
      projectLevel: nullableString(input.projectLevel) ?? "普通",
      plan: nullableString(input.plan),
      goal: nullableString(input.goal),
      milestones: nullableString(input.milestones),
      budgetAmount: input.budgetAmount ?? null,
      budgetNote: nullableString(input.budgetNote),
      riskNote: nullableString(input.riskNote),
      remark: nullableString(input.remark),
      leadingDepartmentId: leadingDepartmentResult && !("error" in leadingDepartmentResult) ? leadingDepartmentResult.value : null,
      startDate,
      endDate: parseDate(input.endDate),
      closureType: nullableString(input.closureType),
      createdBy: userId,
      editedBy: userId,
    },
    leaderEmployeeId: leaderEmployee?.id ?? null,
  });
}

export async function buildProjectFieldUpdateCommand(input: {
  userId: number;
  projectId: number;
  field: string;
  value: unknown;
}): Promise<DomainValidationResult<ProjectFieldUpdateCommand>> {
  const { userId, projectId, field, value } = input;
  const canManage = await canManageProject(userId, projectId);
  const canEdit = canManage || await canEditProject(userId, projectId);

  if (field === "isArchived") {
    if (!(await canDeleteProject(userId, projectId))) return failCommand("无权限", 403);
    const archived = Boolean(value);
    return okCommand({
      kind: "field",
      data: { isArchived: archived, archivedAt: archived ? new Date() : null },
    });
  }

  if (field === "leadingDepartmentId") {
    if (!canManage) return failCommand("无权限", 403);
    const result = await normalizeLeadingDepartmentId(value);
    if ("error" in result) return failCommand(result.error);
    if (result.department.managerUserId !== userId && !(await isSystemAdminUser(userId))) {
      return failCommand("只有目标部门负责人可以设置主导部门", 403);
    }
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true, startDate: true },
    });
    if (!project) return failCommand("记录不存在", 404);
    const code = await generateProjectCode(result.department.code, project.startDate);
    return okCommand({
      kind: "field",
      data: { leadingDepartmentId: result.value, code },
    });
  }

  if (PROJECT_MANAGE_FIELDS.has(field) && !canManage) return failCommand("无权限", 403);
  if (PROJECT_EDIT_FIELDS.has(field) && !canEdit) return failCommand("无权限", 403);
  if (!PROJECT_MANAGE_FIELDS.has(field) && !PROJECT_EDIT_FIELDS.has(field)) return failCommand("非法字段");

  const result = await PROJECT_CONFIG.onBeforeUpdate?.(field, value, projectId);
  if (!result) return failCommand("非法字段");
  if ("error" in result) return failCommand(result.error);
  if (!PROJECT_CONFIG.allowedFields.includes(result.field)) return failCommand("非法字段");
  return okCommand({ kind: "field", data: { [result.field]: result.value ?? null } });
}

export async function validateProjectDeleteCommand(
  userId: number,
  projectId: number,
): Promise<DomainValidationResult<ProjectDeleteCommand>> {
  if (!(await canDeleteProject(userId, projectId))) return failCommand("无权限", 403);
  return okCommand({ projectId });
}
