import { failCommand, okCommand, type DomainValidationResult } from "@workspace/platform/server/domain-validation";
import { rejectInvalidDateField } from "@workspace/platform/server/api";
import { validateFkValue } from "@workspace/platform/server/relation-registry";
import { PROJECT_ROLES } from "../../constants/field-options";
import { canManageProject, canUpdateProjectAction } from "../access";
import { WORK_FK_REGISTRY } from "../fk-registry";
import { employeesFitProjectMemberDepartmentScope } from "../project-member-department-scope";
import {
  findEmployeeIdByNumber,
  findProjectEnablingDepartmentReference,
  findProjectMemberDeleteReference,
  findProjectMemberReference,
} from "../project-member-reference-adapter";

const DATE_FIELDS = ["startDate", "endDate"];
const ENABLING_DEPARTMENT_ROLES = new Set(["负责人", "执行负责", "支持协作", "咨询参与"]);

export interface ProjectMemberCreateCommand {
  employeeId: number;
  employeeNumber: string;
  projectId: number;
  role: string;
  startDate: string | null;
  endDate: string | null;
  editorUserId: number;
}

export interface ProjectMemberFieldUpdateCommand {
  recordId: number;
  field: "role";
  value: string;
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

function isEnablingDepartmentBoundRole(role: string) {
  return ENABLING_DEPARTMENT_ROLES.has(role);
}

async function isEmployeeInProjectEnablingDepartment(projectId: number, employeeId: number, actorUserId: number) {
  const project = await findProjectEnablingDepartmentReference(projectId);
  if (!project) return false;
  const departmentIds = project.enablingDepartments.map((entry) => entry.departmentId);
  return employeesFitProjectMemberDepartmentScope({
    employeeIds: [employeeId],
    actorUserId,
    projectType: project.projectType,
    departmentIds,
  });
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
  const employeeNumber = body.employeeNumber ?? body.employeeId;
  const { projectId, role, startDate, endDate } = body;
  if (!employeeNumber || !projectId) return failCommand("数据校验失败");
  for (const field of DATE_FIELDS) {
    if (!rejectInvalidDateField(field, body[field], DATE_FIELDS)) return failCommand("日期格式错误");
  }

  const projectNumber = Number(projectId);
  if (!Number.isInteger(projectNumber) || projectNumber <= 0) return failCommand("项目无效");
  if (!(await canManageProject(userId, projectNumber)) || !(await canUpdateProjectAction(userId, projectNumber))) return failCommand("无权限", 403);

  const employee = await findEmployeeIdByNumber(String(employeeNumber));
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
  if (
    isEnablingDepartmentBoundRole(normalizedRole)
    && !(await isEmployeeInProjectEnablingDepartment(projectNumber, employee.id, userId))
  ) {
    return failCommand("项目人员必须来自赋能部门及其下属部门，且不能是自己的上级");
  }

  return okCommand({
    employeeId: employee.id,
    employeeNumber: String(employeeNumber),
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
  const existing = await findProjectMemberReference(recordId);
  if (!existing) return failCommand("记录不存在", 404);
  if (existing.recordState !== "confirmed") return failCommand("该项目成员版本已失效", 409);
  if (!(await canManageProject(userId, existing.projectId)) || !(await canUpdateProjectAction(userId, existing.projectId))) return failCommand("无权限", 403);

  if (field !== "role") return failCommand("项目成员身份和期间只能通过生命周期命令变更", 409);

  const result = await normalizeMemberField(field, value);
  if (!result.ok) return result;
  const nextProjectId = existing.projectId;
  const nextEmployeeId = existing.employeeId;
  const nextRole = String(result.data.value);
  if (!nextRole) return failCommand("项目角色无效");
  if (
    isEnablingDepartmentBoundRole(nextRole)
    && !(await isEmployeeInProjectEnablingDepartment(nextProjectId, nextEmployeeId, userId))
  ) {
    return failCommand("项目人员必须来自赋能部门及其下属部门，且不能是自己的上级");
  }

  return okCommand({ recordId, field: "role", value: nextRole });
}

export async function validateProjectMemberDeleteCommand(
  userId: number,
  recordId: number,
): Promise<DomainValidationResult<ProjectMemberDeleteCommand>> {
  const existing = await findProjectMemberDeleteReference(recordId);
  if (!existing) return failCommand("记录不存在", 404);
  if (existing.recordState !== "confirmed") return failCommand("该项目成员版本已失效", 409);
  if (!(await canManageProject(userId, existing.projectId)) || !(await canUpdateProjectAction(userId, existing.projectId))) return failCommand("无权限", 403);
  return okCommand({ recordId });
}
