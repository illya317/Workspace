import {
  getGrants,
  getResourceAncestorKeys,
  getResourceChildKeys,
  type SubjectType,
} from "@workspace/platform/server/auth";
import { getActionGrants } from "@workspace/platform/server/rbac/action-grants";
import { buildPermissionRecords, type PermissionRecord } from "@workspace/platform/server/rbac/action-records";
import { prisma } from "@workspace/platform/server/prisma";
import { isCapabilityResource } from "@workspace/platform/resources";
import { getDefaultResourceRole, isDefaultAccessResource } from "@workspace/platform/server/rbac/implicit";

import { loadCompanyMap, getCompanyNameSync } from "./company-directory";

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
  implicitGrants: Array<{
    subjectId: number;
    resourceKey: string;
    roleKey: string;
    scopeId: string | null;
  }>;
  directActionGrants: Awaited<ReturnType<typeof getActionGrants>>;
  positionActionGrants: Awaited<ReturnType<typeof getActionGrants>>;
  departmentActionGrants: Awaited<ReturnType<typeof getActionGrants>>;
  ancestorResourceKeys: string[];
  actionRecords: Record<number, PermissionRecord>;
}

function hasAdminGrant(grants: Awaited<ReturnType<typeof getGrants>>, subjectIds: number[]) {
  const ids = new Set(subjectIds);
  return grants.some((grant) => ids.has(grant.subjectId) && grant.roleKey === "admin");
}

function includedDefaultRoleKeys(roleKey: string) {
  if (roleKey === "delete") return ["access", "write", "delete"];
  if (roleKey === "write") return ["access", "write"];
  return ["access"];
}

function buildImplicitGrants({
  subjects,
  subjectType,
  resourceKey,
  directGrants,
  positionGrants,
  departmentGrants,
}: {
  subjects: SubjectInfo[];
  subjectType: SubjectType;
  resourceKey: string | undefined;
  directGrants: Awaited<ReturnType<typeof getGrants>>;
  positionGrants: Awaited<ReturnType<typeof getGrants>>;
  departmentGrants: Awaited<ReturnType<typeof getGrants>>;
}): PermissionGrantData["implicitGrants"] {
  if (!resourceKey) return [];
  if (isDefaultAccessResource(resourceKey) && !isCapabilityResource(resourceKey)) {
    if (subjectType !== "user") return [];
    const roleKeys = includedDefaultRoleKeys(getDefaultResourceRole(resourceKey) ?? "access");
    return subjects
      .filter((subject) => subject.id > 0 && subject.extra?.hasUser)
      .flatMap((subject) => roleKeys.map((roleKey) => ({ subjectId: subject.id, resourceKey, roleKey, scopeId: null })));
  }
  if (resourceKey !== "settings.admin") return [];

  return subjects.flatMap((subject) => {
    const directAdmin = hasAdminGrant(directGrants, [subject.id]);
    const positionIds = (subject.extra?.positionIds as number[] | undefined) ?? [];
    const departmentIds = (subject.extra?.departmentIds as number[] | undefined) ?? [];
    const positionAdmin = subjectType === "user"
      ? hasAdminGrant(positionGrants, positionIds)
      : false;
    const departmentAdmin = subjectType === "user"
      ? hasAdminGrant(departmentGrants, departmentIds)
      : false;
    if (!directAdmin && !positionAdmin && !departmentAdmin) return [];
    return [{ subjectId: subject.id, resourceKey, roleKey: "access", scopeId: null }];
  });
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
  const directActionGrants = await getActionGrants(subjectType, undefined, scopeId);

  let positionGrants: Awaited<ReturnType<typeof getGrants>> = [];
  let departmentGrants: Awaited<ReturnType<typeof getGrants>> = [];
  let positionActionGrants: Awaited<ReturnType<typeof getActionGrants>> = [];
  let departmentActionGrants: Awaited<ReturnType<typeof getActionGrants>> = [];

  if (subjectType === "user") {
    positionGrants = await getGrants("position", undefined, scopeId);
    departmentGrants = await getGrants("department", undefined, scopeId);
    positionActionGrants = await getActionGrants("position", undefined, scopeId);
    departmentActionGrants = await getActionGrants("department", undefined, scopeId);
  }

  const ancestorResourceKeys = resourceKey ? await getResourceAncestorKeys(resourceKey) : [];
  const childResourceKeys = resourceKey ? await getResourceChildKeys(resourceKey) : [];
  const implicitGrants = buildImplicitGrants({
    subjects,
    subjectType,
    resourceKey,
    directGrants,
    positionGrants,
    departmentGrants,
  });

  return {
    subjects,
    directGrants,
    positionGrants,
    departmentGrants,
    directActionGrants,
    positionActionGrants,
    departmentActionGrants,
    implicitGrants,
    ancestorResourceKeys,
    actionRecords: buildPermissionRecords({
      subjects,
      subjectType,
      selectedResource: resourceKey ?? null,
      ancestorResourceKeys,
      directGrants,
      positionGrants,
      departmentGrants,
      implicitGrants,
      directActionGrants,
      positionActionGrants,
      departmentActionGrants,
      childResourceKeys,
    }),
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

function resolveCompany(map: Map<string, unknown>, code: string | null | undefined): string {
  return getCompanyNameSync(map, code || "");
}

export async function getUserSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();
  const companyMap = await loadCompanyMap();

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
        company: resolveCompany(companyMap, dept?.code),
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
  const companyMap = await loadCompanyMap();

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
        company: resolveCompany(companyMap, dept?.code),
        department: dept?.name || "",
        deptPath: getDeptPath(dept?.id ?? null),
      },
    });
  }
  return result;
}

export async function getDepartmentSubjects(): Promise<SubjectInfo[]> {
  const { getDeptPath } = await buildDeptPathMaps();
  const companyMap = await loadCompanyMap();

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
        company: resolveCompany(companyMap, d.code),
        deptPath: getDeptPath(d.id),
      },
    });
  }
  return result;
}
