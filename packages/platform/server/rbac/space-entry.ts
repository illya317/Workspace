import "server-only";

import { actionImplies, isPermissionActionKey } from "@workspace/platform/permission-actions";
import {
  getSpaceChildResourceKeyForTargetType,
} from "@workspace/platform/permission-resource-policy";
import {
  getRegisteredSpaceDefinitions,
  getSpacePermissionTargetTypes,
  getSpaceTargetTypes,
} from "@workspace/platform/space-registry";
import { getResourceAncestorKeys } from "./resource";
import { getUserDepartmentIds, getUserPositionIds } from "./helpers";
import { currentOpenEndedDateWhere } from "../relation-registry";
import { isActiveEmployeeUser } from "../business-space-natural-users";
import { getOperatingCommitteeDepartmentContext } from "../business-space-permissions";
import { prisma } from "../prisma";

type SubjectLike = {
  id: number;
  extra?: Record<string, unknown>;
};

export type SpaceEntryAccessGrant = {
  subjectId: number;
  resourceKey: string;
  actionKey: "entry";
  resourceId: 0;
  scopeId: null;
  source: "entry";
};

type SpaceEntryRegistration = {
  resourceKey: string;
  permissionResourceKeys: string[];
  targetTypes: string[];
};

let registrationCache: SpaceEntryRegistration[] | null = null;
let businessAncestorCache: Map<string, Set<string>> | null = null;

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function getSpaceEntryRegistrations() {
  if (!registrationCache) {
    registrationCache = getRegisteredSpaceDefinitions().map((registration) => ({
      resourceKey: registration.resourceKey,
      permissionResourceKeys: unique([
        registration.resourceKey,
        ...getSpacePermissionTargetTypes(registration).flatMap((targetType) => {
          const key = getSpaceChildResourceKeyForTargetType(targetType, registration.spaceResourceKind);
          return key ? [key] : [];
        }),
      ]),
      targetTypes: getSpaceTargetTypes(registration),
    }));
  }
  return registrationCache;
}

async function getBusinessAncestorResourceKeys(resourceKey: string) {
  if (!businessAncestorCache) businessAncestorCache = new Map();
  let keys = businessAncestorCache.get(resourceKey);
  if (!keys) {
    keys = new Set(await getResourceAncestorKeys(resourceKey));
    businessAncestorCache.set(resourceKey, keys);
  }
  return keys;
}

async function getRegistrationsForSelectedResource(resourceKey: string) {
  const result: SpaceEntryRegistration[] = [];
  for (const registration of getSpaceEntryRegistrations()) {
    const ancestors = await getBusinessAncestorResourceKeys(registration.resourceKey);
    if (ancestors.has(resourceKey)) result.push(registration);
  }
  return result;
}

function actionKeysIncludeAccess(actionKey: string | null | undefined) {
  const key = String(actionKey);
  return isPermissionActionKey(key) && actionImplies(key, "entry");
}

async function getScopedSpaceEntryResourceKeys(userId: number) {
  const registrations = getSpaceEntryRegistrations();
  const permissionResourceKeys = unique(registrations.flatMap((registration) => registration.permissionResourceKeys));
  if (permissionResourceKeys.length === 0) return new Set<string>();

  const [positionIds, departmentIds] = await Promise.all([
    getUserPositionIds(userId),
    getUserDepartmentIds(userId),
  ]);
  const [userRows, positionRows, departmentRows] = await Promise.all([
    prisma.userResourceActionGrant.findMany({
      where: { userId, scopeId: { not: null }, resource: { key: { in: permissionResourceKeys } } },
      select: { actionKey: true, resource: { select: { key: true } } },
    }),
    positionIds.length ? prisma.positionResourceActionGrant.findMany({
      where: { positionId: { in: positionIds }, scopeId: { not: null }, resource: { key: { in: permissionResourceKeys } } },
      select: { actionKey: true, resource: { select: { key: true } } },
    }) : Promise.resolve([]),
    departmentIds.length ? prisma.departmentResourceActionGrant.findMany({
      where: { departmentId: { in: departmentIds }, scopeId: { not: null }, resource: { key: { in: permissionResourceKeys } } },
      select: { actionKey: true, resource: { select: { key: true } } },
    }) : Promise.resolve([]),
  ]);

  const grantedPermissionKeys = new Set(
    [...userRows, ...positionRows, ...departmentRows]
      .filter((row) => actionKeysIncludeAccess(row.actionKey))
      .map((row) => row.resource.key),
  );
  return new Set(registrations.flatMap((registration) =>
    registration.permissionResourceKeys.some((key) => grantedPermissionKeys.has(key))
      ? [registration.resourceKey]
      : [],
  ));
}

