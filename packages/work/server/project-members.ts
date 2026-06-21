import { handleCreate, handleDelete, handleUpdateField } from "./work-crud";
import { validateFkValue } from "@workspace/platform/server/fk-registry";
import {
  isValidDateValue,
  rejectInvalidDateField,
} from "@workspace/platform/server/api";
import { prisma } from "@workspace/platform/server/prisma";
import { PROJECT_ROLES } from "../constants/field-options";
import { WORK_FK_REGISTRY } from "./fk-registry";

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
      fkKey: "work.project.member.project",
      value,
      requiredLabel: "项目",
    });
    if (!validation.ok) return { error: validation.error, status: validation.status };
    return { field, value: validation.value };
  }
  return { field, value };
}

export async function listProjectMembers(input: {
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

export async function createProjectMember(request: Request) {
  return handleCreate(request, { entityType: "EmployeeProject", modelKey: "employeeProject" as const }, async (body) => {
    const { employeeId, projectId, role, startDate, endDate } = body;
    if (!employeeId || !projectId) return null;
    for (const field of DATE_FIELDS) if (!isValidDateValue(body[field])) return null;
    const employee = await prisma.employee.findUnique({
      where: { employeeId: String(employeeId) },
      select: { id: true },
    });
    if (!employee) return null;
    const employeeValidation = await validateFkValue(WORK_FK_REGISTRY, {
      fkKey: "work.project.member.employee",
      value: employee.id,
      requiredLabel: "员工",
    });
    if (!employeeValidation.ok) return null;
    const projectNumber = Number(projectId);
    const projectValidation = await validateFkValue(WORK_FK_REGISTRY, {
      fkKey: "work.project.member.project",
      value: projectNumber,
      requiredLabel: "项目",
    });
    if (!projectValidation.ok) return null;
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

export async function updateProjectMemberField(request: Request, params: Promise<{ id: string }>) {
  return handleUpdateField(request, params, EMPLOYEE_PROJECT_CONFIG);
}

export async function deleteProjectMember(request: Request, params: Promise<{ id: string }>) {
  return handleDelete(request, params, EMPLOYEE_PROJECT_CONFIG);
}
