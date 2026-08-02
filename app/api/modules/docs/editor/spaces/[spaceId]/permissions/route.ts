import { z } from "zod";

import { getPermissionGrantData, mergeBusinessSpaceActionsIntoPermissionGrantData } from "@workspace/platform/server/permission-subjects";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { serviceError } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { docsEditorScopeId } from "@workspace/docs/server/permissions";
import { loadManageableDocsEditorPermissionSpace } from "@workspace/docs/server/space-permissions";
import {
  getSpaceChildResourceKeyForTargetType,
} from "@workspace/platform/permission-resource-policy";
import {
  getStandardSpacePermissionGrantData,
  queryStandardSpacePermissionFlag,
  setStandardSpacePermissionGrant,
  standardSpacePermissionActionSchema,
  type StandardSpacePermissionTargetType,
} from "@workspace/platform/server/standard-space-permission-route";

const paramsSchema = z.object({ spaceId: z.coerce.number().int().positive() });

function resolvePermissionResourceKey(searchParams: URLSearchParams) {
  const resourceKey = searchParams.get("resourceKey") || "docs.editor";
  const allowed = new Set([
    "docs.editor",
    ...(["department", "committee", "company"] as const)
      .map((targetType) => getSpaceChildResourceKeyForTargetType(targetType, "templates"))
      .filter((key): key is string => Boolean(key)),
  ]);
  return allowed.has(resourceKey) ? resourceKey : null;
}

type DocsEditorGetCommand = { userId: number; spaceId: number; resourceKey: string | null; includeNatural: boolean; includeImplicit: boolean; includeStored: boolean };
type DocsEditorPutCommand = { actorUserId: number; spaceId: number; subjectId: number; actionKey: string; value: boolean; resourceKey: string | null };

const docsEditorSpacePermissionConfig = {
  registrationKey: "docs.editor",
  deniedText: "无权限管理该模板空间",
  canManage: async () => true,
  loadPermissionGrantData: getPermissionGrantData,
  mergeBusinessSpaceActions: mergeBusinessSpaceActionsIntoPermissionGrantData,
};

async function getDocsEditorSpacePermissions(command: DocsEditorGetCommand) {
  if (!command.resourceKey) return serviceError("权限资源无效", 400);
  const loaded = await loadManageableDocsEditorPermissionSpace({
    userId: command.userId,
    spaceId: command.spaceId,
    resourceKey: command.resourceKey,
  });
  if (!loaded.ok) return loaded;
  return getStandardSpacePermissionGrantData({
    userId: command.userId,
    targetType: loaded.data.space.targetType as StandardSpacePermissionTargetType,
    targetId: loaded.data.space.targetId,
    resourceKey: command.resourceKey,
    scopeId: docsEditorScopeId(loaded.data.space),
    includeNatural: command.includeNatural,
    includeImplicit: command.includeImplicit,
    includeStored: command.includeStored,
  }, docsEditorSpacePermissionConfig);
}

async function setDocsEditorSpacePermission(command: DocsEditorPutCommand) {
  if (!command.resourceKey) return serviceError("权限资源无效", 400);
  const loaded = await loadManageableDocsEditorPermissionSpace({ userId: command.actorUserId, spaceId: command.spaceId, resourceKey: command.resourceKey });
  if (!loaded.ok) return loaded;
  return setStandardSpacePermissionGrant({
    actorUserId: command.actorUserId,
    targetType: loaded.data.space.targetType as StandardSpacePermissionTargetType,
    targetId: loaded.data.space.targetId,
    resourceKey: command.resourceKey,
    scopeId: docsEditorScopeId(loaded.data.space),
    subjectId: command.subjectId,
    actionKey: command.actionKey,
    value: command.value,
  }, docsEditorSpacePermissionConfig);
}

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "模板空间参数无效",
  buildCommand: ({ user, params, searchParams }) => okCommand({
    userId: user.userId,
    spaceId: params.spaceId,
    resourceKey: resolvePermissionResourceKey(searchParams),
    includeNatural: queryStandardSpacePermissionFlag(searchParams, "includeNatural", true),
    includeImplicit: queryStandardSpacePermissionFlag(searchParams, "includeImplicit", true),
    includeStored: queryStandardSpacePermissionFlag(searchParams, "includeStored", true),
  }),
  action: getDocsEditorSpacePermissions,
});

export const PUT = createCommandRoute({
  paramsSchema,
  paramsError: "模板空间参数无效",
  bodySchema: standardSpacePermissionActionSchema,
  bodyError: "权限参数无效",
  buildCommand: ({ user, params, body, searchParams }) => okCommand({
    actorUserId: user.userId,
    spaceId: params.spaceId,
    subjectId: body.subjectId,
    actionKey: body.actionKey,
    value: body.value,
    resourceKey: resolvePermissionResourceKey(searchParams),
  }),
  action: setDocsEditorSpacePermission,
});