async function hasAnyDepartmentNaturalSpace(userId: number) {
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ departmentId: { not: null } }) },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

async function hasCommitteeNaturalSpace(userId: number) {
  const committee = await getOperatingCommitteeDepartmentContext();
  if (!committee) return false;
  const employee = await prisma.employee.findFirst({
    where: {
      userId,
      employments: { some: { isActive: true } },
      positions: { some: currentOpenEndedDateWhere({ departmentId: committee.id }) },
    },
    select: { id: true },
  });
  return Boolean(employee);
}

async function getNaturalSpaceTargetTypes(userId: number) {
  const [activeEmployee, hasDepartment, hasCommittee] = await Promise.all([
    isActiveEmployeeUser(userId),
    hasAnyDepartmentNaturalSpace(userId),
    hasCommitteeNaturalSpace(userId),
  ]);
  return new Set([
    "personal",
    ...(activeEmployee ? ["company"] : []),
    ...(hasDepartment ? ["department"] : []),
    ...(hasCommittee ? ["committee"] : []),
  ]);
}

async function getNaturalSpaceEntryResourceKeys(userId: number) {
  const targetTypes = await getNaturalSpaceTargetTypes(userId);
  return new Set(getSpaceEntryRegistrations().flatMap((registration) =>
    registration.targetTypes.some((targetType) => targetTypes.has(targetType))
      ? [registration.resourceKey]
      : [],
  ));
}

export async function getSpaceEntryResourceKeysForUser(userId: number) {
  const [scoped, natural] = await Promise.all([
    getScopedSpaceEntryResourceKeys(userId),
    getNaturalSpaceEntryResourceKeys(userId),
  ]);
  return new Set([...scoped, ...natural]);
}

