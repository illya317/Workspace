import "server-only";

import { evaluatePermissionAction } from "./auth";
import {
  businessSpaceScopeId,
  canManageScopedPermissionGrant,
  getGroupCompanyContext,
  getOperatingCommitteeDepartmentContext,
} from "./business-space-permissions";
import { ensureDocsEditorSpaceForTarget } from "./docs-editor";
import { prisma } from "./prisma";
import { getUserPreferredDepartmentIds } from "./user-preferences";
import { PERMISSION_ACTION_KEYS, type PermissionActionKey } from "../permission-actions";
import {
  getSpaceChildResourceKeyForTargetType,
  getSpaceParentResourceKeyForTargetType,
  isPermissionActionSupported,
} from "../permission-resource-policy";
import {
  buildSpacePermissionsPath,
  getRegisteredSpaceDefinitions,
  getSpaceTargetTypes,
  type RegisteredSpaceDefinition,
} from "../space-registry";

export type UnifiedSpaceType = "personal" | "department" | "committee" | "company";
export type UnifiedSpaceResourceKind = string;

export interface UnifiedSpaceResourceDto {
  key: string;
  name: string;
  entryKind: UnifiedSpaceResourceKind;
  resourceKey: string;
  targetType: UnifiedSpaceType;
  targetId: number;
  scopeId: string;
  permissionsPath: string;
  docsSpaceId?: string;
  supportedActions: PermissionActionKey[];
  canAccess: boolean;
  canManage: boolean;
}

export interface UnifiedSpaceDto {
  key: string;
  name: string;
  spaceType: UnifiedSpaceType;
  targetId: number;
  subtitle: string | null;
  resourceKey: string | null;
  scopeId: string;
  permissionsPath: string | null;
  supportedActions: PermissionActionKey[];
  canManage: boolean;
  managementVisible: boolean;
  children: UnifiedSpaceResourceDto[];
}

type SpaceSeed = {
  spaceType: UnifiedSpaceType;
  targetId: number;
  name: string;
  subtitle: string | null;
};

export async function listUnifiedSpacesForUser(userId: number): Promise<{ spaces: UnifiedSpaceDto[] }> {
  const seeds = await listUnifiedSpaceSeeds(userId);
  const spaces = await Promise.all(seeds.map((seed) => toUnifiedSpaceDto(userId, seed)));
  return { spaces: spaces.filter((space): space is UnifiedSpaceDto => Boolean(space)) };
}

async function listUnifiedSpaceSeeds(userId: number): Promise<SpaceSeed[]> {
  const [user, departments, committee, company] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employees: { select: { name: true }, take: 1 },
      },
    }),
    listSelectedDepartments(userId),
    getOperatingCommitteeDepartmentContext(),
    getGroupCompanyContext(),
  ]);
  return [
    {
      spaceType: "personal",
      targetId: userId,
      name: user?.employees[0]?.name || "个人空间",
      subtitle: "个人空间",
    },
    ...departments.map((department) => ({
      spaceType: "department" as const,
      targetId: department.id,
      name: department.name,
      subtitle: department.code,
    })),
    ...(committee ? [{
      spaceType: "committee" as const,
      targetId: committee.id,
      name: committee.name,
      subtitle: committee.code,
    }] : []),
    ...(company ? [{
      spaceType: "company" as const,
      targetId: company.id,
      name: company.name || "公司",
      subtitle: "公司空间",
    }] : []),
  ];
}

async function listSelectedDepartments(userId: number) {
  const preferredDepartmentIds = (await getUserPreferredDepartmentIds(userId)).slice(0, 3);
  if (preferredDepartmentIds.length === 0) return [];
  const departments = await prisma.department.findMany({
    where: {
      id: { in: preferredDepartmentIds },
      isArchived: false,
      hierarchyKind: "M",
    },
    select: { id: true, name: true, code: true },
  });
  const byId = new Map(departments.map((department) => [department.id, department]));
  return preferredDepartmentIds.map((id) => byId.get(id)).filter((department): department is { id: number; name: string; code: string } => Boolean(department));
}

async function toUnifiedSpaceDto(userId: number, seed: SpaceSeed): Promise<UnifiedSpaceDto | null> {
  const resources = getRegisteredSpaceDefinitions().filter((resource) => getSpaceTargetTypes(resource).includes(seed.spaceType));
  const children = await Promise.all(resources.map((resource) => toResourceDto(userId, seed, resource)));
  const scopeId = businessSpaceScopeId(seed.spaceType, seed.targetId);
  const resourceKey = getSpaceParentResourceKeyForTargetType(seed.spaceType);
  const scopedGrant = resourceKey
    ? await canManageScopedPermissionGrant(userId, resourceKey, scopeId)
    : false;
  const canManage = seed.spaceType !== "personal" && scopedGrant;
  return {
    key: `${seed.spaceType}:${seed.targetId}`,
    name: seed.spaceType === "personal" ? "我的个人空间" : seed.name,
    spaceType: seed.spaceType,
    targetId: seed.targetId,
    subtitle: seed.subtitle,
    resourceKey,
    scopeId,
    permissionsPath: resourceKey ? `/api/settings/account/spaces/${seed.spaceType}/${seed.targetId}/permissions` : null,
    supportedActions: resourceKey
      ? PERMISSION_ACTION_KEYS.filter((actionKey) => isPermissionActionSupported(resourceKey, actionKey))
      : [],
    canManage,
    managementVisible: seed.spaceType !== "personal" && (canManage || children.some((child) => child.canManage)),
    children,
  };
}

async function toResourceDto(
  userId: number,
  seed: SpaceSeed,
  resource: RegisteredSpaceDefinition,
): Promise<UnifiedSpaceResourceDto> {
  const scopeId = businessSpaceScopeId(seed.spaceType, seed.targetId);
  const permissionResourceKey = resource.spaceResourceKind
    ? getSpaceChildResourceKeyForTargetType(seed.spaceType, resource.spaceResourceKind) ?? resource.resourceKey
    : resource.resourceKey;
  const [scopedAccess, scopedGrant, docsSpace] = await Promise.all([
    evaluatePermissionAction(userId, permissionResourceKey, "read", { scopeId, projection: "space" }),
    canManageScopedPermissionGrant(userId, permissionResourceKey, scopeId),
    resource.entryKind === "docs-editor" ? ensureDocsEditorSpaceForTarget(seed.spaceType, seed.targetId) : Promise.resolve(null),
  ]);
  return {
    key: `${resource.entryKind}:${seed.spaceType}:${seed.targetId}`,
    name: resource.label,
    entryKind: resource.entryKind,
    resourceKey: permissionResourceKey,
    targetType: seed.spaceType,
    targetId: seed.targetId,
    scopeId,
    permissionsPath: buildSpacePermissionsPath(resource, {
      targetType: seed.spaceType,
      targetId: seed.targetId,
      docsSpaceId: docsSpace?.id ?? null,
    }),
    ...(docsSpace ? { docsSpaceId: String(docsSpace.id) } : {}),
    supportedActions: PERMISSION_ACTION_KEYS.filter((actionKey) => isPermissionActionSupported(permissionResourceKey, actionKey)),
    canAccess: seed.spaceType === "personal" || scopedAccess,
    canManage: seed.spaceType === "personal" || scopedGrant,
  };
}
