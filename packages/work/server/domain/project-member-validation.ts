import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { rejectInvalidDateField } from "@workspace/platform/server/api";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { PROJECT_ROLES } from "../../constants/field-options";
import { canManageProject } from "../access";
import { WORK_FK_REGISTRY } from "../fk-registry";

const DATE_FIELDS = ["startDate", "endDate"];

export interface ProjectMemberCreateCommand {
  employeeId: number;
  projectId: number;
  role: string;
  startDate: string | null;
  endDate: string | null;
  editorUserId: number;
}

export interface ProjectMemberFieldUpdateCommand {
  recordId: number;
  field: string;
  value: unknown;
}

export interface ProjectMemberDeleteCommand {
  recordId: number;
}

function normalizeProjectRole(value: unknown) {
  if (value === null || value === undefined || value === "") return "执行负责";
  const role = String(value);
  if (role === "项目负责人") return "负责人";
  return PROJECT_ROLES.includes(role as (typeof PROJECT_ROLES)[number]) ? role : null;
}

async function normalizeMemberField(field: string, value: unknown): Promise<DomainValidationResult<{ field: string; value: unknown }>> {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return failCommand("日期格式错误");
  if (field === "role") {
    const role = normalizeProjectRole(value);
    return role ? okCommand({ field, value: role }) : failCommand("项目角色无效");
  }
  if (field === "projectId") {
    const validation = await validateFkValue(WORK_FK_REGISTRY, {
      fkKey: "work.projects.member.project",
      value,
      requiredLabel: "项目",
    });
    if (!validation.ok) return failCommand(validation.error, validation.status);
    return okCommand({ field, value: validation.value });
  }
  if (field === "employeeId") {
    const validation = await validateFkValue(WORK_FK_REGISTRY, {
      fkKey: "work.projects.member.employee",
      value,
      requiredLabel: "员工",
    });
    if (!validation.ok) return failCommand(validation.error, validation.status);
    return okCommand({ field, value: validation.value });
  }
  return okCommand({ field, value });
}

export async function buildProjectMemberCreateCommand(
  userId: number,
  body: Record<string, unknown>,
): Promise<DomainValidationResult<ProjectMemberCreateCommand>> {
  const { employeeId, projectId, role, startDate, endDate } = body;
  if (!employeeId || !projectId) return failCommand("数据校验失败");
  for (const field of DATE_FIELDS) {
    if (!rejectInvalidDateField(field, body[field], DATE_FIELDS)) return failCommand("日期格式错误");
  }

  const projectNumber = Number(projectId);
  if (!Number.isInteger(projectNumber) || projectNumber <= 0) return failCommand("项目无效");
  if (!(await canManageProject(userId, projectNumber))) return failCommand("无权限", 403);

  const employee = await prisma.employee.findUnique({
    where: { employeeId: String(employeeId) },
    select: { id: true },
  });
  if (!employee) return failCommand("员工不存在");

  const employeeValidation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.projects.member.employee",
    value: employee.id,
    requiredLabel: "员工",
  });
  if (!employeeValidation.ok) return failCommand(employeeValidation.error, employeeValidation.status);

  const projectValidation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.projects.member.project",
    value: projectNumber,
    requiredLabel: "项目",
  });
  if (!projectValidation.ok) return failCommand(projectValidation.error, projectValidation.status);

  const normalizedRole = normalizeProjectRole(role);
  if (!normalizedRole) return failCommand("项目角色无效");

  const existing = await prisma.employeeProject.findUnique({
    where: { employeeId_projectId: { employeeId: employee.id, projectId: projectNumber } },
    select: { id: true },
  });
  if (existing) return failCommand("项目成员已存在", 409);

  return okCommand({
    employeeId: employee.id,
    projectId: projectNumber,
    role: normalizedRole,
    startDate: startDate ? String(startDate) : null,
    endDate: endDate ? String(endDate) : null,
    editorUserId: userId,
  });
}

export async function buildProjectMemberFieldUpdateCommand(
  userId: number,
  recordId: number,
  field: string,
  value: unknown,
): Promise<DomainValidationResult<ProjectMemberFieldUpdateCommand>> {
  const existing = await prisma.employeeProject.findUnique({
    where: { id: recordId },
    select: { employeeId: true, projectId: true },
  });
  if (!existing) return failCommand("记录不存在", 404);
  if (!(await canManageProject(userId, existing.projectId))) return failCommand("无权限", 403);

  const result = await normalizeMemberField(field, value);
  if (!result.ok) return result;
  if (field === "projectId" && Number(result.data.value) !== existing.projectId && !(await canManageProject(userId, Number(result.data.value)))) {
    return failCommand("无权限", 403);
  }
  if (field === "projectId" && Number(result.data.value) !== existing.projectId) {
    const duplicate = await prisma.employeeProject.findUnique({
      where: { employeeId_projectId: { employeeId: existing.employeeId, projectId: Number(result.data.value) } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== recordId) return failCommand("项目成员已存在", 409);
  }
  if (field === "employeeId") {
    const duplicate = await prisma.employeeProject.findUnique({
      where: { employeeId_projectId: { employeeId: Number(result.data.value), projectId: existing.projectId } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== recordId) return failCommand("项目成员已存在", 409);
  }

  return okCommand({ recordId, field: result.data.field, value: result.data.value });
}

export async function validateProjectMemberDeleteCommand(
  userId: number,
  recordId: number,
): Promise<DomainValidationResult<ProjectMemberDeleteCommand>> {
  const existing = await prisma.employeeProject.findUnique({
    where: { id: recordId },
    select: { projectId: true },
  });
  if (!existing) return failCommand("记录不存在", 404);
  if (!(await canManageProject(userId, existing.projectId))) return failCommand("无权限", 403);
  return okCommand({ recordId });
}
