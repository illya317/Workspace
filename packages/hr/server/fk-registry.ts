import { matchText } from "@workspace/core/search";
import { createFkRegistry, type FkDefinition, type FkLifecycleStatus, type LifecycleScope } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { formatDepartmentCodePath, formatDepartmentPath } from "@workspace/hr/utils/department-path";

const MAX_RESULTS = 50;

function matches(parts: Array<string | null | undefined>, keyword: string) {
  if (!keyword.trim()) return true;
  return parts.some((part) => part && matchText(part, keyword));
}

function activeFilter(scope: LifecycleScope, field = "isArchived") {
  if (scope === "active") return { [field]: false };
  if (scope === "archived") return { [field]: true };
  return {};
}

function employeeLifecycleStatus(active: boolean): FkLifecycleStatus {
  return active ? "active" : "inactive";
}

async function searchDepartments(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.department.findMany({
    where: activeFilter(lifecycleScope),
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
    },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: keyword.length > 3 ? MAX_RESULTS : 1000,
  });
  return rows
    .map((row) => {
      const path = formatDepartmentPath(row) || row.name;
      return {
        id: row.id,
        name: path,
        subtitle: row.code,
        lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
      };
    })
    .filter((row) => matches([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

async function searchPositions(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.position.findMany({
    where: {
      ...activeFilter(lifecycleScope),
      ...(lifecycleScope === "active" ? { OR: [{ departmentId: null }, { department: { isArchived: false } }] } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      departmentId: true,
      isArchived: true,
      department: {
        select: {
          code: true,
          name: true,
          parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
        },
      },
    },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: keyword.length > 3 ? MAX_RESULTS : 1000,
  });
  return rows
    .map((row) => {
      const departmentPath = formatDepartmentPath(row.department);
      return {
        id: row.id,
        name: row.name,
        subtitle: [row.code, formatDepartmentCodePath(row.department)].filter(Boolean).join(" · "),
        departmentId: row.departmentId,
        departmentPath,
        lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
      };
    })
    .filter((row) => matches([row.name, row.subtitle, row.departmentPath], keyword))
    .slice(0, MAX_RESULTS);
}

async function searchEmployees(keyword: string, lifecycleScope: LifecycleScope) {
  const where =
    lifecycleScope === "active"
      ? { employments: { some: { isActive: true } } }
      : lifecycleScope === "archived"
        ? { employments: { none: { isActive: true } } }
        : {};
  const rows = await prisma.employee.findMany({
    where,
    select: { id: true, name: true, employeeId: true, employments: { select: { isActive: true } } },
    orderBy: { employeeId: "asc" },
    take: keyword.length > 3 ? MAX_RESULTS : 1000,
  });
  return rows
    .map((row) => {
      const active = row.employments.some((employment) => employment.isActive);
      return {
        id: row.id,
        name: row.name,
        subtitle: row.employeeId,
        lifecycleStatus: employeeLifecycleStatus(active),
      };
    })
    .filter((row) => matches([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

async function searchCompanies(keyword: string, lifecycleScope: LifecycleScope) {
  const where = lifecycleScope === "active" ? { isActive: true } : lifecycleScope === "archived" ? { isActive: false } : {};
  const rows = await prisma.company.findMany({
    where,
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: { id: "asc" },
    take: keyword.length > 3 ? MAX_RESULTS : 1000,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matches([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

async function searchUsers(keyword: string) {
  const rows = await prisma.user.findMany({
    select: { id: true, name: true, username: true },
    orderBy: { id: "asc" },
    take: keyword.length > 3 ? MAX_RESULTS : 1000,
  });
  return rows
    .map((row) => ({ id: row.id, name: row.name, subtitle: row.username ?? undefined, lifecycleStatus: "active" as const }))
    .filter((row) => matches([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

async function searchPositionDescriptions(keyword: string) {
  const rows = await prisma.positionDescription.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { id: "asc" },
    take: keyword.length > 3 ? MAX_RESULTS : 1000,
  });
  return rows
    .map((row) => ({ id: row.id, name: row.name, subtitle: row.code, lifecycleStatus: "active" as const }))
    .filter((row) => matches([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

async function searchProjects(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.project.findMany({
    where: activeFilter(lifecycleScope),
    select: { id: true, name: true, code: true, isArchived: true },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: keyword.length > 3 ? MAX_RESULTS : 1000,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code ?? undefined,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matches([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

async function resolveDepartment(id: number) {
  const row = await prisma.department.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
}

async function resolvePosition(id: number) {
  const row = await prisma.position.findUnique({
    where: { id },
    select: { id: true, name: true, isArchived: true, department: { select: { isArchived: true } } },
  });
  if (!row) return null;
  return {
    id: row.id,
    label: row.name,
    lifecycleStatus: row.isArchived || row.department?.isArchived ? "archived" as const : "active" as const,
  };
}

async function resolveEmployee(id: number) {
  const row = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, name: true, employments: { select: { isActive: true } } },
  });
  return row
    ? { id: row.id, label: row.name, lifecycleStatus: employeeLifecycleStatus(row.employments.some((employment) => employment.isActive)) }
    : null;
}

async function resolveCompany(id: number) {
  const row = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isActive ? "active" as const : "inactive" as const } : null;
}

async function resolveUser(id: number) {
  const row = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: "active" as const } : null;
}

async function resolvePositionDescription(id: number) {
  const row = await prisma.positionDescription.findUnique({ where: { id }, select: { id: true, name: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: "active" as const } : null;
}

async function resolveProject(id: number) {
  const row = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
}

function defineFk(input: Omit<FkDefinition, "defaultLifecycleScope">): FkDefinition {
  return { ...input, defaultLifecycleScope: "active" };
}

export const HR_FK_DEFINITIONS: FkDefinition[] = [
  defineFk({
    key: "hr.department",
    source: { entity: "Any", field: "departmentId" },
    target: { entity: "Department", label: "部门" },
    nullable: true,
    search: ({ keyword, lifecycleScope }) => searchDepartments(keyword, lifecycleScope),
    resolve: resolveDepartment,
  }),
  defineFk({
    key: "hr.position",
    source: { entity: "Any", field: "positionId" },
    target: { entity: "Position", label: "岗位" },
    nullable: true,
    search: ({ keyword, lifecycleScope }) => searchPositions(keyword, lifecycleScope),
    resolve: resolvePosition,
  }),
  defineFk({
    key: "hr.employee",
    source: { entity: "Any", field: "employeeId" },
    target: { entity: "Employee", label: "员工" },
    nullable: true,
    search: ({ keyword, lifecycleScope }) => searchEmployees(keyword, lifecycleScope),
    resolve: resolveEmployee,
  }),
  defineFk({
    key: "hr.company",
    source: { entity: "Contract", field: "company" },
    target: { entity: "Company", label: "公司" },
    nullable: true,
    search: ({ keyword, lifecycleScope }) => searchCompanies(keyword, lifecycleScope),
    resolve: resolveCompany,
  }),
  defineFk({
    key: "platform.user",
    source: { entity: "Any", field: "userId" },
    target: { entity: "User", label: "账号" },
    nullable: true,
    search: ({ keyword }) => searchUsers(keyword),
    resolve: resolveUser,
  }),
  defineFk({
    key: "hr.positionDescription",
    source: { entity: "Position", field: "positionDescriptionId" },
    target: { entity: "PositionDescription", label: "岗位说明书" },
    nullable: true,
    search: ({ keyword }) => searchPositionDescriptions(keyword),
    resolve: resolvePositionDescription,
  }),
  defineFk({
    key: "work.plan",
    source: { entity: "EmployeeProject", field: "projectId" },
    target: { entity: "Project", label: "工作计划" },
    nullable: true,
    search: ({ keyword, lifecycleScope }) => searchProjects(keyword, lifecycleScope),
    resolve: resolveProject,
  }),
  defineFk({
    key: "hr.edp.position",
    source: { entity: "EDP", field: "positionId" },
    target: { entity: "Position", label: "岗位" },
    nullable: false,
    search: ({ keyword, lifecycleScope }) => searchPositions(keyword, lifecycleScope),
    resolve: resolvePosition,
  }),
  defineFk({
    key: "hr.edp.reportTo",
    source: { entity: "EDP", field: "reportTo" },
    target: { entity: "Employee", label: "直接上级" },
    nullable: true,
    search: ({ keyword, lifecycleScope }) => searchEmployees(keyword, lifecycleScope),
    resolve: resolveEmployee,
  }),
  defineFk({
    key: "hr.employeeProject.project",
    source: { entity: "EmployeeProject", field: "projectId" },
    target: { entity: "Project", label: "项目" },
    nullable: false,
    search: ({ keyword, lifecycleScope }) => searchProjects(keyword, lifecycleScope),
    resolve: resolveProject,
  }),
  defineFk({
    key: "hr.position.department",
    source: { entity: "Position", field: "departmentId" },
    target: { entity: "Department", label: "所属部门" },
    nullable: false,
    search: ({ keyword, lifecycleScope }) => searchDepartments(keyword, lifecycleScope),
    resolve: resolveDepartment,
  }),
];

export const HR_FK_REGISTRY = createFkRegistry(HR_FK_DEFINITIONS);
