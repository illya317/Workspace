import {
  failCommand,
  okCommand,
  type DomainValidationResult,
} from "@workspace/platform/server/domain-validation";
import {
  archivedBooleanFilter,
  matchesFkKeyword,
  type FkOption,
  type LifecycleScope,
} from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { formatDepartmentPath } from "@workspace/hr/utils/department-path";

export async function organizationAncestorIds(departmentId: number | null | undefined) {
  if (!departmentId) return [];
  const departments = await prisma.department.findMany({
    select: { id: true, parentId: true },
  });
  const byId = new Map(departments.map((department) => [department.id, department]));
  const ids: number[] = [];
  const seen = new Set<number>();
  let currentId: number | null = departmentId;
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId);
    const department = byId.get(currentId);
    if (!department) break;
    ids.push(department.id);
    currentId = department.parentId;
  }
  return ids;
}

export async function validatePositionInOrganizationScope(input: {
  positionId: number | null;
  departmentId: number | null;
  label: string;
  scopeLabel: string;
  excludePositionId?: number | null;
}): Promise<DomainValidationResult<number | null>> {
  if (!input.positionId) return okCommand(null);
  const position = await prisma.position.findUnique({
    where: { id: input.positionId },
    select: { id: true, departmentId: true, isArchived: true },
  });
  if (!position) return failCommand(`${input.label}不存在`, 404);
  if (position.isArchived) return failCommand(`归档岗位不能作为${input.label}`);
  if (input.excludePositionId && position.id === input.excludePositionId) {
    return failCommand(`${input.label}不能是岗位自身`);
  }
  if (!input.departmentId) return failCommand("请先选择直属组织");
  const departmentIds = await organizationAncestorIds(input.departmentId);
  if (!position.departmentId || !departmentIds.includes(position.departmentId)) {
    return failCommand(`${input.label}必须来源于${input.scopeLabel}或其上级组织`);
  }
  return okCommand(position.id);
}

export async function searchPositionsInOrganizationScope(input: {
  keyword: string;
  lifecycleScope: LifecycleScope;
  departmentId: number | null;
}): Promise<FkOption[]> {
  const departmentIds = await organizationAncestorIds(input.departmentId);
  if (departmentIds.length === 0) return [];
  const rankByDepartmentId = new Map(departmentIds.map((id, index) => [id, index]));
  const rows = await prisma.position.findMany({
    where: {
      departmentId: { in: departmentIds },
      ...archivedBooleanFilter(input.lifecycleScope),
      ...(input.lifecycleScope === "active" ? { department: { isArchived: false } } : {}),
    },
    select: {
      id: true,
      code: true,
      name: true,
      departmentId: true,
      isArchived: true,
      department: {
        select: {
          name: true,
          parent: { select: { name: true, parent: { select: { name: true } } } },
        },
      },
    },
    orderBy: input.lifecycleScope === "archived" ? [{ archivedAt: "desc" }, { id: "desc" }] : { id: "asc" },
    take: 200,
  });
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      subtitle: [row.code, formatDepartmentPath(row.department) || row.department?.name].filter(Boolean).join(" · "),
      departmentId: row.departmentId,
      departmentPath: row.department?.name || null,
      searchPath: formatDepartmentPath(row.department) || row.department?.name || null,
      lifecycleStatus: row.isArchived ? "archived" as const : "active" as const,
    }))
    .filter((row) => matchesFkKeyword([row.name, row.subtitle, row.searchPath], input.keyword))
    .sort((left, right) => (rankByDepartmentId.get(left.departmentId ?? 0) ?? 99) - (rankByDepartmentId.get(right.departmentId ?? 0) ?? 99) || left.id - right.id)
    .map(({ searchPath: _searchPath, ...row }) => row)
    .slice(0, 50);
}