function subjectUserId(subject: SubjectLike) {
  const userId = Number(subject.extra?.userId ?? subject.id);
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function subjectPositionIds(subject: SubjectLike) {
  return ((subject.extra?.positionIds as number[] | undefined) ?? [])
    .filter((id) => Number.isInteger(id) && id > 0);
}

function subjectDepartmentIds(subject: SubjectLike) {
  return ((subject.extra?.departmentIds as number[] | undefined) ?? [])
    .filter((id) => Number.isInteger(id) && id > 0);
}

function subjectHasNaturalTarget(subject: SubjectLike, targetType: string, committeeDepartmentId: number | null) {
  if (!subject.extra?.hasUser) return false;
  if (targetType === "personal" || targetType === "company") return true;
  const departmentIds = subjectDepartmentIds(subject);
  if (targetType === "department") return departmentIds.length > 0;
  if (targetType === "committee") return Boolean(committeeDepartmentId && departmentIds.includes(committeeDepartmentId));
  return false;
}

export async function buildSpaceEntryImplicitAccessGrants(input: {
  subjects: SubjectLike[];
  subjectType: "user" | "position" | "department";
  resourceKey: string | undefined;
}): Promise<SpaceEntryAccessGrant[]> {
  if (!input.resourceKey) return [];
  const registrations = await getRegistrationsForSelectedResource(input.resourceKey);
  if (registrations.length === 0) return [];

  const permissionResourceKeys = unique(registrations.flatMap((registration) => registration.permissionResourceKeys));
  const [committee, userRows, positionRows, departmentRows] = await Promise.all([
    getOperatingCommitteeDepartmentContext(),
    input.subjectType === "user"
      ? prisma.userResourceActionGrant.findMany({
          where: { scopeId: { not: null }, resource: { key: { in: permissionResourceKeys } } },
          select: { userId: true, actionKey: true, resource: { select: { key: true } } },
        })
      : Promise.resolve([]),
    input.subjectType === "user" || input.subjectType === "position"
      ? prisma.positionResourceActionGrant.findMany({
          where: { scopeId: { not: null }, resource: { key: { in: permissionResourceKeys } } },
          select: { positionId: true, actionKey: true, resource: { select: { key: true } } },
        })
      : Promise.resolve([]),
    input.subjectType === "user" || input.subjectType === "department"
      ? prisma.departmentResourceActionGrant.findMany({
          where: { scopeId: { not: null }, resource: { key: { in: permissionResourceKeys } } },
          select: { departmentId: true, actionKey: true, resource: { select: { key: true } } },
        })
      : Promise.resolve([]),
  ]);

  const registrationByPermissionKey = new Map<string, SpaceEntryRegistration[]>();
  for (const registration of registrations) {
    for (const key of registration.permissionResourceKeys) {
      registrationByPermissionKey.set(key, [...(registrationByPermissionKey.get(key) ?? []), registration]);
    }
  }

  const directUserIdsByResource = new Map<string, Set<number>>();
  for (const row of userRows) {
    if (!actionKeysIncludeAccess(row.actionKey)) continue;
    for (const registration of registrationByPermissionKey.get(row.resource.key) ?? []) {
      directUserIdsByResource.set(registration.resourceKey, (directUserIdsByResource.get(registration.resourceKey) ?? new Set()).add(row.userId));
    }
  }

  const positionIdsByResource = new Map<string, Set<number>>();
  for (const row of positionRows) {
    if (!actionKeysIncludeAccess(row.actionKey)) continue;
    for (const registration of registrationByPermissionKey.get(row.resource.key) ?? []) {
      positionIdsByResource.set(registration.resourceKey, (positionIdsByResource.get(registration.resourceKey) ?? new Set()).add(row.positionId));
    }
  }

  const departmentIdsByResource = new Map<string, Set<number>>();
  for (const row of departmentRows) {
    if (!actionKeysIncludeAccess(row.actionKey)) continue;
    for (const registration of registrationByPermissionKey.get(row.resource.key) ?? []) {
      departmentIdsByResource.set(registration.resourceKey, (departmentIdsByResource.get(registration.resourceKey) ?? new Set()).add(row.departmentId));
    }
  }

  const grants: SpaceEntryAccessGrant[] = [];
  const seen = new Set<string>();
  for (const subject of input.subjects) {
    for (const registration of registrations) {
      const directUserId = subjectUserId(subject);
      const hasDirect = input.subjectType === "user" && directUserId
        ? directUserIdsByResource.get(registration.resourceKey)?.has(directUserId)
        : false;
      const hasPosition = input.subjectType === "position"
        ? positionIdsByResource.get(registration.resourceKey)?.has(subject.id)
        : input.subjectType === "user"
          ? subjectPositionIds(subject).some((id) => positionIdsByResource.get(registration.resourceKey)?.has(id))
          : false;
      const hasDepartment = input.subjectType === "department"
        ? departmentIdsByResource.get(registration.resourceKey)?.has(subject.id)
        : input.subjectType === "user"
          ? subjectDepartmentIds(subject).some((id) => departmentIdsByResource.get(registration.resourceKey)?.has(id))
          : false;
      const hasNatural = input.subjectType === "user" && registration.targetTypes.some((targetType) =>
        subjectHasNaturalTarget(subject, targetType, committee?.id ?? null),
      );
      if (!hasDirect && !hasPosition && !hasDepartment && !hasNatural) continue;
      const key = `${subject.id}:${input.resourceKey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      grants.push({
        subjectId: subject.id,
        resourceKey: registration.resourceKey,
        actionKey: "entry",
        resourceId: 0,
        scopeId: null,
        source: "entry",
      });
    }
  }
  return grants;
}
