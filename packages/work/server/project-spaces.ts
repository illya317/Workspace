import { serviceOk } from "@workspace/platform/server/api";
import { actionImplies, type PermissionActionKey } from "@workspace/platform/permission-actions";
import {
  getNaturalSpaceActionProfileActionKeys,
  type NaturalSpaceActionProfile,
} from "@workspace/platform/permission-natural-space-actions";
import { getSpaceChildResourceKeyForTargetType } from "@workspace/platform/permission-resource-policy";
import {
  businessSpaceScopeId,
  getCompanyNaturalSpaceActionProfile,
  getDepartmentNaturalSpaceActionProfile,
  getOperatingCommitteeNaturalSpaceActionProfile,
  canManageScopedPermissionGrant,
} from "@workspace/platform/server/business-space-permissions";
import { prisma } from "@workspace/platform/server/prisma";
import { evaluatePermissionAction } from "@workspace/platform/server/auth";
import { getUserPreferredDepartmentIds } from "@workspace/platform/server/user-preferences";
import { listStandardOrganizationSpaceSeeds } from "./standard-space-seeds";

export type WorkProjectSpaceTargetType = "personal" | "company" | "committee" | "department";

export type WorkProjectSpace = {
  targetType: WorkProjectSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  isOperatingCommittee: boolean;
  actionPermissions: WorkProjectSpaceActionPermissions;
};

export type WorkProjectSpaceActionPermissions = {
  canRead: boolean;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  canRevise: boolean;
  canManagePermissions: boolean;
};

type ProjectSpaceSeed = {
  targetType: WorkProjectSpaceTargetType;
  targetId: number;
  name: string;
  subtitle: string | null;
  isOperatingCommittee: boolean;
};

export async function executeWorkProjectSpacesRouteCommand(command: { userId: number }) {
  return serviceOk(await listWorkProjectSpaces(command.userId));
}

export function normalizeWorkProjectSpaceTargetType(targetType: string): WorkProjectSpaceTargetType {
  if (targetType === "user") return "personal";
  if (targetType === "personal" || targetType === "company" || targetType === "committee" || targetType === "department") return targetType;
  return "department";
}

export function getWorkProjectPermissionResourceKey(targetType: string) {
  const normalized = normalizeWorkProjectSpaceTargetType(targetType);
  if (normalized !== "company" && normalized !== "committee" && normalized !== "department") return "work.projects";
  return getSpaceChildResourceKeyForTargetType(normalized, "projects") ?? "work.projects";
}

export function getWorkProjectPermissionProjection(targetType: string) {
  return getWorkProjectPermissionResourceKey(targetType) === "work.projects" ? "default" : "space";
}

export function workProjectSpaceScopeId(targetType: string, targetId: number) {
  return businessSpaceScopeId(normalizeWorkProjectSpaceTargetType(targetType), targetId);
}

export async function listWorkProjectSpaces(userId: number): Promise<{ spaces: WorkProjectSpace[]; preferredDepartmentIds: number[] }> {
  const [user, organizationSpaces, preferredDepartmentIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        employees: { select: { name: true }, take: 1 },
      },
    }),
    listStandardOrganizationSpaceSeeds(),
    getUserPreferredDepartmentIds(userId),
  ]);

  const seeds = dedupeProjectSpaceSeeds([
    {
      targetType: "personal",
      targetId: userId,
      name: user?.employees[0]?.name || "个人空间",
      subtitle: "个人项目权限",
      isOperatingCommittee: false,
    },
    ...organizationSpaces.map(projectSpaceSeed),
  ]);
  const spaces = await Promise.all(seeds.map(async (seed) => {
    const actionPermissions = await getWorkProjectSpaceActionPermissions(userId, seed.targetType, seed.targetId);
    if (!actionPermissions.canRead) return null;
    return {
      ...seed,
      actionPermissions,
    };
  }));

  return {
    spaces: spaces.filter((space): space is WorkProjectSpace => Boolean(space)),
    preferredDepartmentIds,
  };
}

