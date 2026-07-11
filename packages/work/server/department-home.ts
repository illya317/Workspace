import { serviceError, serviceOk, type ServiceResult } from "@workspace/platform/server/api";
import {
  getOperatingCommitteeDepartmentContext,
} from "@workspace/platform/server/business-space-permissions";
import { currentOpenEndedDateWhere } from "@workspace/platform/server/fk-registry";
import { prisma } from "@workspace/platform/server/prisma";
import { listStandardOrganizationSpaceSeeds } from "./standard-space-seeds";
import { filterReadableWorkDepartmentSpaces } from "./department-space-access";

export type WorkDepartmentHomeDepartment = {
  id: number;
  code: string;
  name: string;
  hierarchyKind: "G" | "M";
  level: number;
  levelLabel: string;
  parentId: number | null;
  parentName: string | null;
  managerPositionName: string | null;
  managerName: string | null;
  isArchived: boolean;
  childCount: number;
  directEmployeeCount: number;
  totalEmployeeCount: number;
  directPositionCount: number;
  totalPositionCount: number;
  activePlanCount: number;
  activeItemCount: number;
};

export type WorkDepartmentHomeEmployee = {
  id: number;
  employeeId: string;
  name: string;
  departmentId: number;
  departmentName: string;
  departmentCode: string;
  positionNames: string[];
  isPrimary: boolean;
  workPercent: string | null;
  personnelType: string | null;
  rank: string | null;
  title: string | null;
  joinDate: string | null;
};

export type WorkDepartmentHomeData = {
  selectedDepartmentId: number | null;
  departments: WorkDepartmentHomeDepartment[];
  employees: WorkDepartmentHomeEmployee[];
};

const managerEmployeeSelect = {
  id: true,
  name: true,
  userId: true,
} as const;

export async function resolveUserDefaultWorkDepartmentHome(userId: number): Promise<ServiceResult<{ departmentId: number }>> {
  const spaces = await listReadableDepartmentHomeSpaces(userId);
  const first = spaces.find((space) => space.lifecycleStatus === "active") ?? spaces[0] ?? null;
  return first ? serviceOk({ departmentId: first.targetId }) : serviceError("当前账号没有可进入的部门空间", 403);
}

export async function canEnterDefaultWorkDepartmentHome(userId: number) {
  return (await resolveUserDefaultWorkDepartmentHome(userId)).ok;
}

export function emptyWorkDepartmentHomeData(): WorkDepartmentHomeData {
  return { selectedDepartmentId: null, departments: [], employees: [] };
}

export async function getDepartmentHomeOverview(input: {
  userId: number;
}): Promise<ServiceResult<WorkDepartmentHomeData>> {
  const readableSpaces = await listReadableDepartmentHomeSpaces(input.userId);
  if (readableSpaces.length === 0) return serviceError("当前账号没有可进入的部门空间", 403);
  return serviceOk(await buildDepartmentHomeData({
    readableDepartmentIds: readableSpaces.map((space) => space.targetId),
    selectedDepartmentId: null,
  }));
}

export async function getDepartmentHomeEntry(input: {
  userId: number;
  departmentId: number;
}): Promise<ServiceResult<WorkDepartmentHomeData>> {
  if (!Number.isInteger(input.departmentId) || input.departmentId <= 0) {
    return serviceError("部门 ID 无效", 400);
  }

  const readableSpaces = await listReadableDepartmentHomeSpaces(input.userId);
  const readableDepartmentIds = readableSpaces.map((space) => space.targetId);
  if (!readableDepartmentIds.includes(input.departmentId)) return serviceError("无权限查看该部门空间", 403);

  const [selectedDepartment, operatingCommittee] = await Promise.all([
    prisma.department.findUnique({
      where: { id: input.departmentId },
      select: { id: true, hierarchyKind: true },
    }),
    getOperatingCommitteeDepartmentContext(),
  ]);
  if (!selectedDepartment) return serviceError("部门不存在", 404);
  if (selectedDepartment.hierarchyKind !== "M" && selectedDepartment.id !== operatingCommittee?.id) {
    return serviceError("该组织不是工作部门空间", 403);
  }

  return serviceOk(await buildDepartmentHomeData({
    readableDepartmentIds,
    selectedDepartmentId: input.departmentId,
  }));
}

