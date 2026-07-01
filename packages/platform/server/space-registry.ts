import "server-only";

import { evaluatePermissionAction } from "./auth";
import {
  businessSpaceScopeId,
  getCompanyNaturalSpaceRole,
  getDepartmentNaturalSpaceRole,
  getGroupCompanyContext,
  getOperatingCommitteeDepartmentContext,
  getOperatingCommitteeNaturalSpaceRole,
} from "./business-space-permissions";
import { ensureDocsEditorSpaceForTarget } from "./docs-editor";
import { prisma } from "./prisma";
import { getUserPreferredDepartmentIds } from "./user-preferences";
import type { BusinessSpaceRole } from "../permissions";
import {
  buildSpacePermissionsPath,
  getRegisteredSpaceDefinitions,
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
  canAccess: boolean;
  canManage: boolean;
}

export interface UnifiedSpaceDto {
  key: string;
  name: string;
  spaceType: UnifiedSpaceType;
  targetId: number;
  subtitle: string | null;
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
        nickname: true,
        username: true,
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
      name: user?.employees[0]?.name || user?.nickname || user?.username || "我的空间",
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
      code: { not: "EXC001" },
    },
    select: { id: true, name: true, code: true },
  });
  const byId = new Map(departments.map((department) => [department.id, department]));
  return preferredDepartmentIds.map((id) => byId.get(id)).filter((department): department is { id: number; name: string; code: string } => Boolean(department));
}

async function toUnifiedSpaceDto(userId: number, seed: SpaceSeed): Promise<UnifiedSpaceDto | null> {
  const resources = getRegisteredSpaceDefinitions().filter((resource) => resource.targetTypes.includes(seed.spaceType));
  const children = await Promise.all(resources.map((resource) => toResourceDto(userId, seed, resource)));
  return {
    key: `${seed.spaceType}:${seed.targetId}`,
    name: seed.spaceType === "personal" ? "我的个人空间" : seed.name,
    spaceType: seed.spaceType,
    targetId: seed.targetId,
    subtitle: seed.subtitle,
    managementVisible: seed.spaceType !== "personal" && children.some((child) => child.canManage),
    children,
  };
}

async function toResourceDto(
  userId: number,
  seed: SpaceSeed,
  resource: RegisteredSpaceDefinition,
): Promise<UnifiedSpaceResourceDto> {
  const scopeId = businessSpaceScopeId(seed.spaceType, seed.targetId);
  const naturalRole = await naturalSpaceRole(userId, seed);
  const [globalAccess, scopedAccess, globalAdmin, scopedAdmin, docsSpace] = await Promise.all([
    evaluatePermissionAction(userId, resource.resourceKey, "access"),
    evaluatePermissionAction(userId, resource.resourceKey, "access", { scopeId }),
    evaluatePermissionAction(userId, resource.resourceKey, "admin"),
    evaluatePermissionAction(userId, resource.resourceKey, "admin", { scopeId }),
    resource.entryKind === "docs-editor" ? ensureDocsEditorSpaceForTarget(seed.spaceType, seed.targetId) : Promise.resolve(null),
  ]);
  const naturalAccess = seed.spaceType === "personal"
    ? true
    : naturalRole === "viewer" || naturalRole === "editor" || naturalRole === "delete" || naturalRole === "manager";
  const naturalManage = seed.spaceType === "personal" ? true : naturalRole === "manager";
  return {
    key: `${resource.entryKind}:${seed.spaceType}:${seed.targetId}`,
    name: resource.label,
    entryKind: resource.entryKind,
    resourceKey: resource.resourceKey,
    targetType: seed.spaceType,
    targetId: seed.targetId,
    scopeId,
    permissionsPath: buildSpacePermissionsPath(resource, {
      targetType: seed.spaceType,
      targetId: seed.targetId,
      docsSpaceId: docsSpace?.id ?? null,
    }),
    ...(docsSpace ? { docsSpaceId: String(docsSpace.id) } : {}),
    canAccess: naturalAccess || globalAccess || scopedAccess,
    canManage: naturalManage || globalAdmin || scopedAdmin,
  };
}

async function naturalSpaceRole(userId: number, seed: SpaceSeed): Promise<BusinessSpaceRole | null> {
  if (seed.spaceType === "personal") return seed.targetId === userId ? "manager" : null;
  if (seed.spaceType === "department") return getDepartmentNaturalSpaceRole(userId, seed.targetId);
  if (seed.spaceType === "committee") return getOperatingCommitteeNaturalSpaceRole(userId);
  if (seed.spaceType === "company") return getCompanyNaturalSpaceRole(userId);
  return null;
}
