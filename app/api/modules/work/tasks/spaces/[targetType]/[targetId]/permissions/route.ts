import { z } from "zod";

import { getPermissionGrantData, mergeBusinessSpaceActionsIntoPermissionGrantData } from "@workspace/hr/server/permission-subjects";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  getStandardSpacePermissionGrantData,
  queryStandardSpacePermissionFlag,
  resolveStandardSpacePermissionResourceKey,
  setStandardSpacePermissionGrant,
  standardSpacePermissionActionSchema,
  type StandardSpacePermissionTargetType,
} from "@workspace/platform/server/standard-space-permission-route";
import { canManageWorkTaskPermissionResource, normalizeWorkTargetType, workTaskScopeId } from "@workspace/work/server";

const paramsSchema = z.object({ targetType: z.enum(["personal", "company", "committee", "department"]), targetId: z.coerce.number().int().positive() });

const workTaskSpacePermissionConfig = {
  registrationKey: "work.tasks",
  deniedText: "无权限管理该工作空间",
  canManage: ({ userId, targetType, targetId, resourceKey }: { userId: number; targetType: StandardSpacePermissionTargetType; targetId: number; resourceKey: string }) =>
    canManageWorkTaskPermissionResource(userId, targetType, targetId, resourceKey),
  loadPermissionGrantData: getPermissionGrantData,
  mergeBusinessSpaceActions: mergeBusinessSpaceActionsIntoPermissionGrantData,
};

function normalizeTargetType(targetType: string): StandardSpacePermissionTargetType {
  return normalizeWorkTargetType(targetType) as StandardSpacePermissionTargetType;
}

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "工作空间参数无效",
  buildCommand: ({ params, user, searchParams }) => {
    const targetType = normalizeTargetType(params.targetType);
    return okCommand({
      userId: user.userId,
      targetType,
      targetId: params.targetId,
      scopeId: workTaskScopeId(targetType, params.targetId),
      resourceKey: resolveStandardSpacePermissionResourceKey({
        targetType,
        searchParams,
        rootResourceKey: "work.tasks",
        spaceResourceKind: "tasks",
      }),
      includeNatural: queryStandardSpacePermissionFlag(searchParams, "includeNatural", true),
      includeImplicit: queryStandardSpacePermissionFlag(searchParams, "includeImplicit", true),
      includeStored: queryStandardSpacePermissionFlag(searchParams, "includeStored", true),
    });
  },
  action: (command) => getStandardSpacePermissionGrantData(command, workTaskSpacePermissionConfig),
});

export const PUT = createCommandRoute({
  paramsSchema,
  paramsError: "工作空间参数无效",
  bodySchema: standardSpacePermissionActionSchema,
  bodyError: "权限参数无效",
  buildCommand: ({ params, body, user, searchParams }) => {
    const targetType = normalizeTargetType(params.targetType);
    return okCommand({
      actorUserId: user.userId,
      targetType,
      targetId: params.targetId,
      scopeId: workTaskScopeId(targetType, params.targetId),
      subjectId: body.subjectId,
      actionKey: body.actionKey,
      value: body.value,
      resourceKey: resolveStandardSpacePermissionResourceKey({
        targetType,
        searchParams,
        rootResourceKey: "work.tasks",
        spaceResourceKind: "tasks",
      }),
    });
  },
  action: (command) => setStandardSpacePermissionGrant(command, workTaskSpacePermissionConfig),
});
