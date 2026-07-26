import {
  type SubjectType,
} from "./auth";
import { getActionGrants } from "./rbac/action-grants";
import { buildPermissionRecords, type PermissionRecord } from "./rbac/action-records";
import { buildSpaceEntryImplicitAccessGrants } from "./rbac/space-entry";
import {
  getProjectedAncestorResourceKeys,
  getProjectedChildResourceKeys,
  type PermissionResourceProjectionKind,
} from "./rbac/resource-projection";
import type { PermissionActionKey, PermissionActionSource } from "../permission-actions";
import { prisma } from "./prisma";
import { isCapabilityResource } from "../resources";
import {
  getDefaultResourceAction,
  getImplicitAllAdminEmployeeIds,
  isDefaultAccessResource,
} from "./rbac/implicit";
import { getGrantablePermissionActions } from "../permission-action-grantability";
import { getImplicitGrantManagerPositionIds } from "./rbac/implicit-admins";
import {
  getImplicitAllResourceAdminActionKeys,
  getImplicitAllResourceGrantActionKeys,
} from "../permission-implicit-actions";
import {
  getNaturalSpaceActionProfileActionKeys,
  type NaturalSpaceActionProfile,
} from "../permission-natural-space-actions";

import { loadCompanyMap, getCompanyNameSync } from "./company-directory";

export interface SubjectInfo {
  id: number;
  name: string;
  extra?: Record<string, unknown>;
}

export interface PermissionGrantData {
  subjects: SubjectInfo[];
  directActionGrants: Awaited<ReturnType<typeof getActionGrants>>;
  positionActionGrants: Awaited<ReturnType<typeof getActionGrants>>;
  departmentActionGrants: Awaited<ReturnType<typeof getActionGrants>>;
  implicitActionGrants: Array<Awaited<ReturnType<typeof getActionGrants>>[number] & { source?: PermissionActionSource }>;
  ancestorResourceKeys: string[];
  childResourceKeys: string[];
  resourceActions: PermissionActionKey[];
  canMutateGrantAction: boolean;
  actionRecords: Record<number, PermissionRecord>;
}

type NaturalSpaceActionGrant = {
  userId: number;
  actionProfile: NaturalSpaceActionProfile;
  actionSource?: PermissionActionSource;
};
type PermissionGrantDataOptions = {
  includeStoredGrants?: boolean;
  includeImplicitGrants?: boolean;
  childResourceKeys?: string[];
  projection?: PermissionResourceProjectionKind;
  canMutateGrantAction?: boolean;
};

export function mergeBusinessSpaceActionsIntoPermissionGrantData(
  data: PermissionGrantData,
  {
    resourceKey,
    grantResourceKey,
    selectedResourceKey,
    scopeId,
    naturalActions,
  }: {
    resourceKey?: string;
    grantResourceKey?: string;
    selectedResourceKey?: string;
    scopeId: string | null;
    naturalActions: NaturalSpaceActionGrant[];
  },
): PermissionGrantData {
  const effectiveGrantResourceKey = grantResourceKey ?? resourceKey;
  const effectiveSelectedResourceKey = selectedResourceKey ?? effectiveGrantResourceKey;
  if (!effectiveGrantResourceKey || !effectiveSelectedResourceKey) return data;
  const subjectIdByUserId = new Map<number, number>();
  for (const subject of data.subjects) {
    const userId = Number(subject.extra?.userId ?? subject.id);
    if (Number.isInteger(userId) && userId > 0) subjectIdByUserId.set(userId, subject.id);
  }

  const actionGrants = naturalActions.flatMap((row) => {
    const subjectId = subjectIdByUserId.get(row.userId);
    if (!subjectId) return [];
    return getNaturalSpaceActionProfileActionKeys(effectiveGrantResourceKey, row.actionProfile).map((actionKey) => ({
      subjectId,
      resourceKey: effectiveGrantResourceKey,
      actionKey,
      resourceId: 0,
      scopeId,
      source: row.actionSource ?? "system",
    }));
  });
  if (actionGrants.length === 0) return data;

  const implicitActionGrants = [...data.implicitActionGrants, ...actionGrants];
  return {
    ...data,
    implicitActionGrants,
    actionRecords: buildPermissionRecords({
      subjects: data.subjects,
      subjectType: "user",
      selectedResource: effectiveSelectedResourceKey,
      ancestorResourceKeys: data.ancestorResourceKeys,
      directActionGrants: data.directActionGrants,
      positionActionGrants: data.positionActionGrants,
      departmentActionGrants: data.departmentActionGrants,
      implicitActionGrants,
      childResourceKeys: data.childResourceKeys,
      selectedScopeId: scopeId,
      canMutateGrantAction: data.canMutateGrantAction,
    }),
  };
}

