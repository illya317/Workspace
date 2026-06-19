import { matchText } from "@workspace/core/search";
import { createFkRegistry, type FkDefinition, type FkLifecycleStatus, type LifecycleScope } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";

const MAX_RESULTS = 50;

function matches(parts: Array<string | null | undefined>, keyword: string) {
  if (!keyword.trim()) return true;
  return parts.some((part) => part && matchText(part, keyword));
}

function activeFilter(scope: LifecycleScope) {
  if (scope === "active") return { isArchived: false };
  if (scope === "archived") return { isArchived: true };
  return {};
}

function formatDepartmentPath(department: { name: string; parent?: { name: string; parent?: { name: string } | null } | null } | null) {
  if (!department) return "";
  const parts = [department.parent?.parent?.name, department.parent?.name, department.name].filter(Boolean);
  return parts.join(" / ");
}

function employeeLifecycleStatus(active: boolean): FkLifecycleStatus {
  return active ? "active" : "inactive";
}

async function searchPlans(keyword: string, lifecycleScope: LifecycleScope) {
  const rows = await prisma.project.findMany({
    where: activeFilter(lifecycleScope),
    select: { id: true, code: true, name: true, isArchived: true },
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
    .map((row) => ({
      id: row.id,
      name: formatDepartmentPath(row) || row.name,
      subtitle: row.code,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matches([row.name, row.subtitle], keyword))
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
      return { id: row.id, name: row.name, subtitle: row.employeeId, lifecycleStatus: employeeLifecycleStatus(active) };
    })
    .filter((row) => matches([row.name, row.subtitle], keyword))
    .slice(0, MAX_RESULTS);
}

async function resolvePlan(id: number) {
  const row = await prisma.project.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
}

async function resolveDepartment(id: number) {
  const row = await prisma.department.findUnique({ where: { id }, select: { id: true, name: true, isArchived: true } });
  return row ? { id: row.id, label: row.name, lifecycleStatus: row.isArchived ? "archived" as const : "active" as const } : null;
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

function defineFk(input: Omit<FkDefinition, "defaultLifecycleScope">): FkDefinition {
  return { ...input, defaultLifecycleScope: "active" };
}

export const WORK_FK_DEFINITIONS: FkDefinition[] = [
  defineFk({
    key: "work.plan.parent",
    source: { entity: "Project", field: "parentId" },
    target: { entity: "Project", label: "上级计划" },
    nullable: true,
    search: ({ keyword, lifecycleScope }) => searchPlans(keyword, lifecycleScope),
    resolve: resolvePlan,
  }),
  defineFk({
    key: "work.plan.leadingDepartment",
    source: { entity: "Project", field: "leadingDepartmentId" },
    target: { entity: "Department", label: "主导部门" },
    nullable: false,
    search: ({ keyword, lifecycleScope }) => searchDepartments(keyword, lifecycleScope),
    resolve: resolveDepartment,
  }),
  defineFk({
    key: "work.plan.member.employee",
    source: { entity: "EmployeeProject", field: "employeeId" },
    target: { entity: "Employee", label: "员工" },
    nullable: false,
    search: ({ keyword, lifecycleScope }) => searchEmployees(keyword, lifecycleScope),
    resolve: resolveEmployee,
  }),
  defineFk({
    key: "work.plan.member.project",
    source: { entity: "EmployeeProject", field: "projectId" },
    target: { entity: "Project", label: "工作计划" },
    nullable: false,
    search: ({ keyword, lifecycleScope }) => searchPlans(keyword, lifecycleScope),
    resolve: resolvePlan,
  }),
];

export const WORK_FK_REGISTRY = createFkRegistry(WORK_FK_DEFINITIONS);
