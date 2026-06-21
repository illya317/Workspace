import { NextResponse } from "next/server";
import { authenticate } from "@workspace/platform/server/auth";
import { snapshotHistory } from "@workspace/platform/server/history";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import {
  isValidDateValue,
  rejectInvalidDateField,
} from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { PROJECT_ROLES } from "../constants/field-options";
import { WORK_FK_REGISTRY } from "./fk-registry";
import { buildVisibleProjectWhere, canManageProject, canViewProject } from "./access";

function normalizeProjectRole(value: unknown) {
  if (value === null || value === undefined || value === "") return "执行负责";
  const role = String(value);
  if (role === "项目负责人") return "负责人";
  return PROJECT_ROLES.includes(role as (typeof PROJECT_ROLES)[number]) ? role : null;
}

const DATE_FIELDS = ["startDate", "endDate"];
const EMPLOYEE_PROJECT_CONFIG = {
  entityType: "EmployeeProject",
  modelKey: "employeeProject" as const,
  allowedFields: ["employeeId", "projectId", "role", "startDate", "endDate"],
  onBeforeUpdate: normalizeEmployeeProjectFieldUpdate,
};

async function normalizeEmployeeProjectFieldUpdate(field: string, value: unknown) {
  const dateResult = rejectInvalidDateField(field, value, DATE_FIELDS);
  if (!dateResult) return null;
  if (field === "role") {
    const role = normalizeProjectRole(value);
    return role ? { field, value: role } : null;
  }
  if (field === "projectId") {
    const validation = await validateFkValue(WORK_FK_REGISTRY, {
      fkKey: "work.projects.member.project",
      value,
      requiredLabel: "项目",
    });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  if (field === "employeeId") {
    const validation = await validateFkValue(WORK_FK_REGISTRY, {
      fkKey: "work.projects.member.employee",
      value,
      requiredLabel: "员工",
    });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  return { field, value };
}

export async function listProjectMembers(input: {
  userId: number;
  projectId?: number | null;
  keyword: string;
  page: number;
  pageSize: number;
}) {
  if (input.projectId && !(await canViewProject(input.userId, input.projectId))) {
    return { entries: [], total: 0 };
  }
  const visibleProjectWhere = await buildVisibleProjectWhere(input.userId);
  const where = input.projectId
    ? { projectId: input.projectId }
    : { project: visibleProjectWhere };

  const entries = await prisma.employeeProject.findMany({
    where,
    include: {
      employee: { select: { id: true, employeeId: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { id: "asc" },
  });

  const mapped = entries.map((entry) => ({
    id: entry.id,
    employeeId: entry.employeeId,
    employeeNumber: entry.employee?.employeeId || "",
    employeeName: entry.employee?.name || "",
    projectId: entry.projectId,
    projectName: entry.project?.name || "",
    role: entry.role,
    startDate: entry.startDate,
    endDate: entry.endDate,
  }));

  let result = mapped;
  if (input.keyword) {
    const q = input.keyword.toLowerCase();
    result = mapped.filter(
      (entry) =>
        (entry.employeeName || "").toLowerCase().includes(q) ||
        (entry.projectName || "").toLowerCase().includes(q) ||
        (entry.role || "").toLowerCase().includes(q),
    );
  }

  const total = result.length;
  const start = (input.page - 1) * input.pageSize;
  return { entries: result.slice(start, start + input.pageSize), total };
}

export async function createProjectMember(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const body = (await request.json()) as Record<string, unknown>;
  const { employeeId, projectId, role, startDate, endDate } = body;
  if (!employeeId || !projectId) return NextResponse.json({ error: "数据校验失败" }, { status: 400 });
  for (const field of DATE_FIELDS) {
    if (!isValidDateValue(body[field])) return NextResponse.json({ error: "日期格式错误" }, { status: 400 });
  }
  const projectNumber = Number(projectId);
  if (!Number.isInteger(projectNumber) || projectNumber <= 0) return NextResponse.json({ error: "项目无效" }, { status: 400 });
  if (!(await canManageProject(payload.userId, projectNumber))) return NextResponse.json({ error: "无权限" }, { status: 403 });
  const employee = await prisma.employee.findUnique({
    where: { employeeId: String(employeeId) },
    select: { id: true },
  });
  if (!employee) return NextResponse.json({ error: "员工不存在" }, { status: 400 });
  const employeeValidation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.projects.member.employee",
    value: employee.id,
    requiredLabel: "员工",
  });
  if (!employeeValidation.ok) return NextResponse.json({ error: employeeValidation.error }, { status: employeeValidation.status });
  const projectValidation = await validateFkValue(WORK_FK_REGISTRY, {
    fkKey: "work.projects.member.project",
    value: projectNumber,
    requiredLabel: "项目",
  });
  if (!projectValidation.ok) return NextResponse.json({ error: projectValidation.error }, { status: projectValidation.status });
  const normalizedRole = normalizeProjectRole(role);
  if (!normalizedRole) return NextResponse.json({ error: "项目角色无效" }, { status: 400 });
  const existing = await prisma.employeeProject.findUnique({
    where: { employeeId_projectId: { employeeId: employee.id, projectId: projectNumber } },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ error: "项目成员已存在" }, { status: 409 });
  const record = await prisma.employeeProject.create({
    data: {
      employeeId: employee.id,
      projectId: projectNumber,
      role: normalizedRole,
      startDate: startDate ? String(startDate) : null,
      endDate: endDate ? String(endDate) : null,
      editedBy: payload.userId,
    },
  });
  await snapshotHistory("EmployeeProject", record.id, payload.userId);
  return NextResponse.json({ success: true, record });
}

export async function updateProjectMemberField(request: Request, params: Promise<{ id: string }>) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const recordId = parseInt(id);
  if (!Number.isInteger(recordId)) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const existing = await prisma.employeeProject.findUnique({
    where: { id: recordId },
    select: { employeeId: true, projectId: true },
  });
  if (!existing) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  if (!(await canManageProject(payload.userId, existing.projectId))) return NextResponse.json({ error: "无权限" }, { status: 403 });

  const body = (await request.json()) as { field: string; value: unknown };
  let { field, value } = body;
  const result = await EMPLOYEE_PROJECT_CONFIG.onBeforeUpdate(field, value);
  if (!result) return NextResponse.json({ error: "非法字段" }, { status: 400 });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status || 400 });
  field = result.field;
  value = result.value;
  if (!EMPLOYEE_PROJECT_CONFIG.allowedFields.includes(field)) return NextResponse.json({ error: "非法字段" }, { status: 400 });
  if (field === "projectId" && Number(value) !== existing.projectId && !(await canManageProject(payload.userId, Number(value)))) {
    return NextResponse.json({ error: "无权限" }, { status: 403 });
  }
  if (field === "projectId" && Number(value) !== existing.projectId) {
    const duplicate = await prisma.employeeProject.findUnique({
      where: { employeeId_projectId: { employeeId: existing.employeeId, projectId: Number(value) } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== recordId) return NextResponse.json({ error: "项目成员已存在" }, { status: 409 });
  }
  if (field === "employeeId") {
    const duplicate = await prisma.employeeProject.findUnique({
      where: { employeeId_projectId: { employeeId: Number(value), projectId: existing.projectId } },
      select: { id: true },
    });
    if (duplicate && duplicate.id !== recordId) return NextResponse.json({ error: "项目成员已存在" }, { status: 409 });
  }

  await prisma.employeeProject.update({
    where: { id: recordId },
    data: { [field]: value ?? null, editedBy: payload.userId, editedAt: new Date(), version: { increment: 1 } },
  });
  await snapshotHistory("EmployeeProject", recordId, payload.userId);
  return NextResponse.json({ success: true });
}

export async function deleteProjectMember(request: Request, params: Promise<{ id: string }>) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: "未登录" }, { status: 401 });
  const { id } = await params;
  const recordId = parseInt(id);
  if (!Number.isInteger(recordId)) return NextResponse.json({ error: "ID 无效" }, { status: 400 });
  const existing = await prisma.employeeProject.findUnique({
    where: { id: recordId },
    select: { projectId: true },
  });
  if (!existing) return NextResponse.json({ error: "记录不存在" }, { status: 404 });
  if (!(await canManageProject(payload.userId, existing.projectId))) return NextResponse.json({ error: "无权限" }, { status: 403 });
  await snapshotHistory("EmployeeProject", recordId, payload.userId);
  await prisma.employeeProject.delete({ where: { id: recordId } });
  return NextResponse.json({ success: true });
}
