import {
  currentOpenEndedDateWhere,
  matchesFkKeyword,
  type FkOption,
} from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";

type WorkSourceDepartment = {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
};

const MAX_DEPARTMENT_DEPTH = 20;
const MAX_SOURCE_DEPARTMENT_OPTIONS = 20;
const SOURCE_DEPARTMENT_HIERARCHY_KINDS = ["M", "G"];

export async function listWorkSourceDepartmentOptions(input: {
  userId: number;
  keyword: string;
  targetType?: string | null;
  targetId?: number | null;
}): Promise<FkOption[]> {
  const keyword = input.keyword.trim();
  const departments = input.targetType && input.targetId
    ? await listWorkSourceDepartmentsForScope({ targetType: input.targetType, targetId: input.targetId })
    : await listAllowedWorkSourceDepartments(input.userId);
  return departments
    .map((department) => ({
      id: department.id,
      name: department.name,
      subtitle: department.code || undefined,
      lifecycleStatus: "active" as const,
    }))
    .filter((option) => matchesFkKeyword([option.name, option.subtitle], keyword))
    .slice(0, MAX_SOURCE_DEPARTMENT_OPTIONS);
}

export async function validateWorkSourceDepartmentSelection(input: {
  userId?: number | null;
  sourceType?: string | null;
  sourceDepartmentId?: number | null;
}) {
  if (input.sourceType !== "department") return null;
  if (!input.sourceDepartmentId) return "部门来源必须选择来源部门";
  if (!input.userId) return "缺少来源部门校验人";
  const allowedIds = new Set((await listAllowedWorkSourceDepartments(input.userId)).map((department) => department.id));
  if (!allowedIds.has(input.sourceDepartmentId)) return "只能选择自己的部门或上级部门作为来源";
  return null;
}

export async function listWorkSourceDepartmentsForScope(input: {
  targetType?: string | null;
  targetId?: number | null;
}): Promise<WorkSourceDepartment[]> {
  if (input.targetType === "department" && input.targetId) {
    return listDepartmentLineage([input.targetId], { includeSelf: false });
  }
  if (input.targetType === "personal" && input.targetId) {
    const ownDepartmentIds = await listUserManagementDepartmentIds(input.targetId);
    return listDepartmentLineage(ownDepartmentIds, { includeSelf: true });
  }
  return [];
}

export async function listWorkSourceDepartmentIdsForScope(input: {
  targetType?: string | null;
  targetId?: number | null;
}) {
  return (await listWorkSourceDepartmentsForScope(input)).map((department) => department.id);
}

async function listAllowedWorkSourceDepartments(userId: number): Promise<WorkSourceDepartment[]> {
  const ownDepartmentIds = await listUserManagementDepartmentIds(userId);
  if (ownDepartmentIds.length === 0) return [];
  return listDepartmentLineage(ownDepartmentIds, { includeSelf: true });
}

async function listDepartmentLineage(
  startDepartmentIds: number[],
  options: { includeSelf: boolean },
): Promise<WorkSourceDepartment[]> {
  const byId = new Map<number, WorkSourceDepartment>();
  const visited = new Set<number>();
  const startIdSet = new Set(startDepartmentIds);
  let nextIds = startDepartmentIds;

  for (let depth = 0; depth < MAX_DEPARTMENT_DEPTH && nextIds.length > 0; depth += 1) {
    const order = new Map(nextIds.map((id, index) => [id, index]));
    const rows = await prisma.department.findMany({
      where: { id: { in: nextIds } },
      select: {
        id: true,
        code: true,
        name: true,
        parentId: true,
        hierarchyKind: true,
        isArchived: true,
      },
    });
    const parents: number[] = [];

    for (const row of rows.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0))) {
      visited.add(row.id);
      const isStartDepartment = startIdSet.has(row.id);
      if ((options.includeSelf || !isStartDepartment) && !row.isArchived && SOURCE_DEPARTMENT_HIERARCHY_KINDS.includes(row.hierarchyKind) && !byId.has(row.id)) {
        byId.set(row.id, {
          id: row.id,
          code: row.code,
          name: row.name,
          parentId: row.parentId,
        });
      }
      if (row.parentId && !visited.has(row.parentId) && !parents.includes(row.parentId)) parents.push(row.parentId);
    }

    nextIds = parents;
  }

  return Array.from(byId.values());
}

async function listUserManagementDepartmentIds(userId: number) {
  const rows = await prisma.eDP.findMany({
    where: currentOpenEndedDateWhere({
      departmentId: { not: null },
      department: { isArchived: false, hierarchyKind: { in: SOURCE_DEPARTMENT_HIERARCHY_KINDS } },
      employee: {
        userId,
        employments: { some: { isActive: true } },
      },
    }),
    select: { departmentId: true },
  });
  return Array.from(new Set(rows.map((row) => row.departmentId).filter((id): id is number => id !== null)));
}
