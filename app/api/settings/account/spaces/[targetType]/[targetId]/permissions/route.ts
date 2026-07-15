import { z } from "zod";
import { getPermissionGrantData, mergeBusinessSpaceActionsIntoPermissionGrantData } from "@workspace/platform/server/permission-subjects";
import { isSuperAdmin } from "@workspace/platform/server/auth";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { businessSpaceScopeId, canManageBusinessSpaceParent, listNaturalSpacePermissions } from "@workspace/platform/server/business-space-permissions";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { setPermissionGrantFromRequest } from "@workspace/platform/server/rbac/action-grant-request";
import {
  getSpaceParentResourceKeyForTargetType,
} from "@workspace/platform/permission-resource-policy";

const paramsSchema = z.object({
  targetType: z.enum(["company", "committee", "department"]),
  targetId: z.coerce.number().int().positive(),
});

const permissionActionSchema = z.object({
  subjectType: z.literal("user").optional(),
  subjectId: z.coerce.number().int().positive(),
  actionKey: z.string().trim().min(1),
  value: z.boolean(),
});

function queryFlag(searchParams: URLSearchParams, key: string, fallback: boolean) {
  const value = searchParams.get(key);
  if (value == null) return fallback;
  return value !== "false" && value !== "0";
}

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "空间参数无效",
  buildCommand: ({ params, user, searchParams }) => {
    const resourceKey = getSpaceParentResourceKeyForTargetType(params.targetType)!;
    const scopeId = businessSpaceScopeId(params.targetType, params.targetId);
    return okCommand({ userId: user.userId, targetType: params.targetType, targetId: params.targetId, resourceKey, scopeId,
      includeNatural: queryFlag(searchParams, "includeNatural", true),
      includeImplicit: queryFlag(searchParams, "includeImplicit", true),
      includeStored: queryFlag(searchParams, "includeStored", true),
    });
  },
  action: async (command) => {
    if (!await canManageBusinessSpaceParent(command.userId, command.resourceKey, command.scopeId)) {
      return serviceError("无权限管理该空间", 403);
    }
    const grantData = await getPermissionGrantData("user", command.resourceKey, command.scopeId, {
      includeImplicitGrants: command.includeImplicit,
      includeStoredGrants: command.includeStored,
      projection: "space",
      canMutateGrantAction: true,
    });
    const natural = command.includeNatural ? await listNaturalSpacePermissions(command.targetType, command.targetId) : [];
    const data = mergeBusinessSpaceActionsIntoPermissionGrantData(grantData, {
      resourceKey: command.resourceKey,
      scopeId: command.scopeId,
      naturalActions: natural.map((permission) => ({
        userId: permission.userId,
        actionProfile: permission.actionProfile,
        actionSource: permission.actionSource,
      })),
    });
    return serviceOk({ ...data, resourceKey: command.resourceKey, scopeId: command.scopeId, subjectType: "user" as const });
  },
});

export const PUT = createCommandRoute({
  paramsSchema,
  paramsError: "空间参数无效",
  bodySchema: permissionActionSchema,
  bodyError: "权限参数无效",
  buildCommand: ({ params, body, user }) => {
    const resourceKey = getSpaceParentResourceKeyForTargetType(params.targetType)!;
    return okCommand({ actorUserId: user.userId, targetType: params.targetType, targetId: params.targetId, subjectId: body.subjectId, actionKey: body.actionKey, value: body.value, resourceKey, scopeId: businessSpaceScopeId(params.targetType, params.targetId) });
  },
  action: async (command) => {
    if (!await canManageBusinessSpaceParent(command.actorUserId, command.resourceKey, command.scopeId)) {
      return serviceError("无权限管理该空间", 403);
    }
    const result = await setPermissionGrantFromRequest({
      actorUserId: command.actorUserId,
      subjectType: "user",
      subjectId: command.subjectId,
      resourceKey: command.resourceKey,
      actionKey: command.actionKey,
      value: command.value,
      scopeId: command.scopeId,
      isSystemAdmin: await isSuperAdmin(command.actorUserId),
      preauthorizedActor: true,
      projection: "space",
    });
    if (!result.ok) return serviceError(result.error, result.status);
    return serviceOk({ success: true });
  },
});
