import { prisma } from "@/lib/prisma";
import { isPharma } from "@/lib/company";
import { getGrants } from "@/server/rbac/grants";
import { getResourceAncestors } from "@/server/rbac/resource";
import type { SubjectType } from "@/server/rbac/grants";

export interface SubjectInfo {
  id: number;
  name: string;
  extra?: Record<string, unknown>;
}

export interface PermissionGrantData {
  subjects: SubjectInfo[];
  directGrants: Awaited<ReturnType<typeof getGrants>>;
  positionGrants: Awaited<ReturnType<typeof getGrants>>;
  departmentGrants: Awaited<ReturnType<typeof getGrants>>;
  ancestorResourceKeys: string[];
}

export async function getPermissionGrantData(
  subjectType: SubjectType,
  resourceKey: string | undefined,
  scopeId?: string | null,
): Promise<PermissionGrantData> {
  let subjects: SubjectInfo[] = [];
  if (subjectType === "user") {
    subjects = await getUserSubjects();
  } else if (subjectType === "position") {
    subjects = await getPositionSubjects();
  } else if (subjectType === "department") {
    subjects = await getDepartmentSubjects();
  }

  const directGrants = await getGrants(subjectType, undefined, scopeId);

  let positionGrants: Awaited<ReturnType<typeof getGrants>> = [];
  let departmentGrants: Awaited<ReturnType<typeof getGrants>> = [];

  if (subjectType === "user") {
    positionGrants = await getGrants("position", undefined, scopeId);
    departmentGrants = await getGrants("department", undefined, scopeId);
  }

  let ancestorResourceIds: number[] = [];
  if (resourceKey) {
    const resource = await prisma.resource.findUnique({
      where: { key: resourceKey },
      select: { id: true },
    });
    if (resource) {
      ancestorResourceIds = await getResourceAncestors(resource.id);
    }
  }

  const ancestorResourceKeys = resourceKey
    ? (
        await prisma.resource.findMany({
          where: { id: { in: ancestorResourceIds } },
          select: { key: true },
        })
      ).map((r) => r.key)
    : [];

  return {
    subjects,
    directGrants,
    positionGrants,
    departmentGrants,
    ancestorResourceKeys,
  };
}

async function buildDeptPathMaps() {
  const allDepts = await prisma.department.findMany({
    select: { id: true, name: true, parentId: true },
  });
  const parentMap = new Map<number, number | null>(
    allDepts.map((d) => [d.id, d.parentId])
  );
  const nameMap = new Map<number, string>(
    allDepts.map((d) => [d.id, d.name])
  );

  function getDeptPath(deptId: number | null): string[] {
    const path: string[] = [];
    const seen = new Set<number>();
    let current = deptId;
    while (current && !seen.has(current)) {
      seen.add(current);
      const name = nameMap.get(current);
      if (name) path.unshift(name);
      current = parentMap.get(current) ?? null;
    }
    return path;
  }

  return { getDeptPath };
}

function resolveCompany(code: string | null | undefined): string {
  return isPharma(code || "") ? "丰华制药" : "丰华生物";
}

export async function getUserSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();

  const activeEmpIds = new Set(
    (
      await prisma.employment.findMany({
        where: { isActive: true },
        select: { employeeId: true },
      })
    ).map((e) => e.employeeId)
  );

  const employees = await prisma.employee.findMany({
    where: { id: { in: [...activeEmpIds] } },
    orderBy: [{ employeeId: "asc" }],
    include: {
      positions: {
        include: {
          department: { select: { name: true, code: true, id: true } },
          position: { select: { name: true } },
        },
      },
    },
  });

  const employeeUsers = await prisma.employee.findMany({
    where: { userId: { not: null } },
    select: { employeeId: true, userId: true },
  });
  const userIdByEmployeeId = new Map(
    employeeUsers.map((e) => [e.employeeId, e.userId!])
  );

  const result: SubjectInfo[] = [];
  for (const emp of employees) {
    const userId = userIdByEmployeeId.get(emp.employeeId);
    const dept = emp.positions[0]?.department;

    result.push({
      id: userId ?? 0,
      name: emp.name,
      extra: {
        employeeId: emp.employeeId,
        userId,
        hasUser: !!userId,
        company: resolveCompany(dept?.code),
        department: dept?.name || "",
        deptPath: getDeptPath(dept?.id ?? null),
        positionIds: emp.positions
          .map((p) => p.positionId)
          .filter((id): id is number => id !== null),
        departmentIds: [
          ...new Set(
            emp.positions
              .map((p) => p.departmentId)
              .filter((id): id is number => id !== null)
          ),
        ],
      },
    });
  }
  return result;
}

export async function getPositionSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();

  const positions = await prisma.position.findMany({
    include: {
      department: { select: { name: true, code: true, id: true } },
    },
    orderBy: { code: "asc" },
  });

  const result: SubjectInfo[] = [];
  for (const pos of positions) {
    const dept = pos.department;

    result.push({
      id: pos.id,
      name: pos.name,
      extra: {
        code: pos.code,
        company: resolveCompany(dept?.code),
        department: dept?.name || "",
        deptPath: getDeptPath(dept?.id ?? null),
      },
    });
  }
  return result;
}

export async function getDepartmentSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();

  const depts = await prisma.department.findMany({
    orderBy: { code: "asc" },
  });

  const result: SubjectInfo[] = [];
  for (const d of depts) {
    result.push({
      id: d.id,
      name: d.name,
      extra: {
        code: d.code,
        company: resolveCompany(d.code),
        deptPath: getDeptPath(d.id),
      },
    });
  }
  return result;
}
