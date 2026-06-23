import type { z } from "zod";
import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { ProjectCreateSchema } from "../schemas";
import {
  canDeleteProject,
  canEditProject,
  canManageProject,
  canViewProject,
  isSystemAdminUser,
} from "../access";
import {
  PROJECT_CONFIG,
  PROJECT_LEVELS,
  PROJECT_STAGES,
  PROJECT_STATUSES,
  generateProjectCode,
  hasValidProjectDates,
  isAllowedProjectOption,
  normalizeLeadingDepartmentId,
  normalizeProjectParentId,
  normalizeProjectType,
  nullableString,
  parseDate,
} from "../project-normalization";

type ProjectCreateInput = z.infer<typeof ProjectCreateSchema>;

export type ProjectFieldUpdateCommand =
  | { kind: "field"; data: Record<string, unknown> }
  | { kind: "children"; childIds: number[]; children: Array<{ id: number; parentId: number | null }> };

export interface ProjectCreateCommand {
  data: Prisma.ProjectUncheckedCreateInput;
  leaderEmployeeId: number | null;
}

export interface ProjectDeleteCommand {
  projectId: number;
}

const PROJECT_MANAGE_FIELDS = new Set(["name", "parentId", "leadingDepartmentId", "isArchived"]);
const PROJECT_EDIT_FIELDS = new Set([
  "description",
  "status",
  "projectLevel",
  "isMilestone",
  "stage",
  "plan",
  "goal",
  "milestones",
  "budgetAmount",
  "budgetNote",
  "riskNote",
  "remark",
  "startDate",
  "endDate",
]);

export async function buildProjectCreateCommand(
  userId: number,
  input: ProjectCreateInput,
): Promise<DomainValidationResult<ProjectCreateCommand>> {
  if (!hasValidProjectDates(input.startDate, input.endDate)) return failCommand("日期格式错误");
  if (!isAllowedProjectOption(input.status, PROJECT_STATUSES)) return failCommand("项目状态无效");
  if (!isAllowedProjectOption(input.projectLevel, PROJECT_LEVELS)) return failCommand("项目级别无效");
  if (!isAllowedProjectOption(input.stage, PROJECT_STAGES)) return failCommand("项目阶段无效");

  const projectType = normalizeProjectType(input.projectType);
  const parentResult = await normalizeProjectParentId(input.parentId);
  if ("error" in parentResult) return failCommand(parentResult.error);
  if (projectType === "subproject" && !parentResult.value) return failCommand("子项目必须关联上级项目");
  if (parentResult.value && !(await canViewProject(userId, parentResult.value))) {
    return failCommand("上级项目无权限", 403);
  }
  if (projectType === "subproject" && parentResult.value && !(await canManageProject(userId, parentResult.value))) {
    return failCommand("无权限创建子项目", 403);
  }

  const leadingDepartmentResult = input.leadingDepartmentId
    ? await normalizeLeadingDepartmentId(input.leadingDepartmentId)
    : null;
  if (projectType === "department" && !leadingDepartmentResult) return failCommand("部门项目必须选择主导部门");
  if (leadingDepartmentResult && "error" in leadingDepartmentResult) return failCommand(leadingDepartmentResult.error);
  if (
    projectType === "department"
    && leadingDepartmentResult
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
  const code = projectType === "department" && leadingDepartmentResult && !("error" in leadingDepartmentResult)
    ? await generateProjectCode(leadingDepartmentResult.department.code, startDate)
    : null;

  return okCommand({
    data: {
      type: projectType,
      code,
      name: input.name,
      description: nullableString(input.description),
      status: nullableString(input.status),
      projectLevel: nullableString(input.projectLevel) ?? "普通",
      isMilestone: Boolean(input.isMilestone),
      stage: nullableString(input.stage),
      plan: nullableString(input.plan),
      goal: nullableString(input.goal),
      milestones: nullableString(input.milestones),
      budgetAmount: input.budgetAmount ?? null,
      budgetNote: nullableString(input.budgetNote),
      riskNote: nullableString(input.riskNote),
      remark: nullableString(input.remark),
      parentId: parentResult.value,
      leadingDepartmentId: leadingDepartmentResult && !("error" in leadingDepartmentResult) ? leadingDepartmentResult.value : null,
      startDate,
      endDate: parseDate(input.endDate),
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
      select: { id: true, startDate: true, type: true },
    });
    if (!project) return failCommand("记录不存在", 404);
    const code = normalizeProjectType(project.type) === "department"
      ? await generateProjectCode(result.department.code, project.startDate)
      : null;
    return okCommand({
      kind: "field",
      data: { leadingDepartmentId: result.value, code },
    });
  }

  if (field === "childProjectIds") {
    if (!canManage) return failCommand("无权限", 403);
    if (!Array.isArray(value)) return failCommand("子项目无效");
    const childIds = Array.from(new Set(value.map((item) => Number(item))));
    if (childIds.some((id) => !Number.isInteger(id) || id <= 0)) return failCommand("子项目无效");
    if (childIds.includes(projectId)) return failCommand("子项目不能选择当前项目");

    const children = childIds.length > 0
      ? await prisma.project.findMany({
          where: { id: { in: childIds } },
          select: { id: true, parentId: true, isArchived: true },
        })
      : [];
    const childById = new Map(children.map((child) => [child.id, child]));
    for (const childId of childIds) {
      const child = childById.get(childId);
      if (!child) return failCommand("子项目不存在");
      if (child.isArchived) return failCommand("归档项目不能设为子项目");
      if (!(await canViewProject(userId, childId))) return failCommand("子项目无权限", 403);
      const hierarchy = await normalizeProjectParentId(projectId, childId);
      if ("error" in hierarchy) return failCommand(hierarchy.error);
    }
    return okCommand({
      kind: "children",
      childIds,
      children: children.map(({ id, parentId }) => ({ id, parentId })),
    });
  }

  if (PROJECT_MANAGE_FIELDS.has(field) && !canManage) return failCommand("无权限", 403);
  if (PROJECT_EDIT_FIELDS.has(field) && !canEdit) return failCommand("无权限", 403);
  if (!PROJECT_MANAGE_FIELDS.has(field) && !PROJECT_EDIT_FIELDS.has(field)) return failCommand("非法字段");

  const result = await PROJECT_CONFIG.onBeforeUpdate?.(field, value, projectId);
  if (!result) return failCommand("非法字段");
  if ("error" in result) return failCommand(result.error);
  if (!PROJECT_CONFIG.allowedFields.includes(result.field)) return failCommand("非法字段");
  if (result.field === "parentId" && result.value && !(await canViewProject(userId, Number(result.value)))) {
    return failCommand("上级项目无权限", 403);
  }
  return okCommand({ kind: "field", data: { [result.field]: result.value ?? null } });
}

export async function validateProjectDeleteCommand(
  userId: number,
  projectId: number,
): Promise<DomainValidationResult<ProjectDeleteCommand>> {
  if (!(await canDeleteProject(userId, projectId))) return failCommand("无权限", 403);
  return okCommand({ projectId });
}
