import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { isDepartmentResponsiblePositionUser } from "@workspace/platform/server/business-space-permissions";
import { Prisma, prisma } from "@workspace/platform/server/prisma";
import { isCompletedStatus, validateCompletionSchedule } from "@workspace/platform/completion-date-policy";
import { workspaceBusinessDate } from "@workspace/platform/server/business-date";
import type { ProjectCreateInput } from "../schemas";
import {
  canDeleteProjectAction,
  canManageProject,
  canUpdateProjectAction,
  getUserEmployeeIds,
  isSystemAdminUser,
} from "../access";
import {
  PROJECT_CONFIG,
  PROJECT_LEVELS,
  PROJECT_TYPES,
  generateProjectCode,
  hasValidProjectDates,
  isAllowedProjectOption,
  normalizeEnablingDepartmentIds,
  normalizeLeadingDepartmentForProjectType,
  normalizeLeadingDepartmentId,
  normalizeProjectType,
  nullableString,
  parseDate,
} from "../project-normalization";
import { employeesFitProjectMemberDepartmentScope } from "../project-member-department-scope";
import { projectMemberHasActiveEmploymentOnDate } from "../project-access-temporal";

export type ProjectFieldUpdateCommand =
  | { kind: "field"; data: Record<string, unknown>; enablingDepartmentIds?: number[] };

export interface ProjectCreateCommand {
  data: Prisma.ProjectUncheckedCreateInput;
  enablingDepartmentIds: number[];
  members: Array<{ employeeId: number; role: string }>;
}

export interface ProjectDeleteCommand {
  projectId: number;
}

const PROJECT_MANAGE_FIELDS = new Set(["name", "leadingDepartmentId", "enablingDepartmentIds", "workspaceEnabled", "isArchived"]);
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
  const actorEmployeeId = (await getUserEmployeeIds(userId))[0] ?? null;
  const actorEmployee = actorEmployeeId ? { id: actorEmployeeId } : null;
  if (!actorEmployee && !(await isSystemAdminUser(userId))) return failCommand("只有在职员工或管理员可以发起项目", 403);
  const enablingDepartmentResult = await normalizeEnablingDepartmentIds(
    input.enablingDepartmentIds,
  );
  if ("error" in enablingDepartmentResult) return failCommand(enablingDepartmentResult.error);
  const leadingDepartmentResult = await normalizeLeadingDepartmentForProjectType(projectType, input.leadingDepartmentId);
  if ("error" in leadingDepartmentResult) return failCommand(leadingDepartmentResult.error);

  const explicitLeaderField = Object.prototype.hasOwnProperty.call(input, "leaderEmployeeId");
  const requestedMembers = input.members?.length
    ? input.members
    : input.leaderEmployeeId
      ? [{ employeeId: input.leaderEmployeeId, role: "负责人" as const }]
      : explicitLeaderField
        ? []
        : actorEmployee
          ? [{ employeeId: actorEmployee.id, role: "负责人" as const }]
          : [];
  const memberIds = requestedMembers.map((member) => member.employeeId);
  if (new Set(memberIds).size !== memberIds.length) return failCommand("同一项目人员不能重复承担多个角色");
  if (requestedMembers.filter((member) => member.role === "负责人").length > 1) return failCommand("项目只能设置一名负责人");
  const existingMembers = memberIds.length ? await prisma.employee.count({ where: { id: { in: memberIds } } }) : 0;
  if (existingMembers !== memberIds.length) return failCommand("项目人员不存在");
  const scopedMemberIds = requestedMembers
    .filter((member) => member.role !== "知会")
    .map((member) => member.employeeId);
  if (
    scopedMemberIds.length
    && !(await employeesFitProjectMemberDepartmentScope({
      employeeIds: scopedMemberIds,
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
      departmentCode: leadingDepartmentResult.department?.code,
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
      leadingDepartmentId: leadingDepartmentResult.value,
      workspaceEnabled: Boolean(input.workspaceEnabled),
      actualStartDate,
      actualEndDate: parseDate(input.actualEndDate),
      completionPercent: input.completionPercent ?? null,
      createdBy: userId,
      editedBy: userId,
    },
    enablingDepartmentIds: enablingDepartmentResult.value,
    members: requestedMembers,
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
      leadingDepartmentId: true,
    },
  });
  if (!project) return failCommand("记录不存在", 404);
  const projectType = normalizeProjectType(project.projectType);
  let systemDerivedData: { leadingDepartmentId?: number | null } = {};
  if (projectType === "company") {
    const result = await normalizeLeadingDepartmentForProjectType(projectType, project.leadingDepartmentId);
    if ("error" in result) return failCommand(result.error);
    if (project.leadingDepartmentId !== result.value) {
      systemDerivedData = { leadingDepartmentId: result.value };
    }
  }

  if (field === "leadingDepartmentId") {
    if (!canManage) return failCommand("无权限", 403);
    if (value === null || value === undefined || value === "") {
      return failCommand("归口部门不能为空");
    }
    const result = await normalizeLeadingDepartmentId(value);
    if ("error" in result) return failCommand(result.error);
    if (!(await isDepartmentResponsiblePositionUser(userId, result.department.id)) && !(await isSystemAdminUser(userId))) {
      return failCommand("只有目标部门负责人可以设置归口部门", 403);
    }
    const code = projectType === "department"
      ? await generateProjectCode({ projectType, departmentCode: result.department.code, dateValue: project.actualStartDate })
      : undefined;
    return okCommand({
      kind: "field",
      data: { leadingDepartmentId: result.value, ...(code !== undefined ? { code } : {}), ...systemDerivedData },
    });
  }

  if (field === "enablingDepartmentIds") {
    if (!canManage) return failCommand("无权限", 403);
    const result = await normalizeEnablingDepartmentIds(value);
    if ("error" in result) return failCommand(result.error);
    if (!(await projectRascMembersFitDepartments(projectId, projectType, result.value, userId))) {
      return failCommand("请先调整 RASC 成员，再变更赋能部门");
    }
    return okCommand({
      kind: "field",
      data: { ...systemDerivedData },
      enablingDepartmentIds: result.value,
    });
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
    where: {
      projectId,
      role: { in: ["负责人", "项目负责人", "执行负责", "支持协作", "咨询参与"] },
      recordState: "confirmed",
    },
    select: {
      employeeId: true,
      startDate: true,
      endDate: true,
      employee: {
        select: {
          employments: { select: { isActive: true, joinDate: true, leaveDate: true } },
        },
      },
    },
  });
  const asOfDate = workspaceBusinessDate(new Date());
  return employeesFitProjectMemberDepartmentScope({
    employeeIds: members
      .filter((member) => projectMemberHasActiveEmploymentOnDate(member, member.employee.employments, asOfDate))
      .map((member) => member.employeeId),
    actorUserId,
    projectType,
    departmentIds,
  });
}