function hasGrantManagementGrant(grants: Awaited<ReturnType<typeof getActionGrants>>, subjectIds: number[]) {
  const ids = new Set(subjectIds);
  return grants.some((grant) => ids.has(grant.subjectId) && grant.actionKey === "grant");
}

function includedDefaultActionKeys(actionKey: string): PermissionActionKey[] {
  if (actionKey === "delete") return ["entry", "read", "create", "update", "delete"];
  if (actionKey === "update") return ["entry", "read", "create", "update"];
  return ["entry", "read"];
}

async function buildImplicitGrants({
  subjects,
  subjectType,
  resourceKey,
  directGrants,
  positionGrants,
  departmentGrants,
  scopeId,
}: {
  subjects: SubjectInfo[];
  subjectType: SubjectType;
  resourceKey: string | undefined;
  directGrants: Awaited<ReturnType<typeof getActionGrants>>;
  positionGrants: Awaited<ReturnType<typeof getActionGrants>>;
  departmentGrants: Awaited<ReturnType<typeof getActionGrants>>;
  scopeId?: string | null;
}): Promise<PermissionGrantData["implicitActionGrants"]> {
  if (!resourceKey) return [];
  const implicitScopeId = scopeId ?? null;
  const implicitAdminGrants: PermissionGrantData["implicitActionGrants"] = [];
  if (subjectType === "user") {
    for (const subject of subjects) {
      if (subject.id <= 0 || !subject.extra?.hasUser) continue;
      if (subject.extra?.isAllResourceAdmin) {
        implicitAdminGrants.push(...getImplicitAllResourceAdminActionKeys(resourceKey).map((actionKey) => ({
          subjectId: subject.id,
          resourceKey,
          actionKey,
          resourceId: 0,
          scopeId: implicitScopeId,
          source: "system" as const,
        })));
      }
      if (subject.extra?.isAllResourceGrant) {
        implicitAdminGrants.push(...getImplicitAllResourceGrantActionKeys(resourceKey).map((actionKey) => ({
          subjectId: subject.id,
          resourceKey,
          actionKey,
          resourceId: 0,
          scopeId: implicitScopeId,
          source: "system" as const,
        })));
      }
    }
  }
  if (isDefaultAccessResource(resourceKey) && !isCapabilityResource(resourceKey)) {
    if (subjectType !== "user") return [
      ...implicitAdminGrants,
      ...await buildSpaceEntryImplicitAccessGrants({ subjects, subjectType, resourceKey }),
    ];
    const actionKeys = includedDefaultActionKeys(getDefaultResourceAction(resourceKey) ?? "read");
    return [
      ...implicitAdminGrants,
      ...subjects
        .filter((subject) => subject.id > 0 && subject.extra?.hasUser)
        .flatMap((subject) => actionKeys.map((actionKey) => ({ subjectId: subject.id, resourceKey, actionKey: actionKey as PermissionActionKey, resourceId: 0, scopeId: null, source: "system" as const }))),
      ...await buildSpaceEntryImplicitAccessGrants({ subjects, subjectType, resourceKey }),
    ];
  }
  if (resourceKey !== "settings.admin") {
    return [
      ...implicitAdminGrants,
      ...await buildSpaceEntryImplicitAccessGrants({ subjects, subjectType, resourceKey }),
    ];
  }

  return [
    ...implicitAdminGrants,
    ...subjects.flatMap((subject) => {
      const directAdmin = hasGrantManagementGrant(directGrants, [subject.id]);
      const positionIds = (subject.extra?.positionIds as number[] | undefined) ?? [];
      const departmentIds = (subject.extra?.departmentIds as number[] | undefined) ?? [];
      const positionAdmin = subjectType === "user"
        ? hasGrantManagementGrant(positionGrants, positionIds)
        : false;
      const departmentAdmin = subjectType === "user"
        ? hasGrantManagementGrant(departmentGrants, departmentIds)
        : false;
      if (!directAdmin && !positionAdmin && !departmentAdmin) return [];
      return [{ subjectId: subject.id, resourceKey, actionKey: "entry" as const, resourceId: 0, scopeId: implicitScopeId, source: "system" as const }];
    }),
    ...await buildSpaceEntryImplicitAccessGrants({ subjects, subjectType, resourceKey }),
  ];
}

