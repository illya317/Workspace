import { z } from "zod";

import { getPermissionGrantData, mergeBusinessSpaceRolesIntoPermissionGrantData } from "@workspace/hr/server/permission-subjects";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { isPermissionActionKey, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { setSubjectPermissionActionGrant } from "@workspace/platform/server/rbac/action-grants";
import { canManageWorkTaskSpace, listWorkSpacePermissions, normalizeWorkTargetType, workTaskScopeId } from "@workspace/work/server";

const paramsSchema = z.object({
  targetType: z.enum(["personal", "user", "company", "committee", "department", "project", "position"]),
  targetId: z.coerce.number().int().positive(),
});

const permissionActionSchema = z.object({
  subjectType: z.literal("user").optional(),
  subjectId: z.coerce.number().int().positive(),
  actionKey: z.string().trim().min(1),
  value: z.boolean(),
});

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "工作空间参数无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    targetType: normalizeWorkTargetType(params.targetType),
    targetId: params.targetId,
  }),
  action: async (command) => {
    if (!await canManageWorkTaskSpace(command.userId, command.targetType, command.targetId)) {
      return serviceError("无权限管理该工作空间", 403);
    }
    const scopeId = workTaskScopeId(command.targetType, command.targetId);
    const [grantData, spacePermissions] = await Promise.all([
      getPermissionGrantData("user", "work.tasks", scopeId),
      listWorkSpacePermissions({
        userId: command.userId,
        targetType: command.targetType,
        targetId: command.targetId,
      }),
    ]);
    if (!spacePermissions.ok) return serviceError(spacePermissions.error, spacePermissions.status);
    const data = mergeBusinessSpaceRolesIntoPermissionGrantData(grantData, {
      resourceKey: "work.tasks",
      scopeId,
      roles: spacePermissions.data.permissions.map((permission) => ({
        userId: permission.userId,
        role: permission.role,
        source: permission.actionSource,
      })),
    });
    return serviceOk({ ...data, resourceKey: "work.tasks", scopeId, subjectType: "user" as const });
  },
});

export const PUT = createCommandRoute({
  paramsSchema,
  paramsError: "工作空间参数无效",
  bodySchema: permissionActionSchema,
  bodyError: "权限参数无效",
  buildCommand: ({ params, body, user }) => okCommand({
    actorUserId: user.userId,
    targetType: normalizeWorkTargetType(params.targetType),
    targetId: params.targetId,
    subjectId: body.subjectId,
    actionKey: body.actionKey,
    value: body.value,
  }),
  action: async (command) => {
    if (!await canManageWorkTaskSpace(command.actorUserId, command.targetType, command.targetId)) {
      return serviceError("无权限管理该工作空间", 403);
    }
    if (!isPermissionActionKey(command.actionKey)) return serviceError("权限动作无效", 400);
    await setSubjectPermissionActionGrant(
      "user",
      command.subjectId,
      "work.tasks",
      command.actionKey as PermissionActionKey,
      command.value,
      { actorUserId: command.actorUserId, scopeId: workTaskScopeId(command.targetType, command.targetId), storage: "action" },
    );
    return serviceOk({ success: true });
  },
});
