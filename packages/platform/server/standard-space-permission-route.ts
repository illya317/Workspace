import "server-only";

import { z } from "zod";

import type { PermissionActionKey, PermissionActionSource } from "../permission-actions";
import type { NaturalSpaceActionProfile } from "../permission-natural-space-actions";
import {
  getSpaceChildResourceKeyForTargetType,
  getSpaceParentResourceKeyForTargetType,
  type SpaceResourceKind,
} from "../permission-resource-policy";
import { isSpacePermissionTargetSupportedByKey } from "../space-registry";
import { serviceError, serviceOk } from "./api";
import { isSuperAdmin } from "./auth";
import { canManageScopedPermissionGrant, listNaturalSpacePermissions } from "./business-space-permissions";
import { setPermissionGrantFromRequest } from "./rbac/action-grant-request";

export type StandardSpacePermissionTargetType = "personal" | "company" | "committee" | "department";

type NaturalSpaceActionGrant = {
  userId: number;
  actionProfile: NaturalSpaceActionProfile;
  actionSource?: PermissionActionSource;
};

export type StandardSpacePermissionGrantCommand = {
  userId: number;
  targetType: StandardSpacePermissionTargetType;
  targetId: number;
  resourceKey: string | null;
  scopeId: string;
  includeNatural: boolean;
  includeImplicit: boolean;
  includeStored: boolean;
};

export type StandardSpacePermissionSetCommand = {
  actorUserId: number;
  targetType: StandardSpacePermissionTargetType;
  targetId: number;
  resourceKey: string | null;
  scopeId: string;
  subjectId: number;
  actionKey: string;
  value: boolean;
};

type StandardSpacePermissionRouteConfig<TGrantData extends object> = {
  registrationKey: string;
  deniedText: string;
  canManage: (input: {
    userId: number;
    targetType: StandardSpacePermissionTargetType;
    targetId: number;
    resourceKey: string;
    scopeId: string;
  }) => Promise<boolean>;
  loadPermissionGrantData: (
    subjectType: "user",
    resourceKey: string,
    scopeId: string,
    options: {
      includeImplicitGrants: boolean;
      includeStoredGrants: boolean;
      projection: "space";
      canMutateGrantAction: boolean;
    },
  ) => Promise<TGrantData>;
  mergeBusinessSpaceActions: (
    data: TGrantData,
    input: {
      grantResourceKey?: string;
      selectedResourceKey?: string;
      scopeId: string | null;
      naturalActions: NaturalSpaceActionGrant[];
    },
  ) => TGrantData;
};

export const standardSpacePermissionActionSchema = z.object({
  subjectType: z.literal("user").optional(),
  subjectId: z.coerce.number().int().positive(),
  actionKey: z.string().trim().min(1),
  value: z.boolean(),
});

export function queryStandardSpacePermissionFlag(searchParams: URLSearchParams, key: string, fallback: boolean) {
  const value = searchParams.get(key);
  if (value == null) return fallback;
  return value !== "false" && value !== "0";
}

export function resolveStandardSpacePermissionResourceKey({
  targetType,
  searchParams,
  rootResourceKey,
  spaceResourceKind,
  allowedResourceKeys,
}: {
  targetType: StandardSpacePermissionTargetType;
  searchParams: URLSearchParams;
  rootResourceKey: string;
  spaceResourceKind: SpaceResourceKind;
  allowedResourceKeys?: readonly string[];
}) {
  const defaultResourceKey = targetType === "personal"
    ? rootResourceKey
    : getSpaceChildResourceKeyForTargetType(targetType, spaceResourceKind) ?? rootResourceKey;
  const resourceKey = searchParams.get("resourceKey") || defaultResourceKey;
  if (allowedResourceKeys?.length) return allowedResourceKeys.includes(resourceKey) ? resourceKey : null;
  return resourceKey === defaultResourceKey ? resourceKey : null;
}

export async function getStandardSpacePermissionGrantData<TGrantData extends object>(
  command: StandardSpacePermissionGrantCommand,
  config: StandardSpacePermissionRouteConfig<TGrantData>,
) {
  if (!command.resourceKey) return serviceError("权限资源无效", 400);
  if (!isSpacePermissionTargetSupportedByKey(config.registrationKey, command.targetType)) {
    return serviceError("该空间不开放权限配置", 400);
  }
  if (!await config.canManage({
    userId: command.userId,
    targetType: command.targetType,
    targetId: command.targetId,
    resourceKey: command.resourceKey,
    scopeId: command.scopeId,
  })) {
    return serviceError(config.deniedText, 403);
  }

  const [isSystemAdmin, canMutateGrantAction] = await Promise.all([
    isSuperAdmin(command.userId),
    canManageScopedPermissionGrant(command.userId, command.resourceKey, command.scopeId),
  ]);
  const [grantData, natural] = await Promise.all([
    config.loadPermissionGrantData("user", command.resourceKey, command.scopeId, {
      includeImplicitGrants: command.includeImplicit,
      includeStoredGrants: command.includeStored,
      projection: "space",
      canMutateGrantAction: isSystemAdmin || canMutateGrantAction,
    }),
    command.includeNatural
      ? listNaturalSpacePermissions(command.targetType, command.targetId)
      : Promise.resolve([]),
  ]);
  const parentResourceKey = getSpaceParentResourceKeyForTargetType(command.targetType);
  const data = config.mergeBusinessSpaceActions(grantData, {
    grantResourceKey: parentResourceKey ?? command.resourceKey,
    selectedResourceKey: command.resourceKey,
    scopeId: command.scopeId,
    naturalActions: natural.map((permission) => ({
      userId: permission.userId,
      actionProfile: permission.actionProfile,
      actionSource: permission.actionSource,
    })),
  });
  return serviceOk({ ...data, resourceKey: command.resourceKey, scopeId: command.scopeId, subjectType: "user" as const });
}

export async function setStandardSpacePermissionGrant<TGrantData extends object>(
  command: StandardSpacePermissionSetCommand,
  config: Pick<StandardSpacePermissionRouteConfig<TGrantData>, "registrationKey" | "deniedText" | "canManage">,
) {
  if (!command.resourceKey) return serviceError("权限资源无效", 400);
  if (!isSpacePermissionTargetSupportedByKey(config.registrationKey, command.targetType)) {
    return serviceError("该空间不开放权限配置", 400);
  }
  if (!await config.canManage({
    userId: command.actorUserId,
    targetType: command.targetType,
    targetId: command.targetId,
    resourceKey: command.resourceKey,
    scopeId: command.scopeId,
  })) {
    return serviceError(config.deniedText, 403);
  }

  const result = await setPermissionGrantFromRequest({
    actorUserId: command.actorUserId,
    subjectType: "user",
    subjectId: command.subjectId,
    resourceKey: command.resourceKey,
    actionKey: command.actionKey as PermissionActionKey,
    value: command.value,
    scopeId: command.scopeId,
    isSystemAdmin: await isSuperAdmin(command.actorUserId),
    preauthorizedActor: true,
    projection: "space",
  });
  if (!result.ok) return serviceError(result.error, result.status);
  return serviceOk({ success: true });
}