function projectSpaceSeed(space: {
  targetType: ProjectSpaceSeed["targetType"];
  targetId: number;
  name: string;
  subtitle: string | null;
  lifecycleStatus: "active" | "archived";
  isOperatingCommittee: boolean;
}): ProjectSpaceSeed {
  return {
    targetType: space.targetType,
    targetId: space.targetId,
    name: space.name,
    subtitle: space.lifecycleStatus === "archived" && space.subtitle ? `${space.subtitle} · 已归档` : space.subtitle,
    isOperatingCommittee: space.isOperatingCommittee,
  };
}

async function naturalWorkProjectSpaceActionProfile(
  userId: number,
  targetType: WorkProjectSpaceTargetType,
  targetId: number,
): Promise<NaturalSpaceActionProfile | null> {
  if (targetType === "personal") return targetId === userId ? "allBusiness" : null;
  if (targetType === "department") return getDepartmentNaturalSpaceActionProfile(userId, targetId);
  if (targetType === "company") return getCompanyNaturalSpaceActionProfile(userId);
  if (targetType === "committee") return getOperatingCommitteeNaturalSpaceActionProfile(userId);
  return null;
}

export async function canManageWorkProjectSpace(userId: number, targetType: string, targetId: number) {
  return canManageWorkProjectPermissionResource(
    userId,
    targetType,
    targetId,
    getWorkProjectPermissionResourceKey(targetType),
  );
}

export async function canManageWorkProjectPermissionResource(
  userId: number,
  targetType: string,
  targetId: number,
  resourceKey: string,
) {
  const scopeId = workProjectSpaceScopeId(targetType, targetId);
  return canManageScopedPermissionGrant(userId, resourceKey, scopeId);
}

export async function getWorkProjectSpaceActionPermissions(
  userId: number,
  targetType: string,
  targetId: number,
): Promise<WorkProjectSpaceActionPermissions> {
  const normalizedTargetType = normalizeWorkProjectSpaceTargetType(targetType);
  const scopeId = workProjectSpaceScopeId(targetType, targetId);
  const resourceKey = getWorkProjectPermissionResourceKey(targetType);
  const projection = getWorkProjectPermissionProjection(targetType);
  const [profile, canRead, canCreate, canUpdate, canDelete, canRevise, canManagePermissions] = await Promise.all([
    naturalWorkProjectSpaceActionProfile(userId, normalizedTargetType, targetId),
    evaluatePermissionAction(userId, resourceKey, "read", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "create", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "update", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "delete", { scopeId, projection }),
    evaluatePermissionAction(userId, resourceKey, "revise", { scopeId, projection }),
    canManageScopedPermissionGrant(userId, resourceKey, scopeId),
  ]);
  const natural = profile
    ? workProjectActionsFromKeys(resourceKey, getNaturalSpaceActionProfileActionKeys(resourceKey, profile))
    : emptyWorkProjectActions();
  return {
    canRead: natural.canRead || canRead || canCreate || canUpdate || canDelete || canRevise,
    canCreate: natural.canCreate || canCreate,
    canUpdate: natural.canUpdate || canUpdate,
    canDelete: natural.canDelete || canDelete,
    canRevise: natural.canRevise || canRevise,
    canManagePermissions,
  };
}

function emptyWorkProjectActions() {
  return {
    canRead: false,
    canCreate: false,
    canUpdate: false,
    canDelete: false,
    canRevise: false,
  };
}

function workProjectActionsFromKeys(resourceKey: string, actionKeys: PermissionActionKey[]) {
  void resourceKey;
  const grants = new Set(actionKeys);
  const allows = (actionKey: PermissionActionKey) =>
    actionKeys.some((grantedActionKey) => actionImplies(grantedActionKey, actionKey));
  return {
    canRead: allows("read"),
    canCreate: grants.has("create"),
    canUpdate: grants.has("update"),
    canDelete: grants.has("delete"),
    canRevise: grants.has("revise"),
  };
}

function dedupeProjectSpaceSeeds(seeds: ProjectSpaceSeed[]) {
  const seen = new Set<string>();
  return seeds.filter((seed) => {
    const key = `${seed.targetType}:${seed.targetId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