async function buildDepartmentHomeData({
  readableDepartmentIds,
  selectedDepartmentId,
}: {
  readableDepartmentIds: number[];
  selectedDepartmentId: number | null;
}): Promise<WorkDepartmentHomeData> {
  const departmentRows = await prisma.department.findMany({
    where: {
      id: { in: readableDepartmentIds },
    },
    include: {
      parent: { select: { id: true, name: true } },
      children: { select: { id: true } },
      managerPosition: {
        select: {
          id: true,
          name: true,
          edps: {
            where: currentOpenEndedDateWhere({
              employee: { employments: { some: { isActive: true } } },
            }),
            select: {
              employee: { select: managerEmployeeSelect },
            },
            orderBy: [{ isPrimary: "desc" }, { id: "asc" }],
          },
        },
      },
      managerEmployees: {
        select: {
          employee: { select: managerEmployeeSelect },
        },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ hierarchyKind: "asc" }, { level: "asc" }, { code: "asc" }, { id: "asc" }],
  });

  const childMap = childrenByDepartment(departmentRows);
  const selectedDepartmentIds = selectedDepartmentId
    ? [selectedDepartmentId, ...descendantIds(selectedDepartmentId, childMap)]
    : readableDepartmentIds;
  const [edps, positionCounts, planCounts, itemCounts] = await Promise.all([
    prisma.eDP.findMany({
      where: currentOpenEndedDateWhere({
        departmentId: { in: selectedDepartmentIds },
        employee: { employments: { some: { isActive: true } } },
      }),
      select: {
        departmentId: true,
        isPrimary: true,
        workPercent: true,
        employee: {
          select: {
            id: true,
            employeeId: true,
            name: true,
            title: true,
            employments: {
              where: { isActive: true },
              select: { personnelType: true, rank: true, title: true, joinDate: true },
              orderBy: { id: "desc" },
              take: 1,
            },
          },
        },
        department: { select: { id: true, code: true, name: true } },
        position: { select: { id: true, name: true } },
      },
      orderBy: [{ departmentId: "asc" }, { isPrimary: "desc" }, { id: "asc" }],
    }),
    prisma.position.groupBy({
      by: ["departmentId"],
      where: { departmentId: { in: readableDepartmentIds }, isArchived: false },
      _count: { _all: true },
    }),
    prisma.workPlan.groupBy({
      by: ["targetId"],
      where: { targetType: "department", targetId: { in: readableDepartmentIds }, isArchived: false },
      _count: { _all: true },
    }),
    prisma.workItem.groupBy({
      by: ["targetId"],
      where: { targetType: "department", targetId: { in: readableDepartmentIds }, isArchived: false },
      _count: { _all: true },
    }),
  ]);

  const directEmployeeCount = countEmployeesByDepartment(edps);
  const employeeRows = departmentEmployeeRows(edps);
  const positionCountMap = countMap(positionCounts);
  const planCountMap = countMap(planCounts);
  const itemCountMap = countMap(itemCounts);
  const departments = departmentRows.map((department) => {
    const descendants = descendantIds(department.id, childMap);
    return {
      id: department.id,
      code: department.code,
      name: department.name,
      hierarchyKind: department.hierarchyKind === "G" ? "G" as const : "M" as const,
      level: department.level,
      levelLabel: organizationLevelLabel(department.hierarchyKind, department.level),
      parentId: department.parentId,
      parentName: department.parent?.name ?? null,
      managerPositionName: department.managerPosition?.name ?? null,
      managerName: managerNames(department).join("、") || null,
      isArchived: department.isArchived,
      childCount: department.children.length,
      directEmployeeCount: directEmployeeCount.get(department.id) ?? 0,
      totalEmployeeCount: sumByIds([department.id, ...descendants], directEmployeeCount),
      directPositionCount: positionCountMap.get(department.id) ?? 0,
      totalPositionCount: sumByIds([department.id, ...descendants], positionCountMap),
      activePlanCount: planCountMap.get(department.id) ?? 0,
      activeItemCount: itemCountMap.get(department.id) ?? 0,
    };
  });

  return {
    selectedDepartmentId,
    departments,
    employees: employeeRows,
  };
}

