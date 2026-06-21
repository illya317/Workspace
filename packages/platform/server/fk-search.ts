import { prisma } from "./prisma";
import {
  archivedBooleanFilter,
  employeeActiveLifecycleStatus,
  matchesFkKeyword,
  type LifecycleScope,
} from "./fk-registry";

const MAX_RESULTS = 50;
const PREFETCH_LIMIT = 1000;

type DepartmentPathLike = {
  code?: string | null;
  name: string;
  parent?: (DepartmentPathLike & { parent?: DepartmentPathLike | null }) | null;
} | null;

function resultLimit(keyword: string) {
  return keyword.length > 3 ? MAX_RESULTS : PREFETCH_LIMIT;
}

function formatDepartmentPath(department: DepartmentPathLike) {
  if (!department) return "";
  return [department.parent?.parent?.name, department.parent?.name, department.name].filter(Boolean).join(" / ");
}

function formatDepartmentCodePath(department: DepartmentPathLike) {
  if (!department) return "";
  return [department.parent?.parent?.code, department.parent?.code, department.code].filter(Boolean).join("/");
}

export async function searchFkDepartments(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.department.findMany({
    where: archivedBooleanFilter(lifecycleScope),
    select: {
      id: true,
      code: true,
      name: true,
      isArchived: true,
      parent: { select: { code: true, name: true, parent: { select: { code: true, name: true } } } },
    },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: formatDepartmentPath(row) || row.name,
      subtitle: row.code,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkPositions(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.position.findMany({
    where: {
      ...archivedBooleanFilter(lifecycleScope),
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
    take: resultLimit(keyword),
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
    .filter((row) => matchesFkKeyword([row.name, row.subtitle, row.departmentPath], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkEmployees(keyword: string, lifecycleScope: LifecycleScope) {
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
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => {
      const active = row.employments.some((employment) => employment.isActive);
      return {
        id: row.id,
        name: row.name,
        subtitle: row.employeeId,
        lifecycleStatus: employeeActiveLifecycleStatus(active),
      };
    })
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkCompanies(keyword: string, lifecycleScope: LifecycleScope) {
  const where = lifecycleScope === "active" ? { isActive: true } : lifecycleScope === "archived" ? { isActive: false } : {};
  const rows = await prisma.company.findMany({
    where,
    select: { id: true, code: true, name: true, isActive: true },
    orderBy: { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code,
      lifecycleStatus: row.isActive ? "active" as const : "inactive" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkUsers(keyword: string) {
  const rows = await prisma.user.findMany({
    select: { id: true, name: true, username: true },
    orderBy: { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({ id: row.id, name: row.name, subtitle: row.username ?? undefined, lifecycleStatus: "active" as const }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkPositionDescriptions(keyword: string) {
  const rows = await prisma.positionDescription.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({ id: row.id, name: row.name, subtitle: row.code, lifecycleStatus: "active" as const }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function searchFkProjects(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.project.findMany({
    where: archivedBooleanFilter(lifecycleScope),
    select: { id: true, name: true, code: true, isArchived: true },
    orderBy: lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: resultLimit(keyword),
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: row.code ?? undefined,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

export async function resolveFkDepartment(id: number) {
  const row = await prisma.department.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
}

export async function resolveFkPosition(id: number) {
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

export async function resolveFkEmployee(id: number) {
  const row = await prisma.employee.findUnique({
    where: { id },
    select: { id: true, name: true, employments: { select: { isActive: true } } },
  });
  return row
    ? { id: row.id, label: row.name, lifecycleStatus: employeeActiveLifecycleStatus(row.employments.some((employment) => employment.isActive)) }
    : null;
}

export async function resolveFkCompany(id: number) {
  const row = await prisma.company.findUnique({ where: { id }, select: { id: true, name: true, isActive: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isActive ? "active" as const : "inactive" as const } : null;
}

export async function resolveFkUser(id: number) {
  const row = await prisma.user.findUnique({ where: { id }, select: { id: true, name: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: "active" as const } : null;
}

export async function resolveFkPositionDescription(id: number) {
  const row = await prisma.positionDescription.findUnique({ where: { id }, select: { id: true, name: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: "active" as const } : null;
}

export async function resolveFkProject(id: number) {
  const row = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
}
