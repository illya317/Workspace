import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { isDepartmentResponsiblePositionUser } from "@workspace/platform/server/business-space-permissions";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { isCompletedStatus, validateCompletionSchedule } from "@workspace/platform/completion-date-policy";
import type { ProjectCreateInput } from "../schemas";
import {
  canDeleteProjectAction,
  canManageProject,
  canUpdateProjectAction,
  isSystemAdminUser,
} from "../access";
import {
  canCreateDepartmentProject,
  canCreateOrganizationProject,
} from "../project-space-action-access";
import {
  PROJECT_CONFIG,
  PROJECT_LEVELS,
  PROJECT_TYPES,
  generateProjectCode,
  hasValidProjectDates,
  isAllowedProjectOption,
  normalizeEnablingDepartmentIds,
  normalizeLeadingDepartmentId,
  normalizeOwningDepartmentForProjectType,
  normalizeProjectType,
  nullableString,
  parseDate,
} from "../project-normalization";
import { employeesFitProjectMemberDepartmentScope } from "../project-member-department-scope";

export type ProjectFieldUpdateCommand =
  | { kind: "field"; data: Record<string, unknown>; enablingDepartmentIds?: number[] };

export interface ProjectCreateCommand {
  data: Prisma.ProjectUncheckedCreateInput;
  enablingDepartmentIds: number[];
  leaderEmployeeId: number | null;
}

export interface ProjectDeleteCommand {
  projectId: number;
}

const PROJECT_MANAGE_FIELDS = new Set(["name", "leadingDepartmentId", "enablingDepartmentIds", "owningDepartmentId", "workspaceEnabled", "isArchived"]);
const PROJECT_EDIT_FIELDS = new Set([
  "description",
  "projectType",
  "projectLevel",
  "plan",
  "goal",
  "milestones",
  "budgetAmount",
  "budgetNote",
  "riskNote",
  "remark",
  "plannedStartDate",
  "plannedEndDate",
  "actualStartDate",
  "actualEndDate",
  "status",
  "completionPercent",
]);