export async function getPermissionGrantData(
  subjectType: SubjectType,
  resourceKey: string | undefined,
  scopeId?: string | null,
  options: PermissionGrantDataOptions = {},
): Promise<PermissionGrantData> {
  const includeStoredGrants = options.includeStoredGrants ?? true;
  const includeImplicitGrants = options.includeImplicitGrants ?? true;
  let subjects: SubjectInfo[] = [];
  if (subjectType === "user") {
    subjects = await getUserSubjects();
  } else if (subjectType === "position") {
    subjects = await getPositionSubjects();
  } else if (subjectType === "department") {
    subjects = await getDepartmentSubjects();
  }

  const directActionGrants = includeStoredGrants ? await getActionGrants(subjectType, undefined, scopeId) : [];

  let positionActionGrants: Awaited<ReturnType<typeof getActionGrants>> = [];
  let departmentActionGrants: Awaited<ReturnType<typeof getActionGrants>> = [];

  if (subjectType === "user" && includeStoredGrants) {
    positionActionGrants = await getActionGrants("position", undefined, scopeId);
    departmentActionGrants = await getActionGrants("department", undefined, scopeId);
  }

  const projection = options.projection ?? "default";
  const ancestorResourceKeys = resourceKey ? await getProjectedAncestorResourceKeys(resourceKey, projection) : [];
  const childResourceKeys = options.childResourceKeys ?? (resourceKey ? await getProjectedChildResourceKeys(resourceKey, projection) : []);
  const resourceActions = resourceKey ? getGrantablePermissionActions(resourceKey) : [];
  const implicitGrants = includeImplicitGrants
    ? await buildImplicitGrants({
        subjects,
        subjectType,
        resourceKey,
        directGrants: directActionGrants,
        positionGrants: positionActionGrants,
        departmentGrants: departmentActionGrants,
        scopeId,
      })
    : [];

  return {
    subjects,
    directActionGrants,
    positionActionGrants,
    departmentActionGrants,
    implicitActionGrants: implicitGrants,
    ancestorResourceKeys,
    childResourceKeys,
    resourceActions,
    canMutateGrantAction: Boolean(options.canMutateGrantAction),
    actionRecords: buildPermissionRecords({
      subjects,
      subjectType,
      selectedResource: resourceKey ?? null,
      ancestorResourceKeys,
      directActionGrants,
      positionActionGrants,
      departmentActionGrants,
      implicitActionGrants: implicitGrants,
      childResourceKeys,
      selectedScopeId: scopeId,
      canMutateGrantAction: Boolean(options.canMutateGrantAction),
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
          position: { select: { name: true, alias: true } },
        },
      },
    },
  });

  const managerPositionIds = new Set(
    (
      await prisma.department.findMany({
        where: { isArchived: false, managerPositionId: { not: null } },
        select: { managerPositionId: true },
      })
    )
      .map((department) => department.managerPositionId)
      .filter((id): id is number => id !== null)
  );
  const implicitGrantPositionIds = new Set(await getImplicitGrantManagerPositionIds());
  const implicitAllAdminEmployeeIds = getImplicitAllAdminEmployeeIds();

  const employeeUsers = await prisma.employee.findMany({
    where: { userId: { not: null } },
    select: {
      employeeId: true,
      userId: true,
      user: { select: { username: true, canLogin: true } },
    },
  });
  const userIdByEmployeeId = new Map(
    employeeUsers.map((e) => [e.employeeId, e.userId!])
  );
  const userMetaByEmployeeId = new Map(
    employeeUsers.map((e) => [e.employeeId, e.user])
  );

  const result: SubjectInfo[] = [];
  for (const emp of employees) {
    const userId = userIdByEmployeeId.get(emp.employeeId);
    const userMeta = userMetaByEmployeeId.get(emp.employeeId);
    const dept = emp.positions[0]?.department;
    const positionIds = emp.positions
      .map((p) => p.positionId)
      .filter((id): id is number => id !== null);
    const isAllResourceAdmin = implicitAllAdminEmployeeIds.includes(emp.employeeId);
    const isAllResourceGrant = positionIds.some((positionId) => implicitGrantPositionIds.has(positionId));
    const isDepartmentManager = positionIds.some((positionId) => managerPositionIds.has(positionId));

    result.push({
      id: userId ?? 0,
      name: emp.name,
      extra: {
        employeeId: emp.employeeId,
        userId,
        hasUser: !!userId,
        username: userMeta?.username ?? null,
        canLogin: userMeta?.canLogin ?? false,
        company: resolveCompany(companyMap, dept?.code),
        department: dept?.name || "",
        position: emp.positions[0]?.position?.name || "",
        isAllResourceAdmin,
        isAllResourceGrant,
        isDepartmentManager,
        deptPath: getDeptPath(dept?.id ?? null),
        positionIds,
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
