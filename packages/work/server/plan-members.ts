import { snapshotHistory } from "@workspace/platform/server/history";
import { handleCreate, handleDelete, handleUpdateField } from "./work-crud";
import {
  isValidDateValue,
  rejectInvalidDateField,
} from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { WORK_PLAN_ROLES } from "../constants/field-options";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status?: number };
type ProjectBodyRow = Record<string, unknown>;

interface NormalizedProjectRow {
  id: number | null;
  employeeId: number;
  projectId: number;
  role: string | null;
  startDate: string | null;
  endDate: string | null;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  return String(value);
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) ? number : Number.NaN;
}

function normalizeProjectRole(value: unknown) {
  if (value === null || value === undefined || value === "") return "执行负责";
  const role = String(value);
  if (role === "项目负责人") return "负责人";
  return WORK_PLAN_ROLES.includes(role as (typeof WORK_PLAN_ROLES)[number]) ? role : null;
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
    if (value === null || value === undefined || value === "") return { field, value: null };
    const id = Number(value);
    if (!Number.isInteger(id)) return null;
    const project = await prisma.project.findUnique({ where: { id }, select: { id: true } });
    if (!project) return null;
    return { field, value: id };
  }
  return { field, value };
}

async function normalizeProjectRow(row: ProjectBodyRow, employeeId: number): Promise<NormalizedProjectRow | null> {
  const id = nullableNumber(row.id);
  if (Number.isNaN(id)) return null;

  const projectId = nullableNumber(row.projectId);
  if (!projectId || Number.isNaN(projectId)) return null;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) return null;

  const startDate = nullableString(row.startDate);
  const endDate = nullableString(row.endDate);
  if (!isValidDateValue(startDate) || !isValidDateValue(endDate)) return null;

  const role = normalizeProjectRole(row.role);
  if (!role) return null;

  return { id, employeeId, projectId, role, startDate, endDate };
}

export async function updateEmployeeProfileProjects(
  employeeId: number,
  rows: unknown,
  userId: number,
): Promise<ServiceResult<{ success: true; ids: number[]; deletedIds: number[] }>> {
  if (!Number.isInteger(employeeId) || employeeId <= 0) return { ok: false, error: "员工ID无效" };
  if (!Array.isArray(rows)) return { ok: false, error: "请求体无效" };

  const employee = await prisma.employee.findUnique({ where: { id: employeeId }, select: { id: true } });
  if (!employee) return { ok: false, error: "员工不存在", status: 404 };

  const normalizedRows: NormalizedProjectRow[] = [];
  const projectIds = new Set<number>();
  for (const row of rows) {
    const normalized = await normalizeProjectRow(row as ProjectBodyRow, employeeId);
    if (!normalized) return { ok: false, error: "项目记录校验失败" };
    if (projectIds.has(normalized.projectId)) return { ok: false, error: "同一员工不能重复关联同一项目" };
    projectIds.add(normalized.projectId);
    normalizedRows.push(normalized);
  }

  const existingRows = await prisma.employeeProject.findMany({ where: { employeeId }, select: { id: true } });
  const existingIds = new Set(existingRows.map((row) => row.id));
  for (const row of normalizedRows) {
    if (row.id !== null && !existingIds.has(row.id)) return { ok: false, error: "项目记录不属于该员工" };
  }

  const changedIds: number[] = [];
  const keptIds = new Set(normalizedRows.map((row) => row.id).filter((id): id is number => id !== null));
  const deletedIds = existingRows.map((row) => row.id).filter((rowId) => !keptIds.has(rowId));

  await Promise.all(deletedIds.map((rowId) => snapshotHistory("EmployeeProject", rowId, userId)));
  await prisma.$transaction(async (tx) => {
    for (const rowId of deletedIds) {
      await tx.employeeProject.delete({ where: { id: rowId } });
    }
    for (const row of normalizedRows) {
      const { id: rowId, ...data } = row;
      if (rowId) {
        await tx.employeeProject.update({
          where: { id: rowId },
          data: { ...data, editedBy: userId, editedAt: new Date(), version: { increment: 1 } },
        });
        changedIds.push(rowId);
      } else {
        const created = await tx.employeeProject.create({
          data: { ...data, editedBy: userId },
          select: { id: true },
        });
        changedIds.push(created.id);
      }
    }
  });

  await Promise.all(changedIds.map((rowId) => snapshotHistory("EmployeeProject", rowId, userId)));
  return { ok: true, data: { success: true, ids: changedIds, deletedIds } };
}

export async function listWorkPlanMembers(input: {
  projectId?: number | null;
  keyword: string;
  page: number;
  pageSize: number;
}) {
  const where = input.projectId ? { projectId: input.projectId } : {};

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

export async function createWorkPlanMember(request: Request) {
  return handleCreate(request, { entityType: "EmployeeProject", modelKey: "employeeProject" as const }, async (body) => {
    const { employeeId, projectId, role, startDate, endDate } = body;
    if (!employeeId || !projectId) return null;
    for (const field of DATE_FIELDS) if (!isValidDateValue(body[field])) return null;
    const employee = await prisma.employee.findUnique({ where: { employeeId: String(employeeId) }, select: { id: true } });
    if (!employee) return null;
    const projectNumber = Number(projectId);
    if (!Number.isInteger(projectNumber)) return null;
    const project = await prisma.project.findUnique({ where: { id: projectNumber }, select: { id: true } });
    if (!project) return null;
    const normalizedRole = normalizeProjectRole(role);
    if (!normalizedRole) return null;
    return {
      employeeId: employee.id,
      projectId: projectNumber,
      role: normalizedRole,
      startDate: startDate ? String(startDate) : null,
      endDate: endDate ? String(endDate) : null,
    };
  });
}

export async function updateWorkPlanMemberField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, EMPLOYEE_PROJECT_CONFIG);
}

export async function deleteWorkPlanMember(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, EMPLOYEE_PROJECT_CONFIG);
}

export const listEmployeeProjects = listWorkPlanMembers;
export const createEmployeeProject = createWorkPlanMember;
export const updateEmployeeProjectField = updateWorkPlanMemberField;
export const deleteEmployeeProject = deleteWorkPlanMember;