export async function buildProjectCreateCommand(
  userId: number,
  input: ProjectCreateInput,
): Promise<DomainValidationResult<ProjectCreateCommand>> {
  if (!hasValidProjectDates(input.actualStartDate, input.actualEndDate)) return failCommand("日期格式错误");
  const scheduleError = validateCompletionSchedule(input);
  if (scheduleError) return failCommand(scheduleError);
  if (!isAllowedProjectOption(input.projectType, PROJECT_TYPES)) return failCommand("项目类型无效");
  if (!isAllowedProjectOption(input.projectLevel, PROJECT_LEVELS)) return failCommand("项目级别无效");
  if (input.completionPercent !== null && input.completionPercent !== undefined && input.completionPercent < 0) return failCommand("完成度不能小于 0");

  const projectType = normalizeProjectType(input.projectType);
  const actorEmployee = await prisma.employee.findFirst({
    where: { userId, employments: { some: { isActive: true } } },
    select: { id: true },
  });
  if (!actorEmployee && !(await isSystemAdminUser(userId))) return failCommand("只有在职员工可以发起项目", 403);
  if (projectType === "company" && !(await canCreateOrganizationProject(userId))) {
    return failCommand("只有公司项目授权人员可以发起公司项目", 403);
  }
  const enablingDepartmentResult = await normalizeEnablingDepartmentIds(
    input.enablingDepartmentIds?.length ? input.enablingDepartmentIds : input.leadingDepartmentId,
  );
  if ("error" in enablingDepartmentResult) return failCommand(enablingDepartmentResult.error);
  const leadingDepartment = enablingDepartmentResult.departments[0];
  const owningDepartmentResult = await normalizeOwningDepartmentForProjectType(projectType, input.owningDepartmentId);
  if ("error" in owningDepartmentResult) return failCommand(owningDepartmentResult.error);
  if (
    projectType === "department"
    && !(await canCreateDepartmentProject(userId, leadingDepartment.id))
  ) {
    return failCommand("只有当前部门负责人可以发起部门项目", 403);
  }

  const explicitLeaderField = Object.prototype.hasOwnProperty.call(input, "leaderEmployeeId");
  const leaderEmployee = input.leaderEmployeeId ? await prisma.employee.findUnique({
    where: { id: input.leaderEmployeeId },
    select: { id: true },
  }) : explicitLeaderField ? null : actorEmployee;
  if (input.leaderEmployeeId && !leaderEmployee) return failCommand("负责人不存在");
  if (
    leaderEmployee
    && !(await employeesFitProjectMemberDepartmentScope({
      employeeIds: [leaderEmployee.id],
      actorUserId: userId,
      projectType,
      departmentIds: enablingDepartmentResult.value,
    }))
  ) {
    return failCommand("项目人员必须来自赋能部门及其下属部门，且不能是自己的上级");
  }

  const actualStartDate = parseDate(input.actualStartDate);
  let code: string | null;
  try {
    code = await generateProjectCode({
      projectType,
      departmentCode: leadingDepartment.code,
      dateValue: actualStartDate,
    });
  } catch (error) {
    return failCommand(error instanceof Error ? error.message : "项目编号生成失败");
  }

  return okCommand({
    data: {
      code,
      name: input.name,
      description: nullableString(input.description),
      projectType,
      projectLevel: nullableString(input.projectLevel) ?? "普通",
      plan: nullableString(input.plan),
      goal: nullableString(input.goal),
      milestones: nullableString(input.milestones),
      budgetAmount: input.budgetAmount ?? null,
      budgetNote: nullableString(input.budgetNote),
      riskNote: nullableString(input.riskNote),
      remark: nullableString(input.remark),
      status: input.status,
      plannedStartDate: parseDate(input.plannedStartDate),
      plannedEndDate: parseDate(input.plannedEndDate),
      leadingDepartmentId: leadingDepartment.id,
      owningDepartmentId: owningDepartmentResult.value,
      workspaceEnabled: Boolean(input.workspaceEnabled),
      actualStartDate,
      actualEndDate: parseDate(input.actualEndDate),
      completionPercent: input.completionPercent ?? null,
      createdBy: userId,
      editedBy: userId,
    },
    enablingDepartmentIds: enablingDepartmentResult.value,
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
  const canEdit = canManage || await canUpdateProjectAction(userId, projectId);

  if (field === "isArchived") {
    if (!(await canDeleteProjectAction(userId, projectId))) return failCommand("无权限", 403);
    const archived = Boolean(value);
    return okCommand({
      kind: "field",
      data: { isArchived: archived, archivedAt: archived ? new Date() : null },
    });
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      status: true,
      plannedStartDate: true,
      plannedEndDate: true,
      actualStartDate: true,
      actualEndDate: true,
      projectType: true,
      owningDepartmentId: true,
    },
  });
  if (!project) return failCommand("记录不存在", 404);
  const projectType = normalizeProjectType(project.projectType);
  let systemDerivedData: { owningDepartmentId?: number | null } = {};
  if (projectType === "company") {
    const result = await normalizeOwningDepartmentForProjectType(projectType, project.owningDepartmentId);
    if ("error" in result) return failCommand(result.error);
    if (project.owningDepartmentId !== result.value) {
      systemDerivedData = { owningDepartmentId: result.value };
    }
  }

  if (field === "leadingDepartmentId") {
    if (!canManage) return failCommand("无权限", 403);
    if (value === null || value === undefined || value === "") {
      return failCommand("赋能部门不能为空");
    }
    const result = await normalizeLeadingDepartmentId(value);
    if ("error" in result) return failCommand(result.error);
    if (!(await projectRascMembersFitDepartments(projectId, projectType, [result.value], userId))) {
      return failCommand("请先调整 RASC 成员，再变更赋能部门");
    }
    if (!(await isDepartmentResponsiblePositionUser(userId, result.department.id)) && !(await isSystemAdminUser(userId))) {
      return failCommand("只有目标部门负责人可以设置赋能部门", 403);
    }
    const code = projectType === "department"
      ? await generateProjectCode({ projectType, departmentCode: result.department.code, dateValue: project.actualStartDate })
      : undefined;
    return okCommand({
      kind: "field",
      data: { leadingDepartmentId: result.value, ...(code !== undefined ? { code } : {}), ...systemDerivedData },
      enablingDepartmentIds: [result.value],
    });
  }

  if (field === "enablingDepartmentIds") {
    if (!canManage) return failCommand("无权限", 403);
    const result = await normalizeEnablingDepartmentIds(value);
    if ("error" in result) return failCommand(result.error);
    if (!(await projectRascMembersFitDepartments(projectId, projectType, result.value, userId))) {
      return failCommand("请先调整 RASC 成员，再变更赋能部门");
    }
    const primaryDepartment = result.departments[0];
    if (!(await isDepartmentResponsiblePositionUser(userId, primaryDepartment.id)) && !(await isSystemAdminUser(userId))) {
      return failCommand("只有目标部门负责人可以设置赋能部门", 403);
    }
    const code = projectType === "department"
      ? await generateProjectCode({ projectType, departmentCode: primaryDepartment.code, dateValue: project.actualStartDate })
      : undefined;
    return okCommand({
      kind: "field",
      data: { leadingDepartmentId: primaryDepartment.id, ...(code !== undefined ? { code } : {}), ...systemDerivedData },
      enablingDepartmentIds: result.value,
    });
  }

  if (field === "owningDepartmentId") {
    if (!canManage) return failCommand("无权限", 403);
    const result = await normalizeOwningDepartmentForProjectType(projectType, value);
    if ("error" in result) return failCommand(result.error);
    return okCommand({ kind: "field", data: { owningDepartmentId: result.value } });
  }

  if (field === "workspaceEnabled") {
    if (!canManage) return failCommand("无权限", 403);
  }

  if (PROJECT_MANAGE_FIELDS.has(field) && !canManage) return failCommand("无权限", 403);
  if (PROJECT_EDIT_FIELDS.has(field) && !canEdit) return failCommand("无权限", 403);
  if (!PROJECT_MANAGE_FIELDS.has(field) && !PROJECT_EDIT_FIELDS.has(field)) return failCommand("非法字段");
  const result = await PROJECT_CONFIG.onBeforeUpdate?.(field, value, projectId);
  if (!result) return failCommand("非法字段");
  if ("error" in result) return failCommand(result.error);
  if (!PROJECT_CONFIG.allowedFields.includes(result.field)) return failCommand("非法字段");
  const clearActualEndDate = result.field === "status" && !isCompletedStatus(String(result.value || ""));
  const scheduleError = validateCompletionSchedule({
    status: result.field === "status" ? String(result.value || "") : project.status,
    plannedStartDate: result.field === "plannedStartDate" ? result.value as Date | null : project.plannedStartDate,
    plannedEndDate: result.field === "plannedEndDate" ? result.value as Date | null : project.plannedEndDate,
    actualStartDate: result.field === "actualStartDate" ? result.value as Date | null : project.actualStartDate,
    actualEndDate: clearActualEndDate ? null : result.field === "actualEndDate" ? result.value as Date | null : project.actualEndDate,
  });
  if (scheduleError) return failCommand(scheduleError);
  return okCommand({
    kind: "field",
    data: {
      [result.field]: result.value ?? null,
      ...(clearActualEndDate ? { actualEndDate: null } : {}),
      ...systemDerivedData,
    },
  });
}

export async function validateProjectDeleteCommand(
  userId: number,
  projectId: number,
): Promise<DomainValidationResult<ProjectDeleteCommand>> {
  if (!(await canDeleteProjectAction(userId, projectId))) return failCommand("无权限", 403);
  return okCommand({ projectId });
}

async function projectRascMembersFitDepartments(projectId: number, projectType: string, departmentIds: number[], actorUserId: number) {
  const members = await prisma.employeeProject.findMany({
    where: { projectId, role: { in: ["负责人", "项目负责人", "执行负责", "支持协作", "咨询参与"] } },
    select: { employeeId: true },
  });
  return employeesFitProjectMemberDepartmentScope({
    employeeIds: members.map((member) => member.employeeId),
    actorUserId,
    projectType,
    departmentIds,
  });
}