async function listReadableDepartmentHomeSpaces(userId: number) {
  const spaces = await listStandardOrganizationSpaceSeeds();
  return filterReadableWorkDepartmentSpaces(userId, spaces);
}

function managerNames(department: {
  managerEmployees: Array<{ employee: { id: number; name: string } }>;
  managerPosition: { edps: Array<{ employee: { id: number; name: string } }> } | null;
}) {
  const selected = department.managerEmployees.map((row) => row.employee);
  const employees = selected.length > 0 ? selected : department.managerPosition?.edps.map((row) => row.employee) ?? [];
  return Array.from(new Map(employees.map((employee) => [employee.id, employee.name || "未命名员工"])).values());
}

function organizationLevelLabel(kind: string | null, level: number) {
  const prefix = kind === "G" ? "治理层级" : "管理层级";
  return `${prefix} ${kind === "G" ? "G" : "M"}${level}`;
}

function childrenByDepartment(departments: Array<{ id: number; parentId: number | null }>) {
  const map = new Map<number, number[]>();
  for (const department of departments) {
    if (!department.parentId) continue;
    map.set(department.parentId, [...(map.get(department.parentId) ?? []), department.id]);
  }
  return map;
}

function descendantIds(departmentId: number, childMap: ReadonlyMap<number, number[]>) {
  const result: number[] = [];
  const stack = [...(childMap.get(departmentId) ?? [])];
  while (stack.length) {
    const id = stack.shift()!;
    result.push(id);
    stack.push(...(childMap.get(id) ?? []));
  }
  return result;
}

function countEmployeesByDepartment(edps: Array<{ departmentId: number | null; employee: { id: number } }>) {
  const departmentEmployees = new Map<number, Set<number>>();
  for (const edp of edps) {
    if (!edp.departmentId) continue;
    const employees = departmentEmployees.get(edp.departmentId) ?? new Set<number>();
    employees.add(edp.employee.id);
    departmentEmployees.set(edp.departmentId, employees);
  }
  return new Map(Array.from(departmentEmployees, ([departmentId, employees]) => [departmentId, employees.size]));
}

function departmentEmployeeRows(edps: Array<{
  departmentId: number | null;
  isPrimary: boolean;
  workPercent: string | null;
  employee: {
    id: number;
    employeeId: string;
    name: string;
    title: string | null;
    employments: Array<{ personnelType: string | null; rank: string | null; title: string | null; joinDate: string | null }>;
  };
  department: { id: number; code: string; name: string } | null;
  position: { id: number; name: string } | null;
}>) {
  const rows = new Map<string, WorkDepartmentHomeEmployee>();
  for (const edp of edps) {
    if (!edp.departmentId || !edp.department) continue;
    const key = `${edp.departmentId}:${edp.employee.id}`;
    const employment = edp.employee.employments[0];
    const current = rows.get(key) ?? {
      id: edp.employee.id,
      employeeId: edp.employee.employeeId,
      name: edp.employee.name,
      departmentId: edp.department.id,
      departmentName: edp.department.name,
      departmentCode: edp.department.code,
      positionNames: [],
      isPrimary: false,
      workPercent: null,
      personnelType: employment?.personnelType ?? null,
      rank: employment?.rank ?? null,
      title: employment?.title ?? edp.employee.title ?? null,
      joinDate: employment?.joinDate ?? null,
    };
    if (edp.position?.name && !current.positionNames.includes(edp.position.name)) {
      current.positionNames.push(edp.position.name);
    }
    current.isPrimary = current.isPrimary || edp.isPrimary;
    current.workPercent = current.workPercent ?? edp.workPercent;
    rows.set(key, current);
  }
  return Array.from(rows.values()).sort((a, b) => a.departmentCode.localeCompare(b.departmentCode) || a.employeeId.localeCompare(b.employeeId));
}

function countMap(rows: Array<{ targetId?: number | null; departmentId?: number | null; _count: { _all: number } }>) {
  return new Map(rows.map((row) => [row.targetId ?? row.departmentId ?? 0, row._count._all]));
}

function sumByIds(ids: number[], map: ReadonlyMap<number, number>) {
  return ids.reduce((sum, id) => sum + (map.get(id) ?? 0), 0);
}
