import { z } from "zod";

import { getPermissionGrantData, mergeBusinessSpaceRolesIntoPermissionGrantData } from "@workspace/hr/server/permission-subjects";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { isPermissionActionKey, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { docsEditorDb } from "@workspace/platform/server/docs-editor/db";
import { docsEditorScopeId, isDocsEditorRoleAtLeast, resolveSpaceRole } from "@workspace/platform/server/docs-editor/permissions";
import { listSpacePermissions } from "@workspace/platform/server/docs-editor/space-permissions";
import { setSubjectPermissionActionGrant } from "@workspace/platform/server/rbac/action-grants";

const paramsSchema = z.object({
  spaceId: z.coerce.number().int().positive(),
});

const permissionActionSchema = z.object({
  subjectType: z.literal("user").optional(),
  subjectId: z.coerce.number().int().positive(),
  actionKey: z.string().trim().min(1),
  value: z.boolean(),
});

async function loadManageableSpace(userId: number, spaceId: number) {
  const db = docsEditorDb();
  const space = await db.documentTemplateSpace.findFirst({ where: { id: spaceId, deletedAt: null } });
  if (!space) return { ok: false as const, error: "模板空间不存在", status: 404 };
  const role = await resolveSpaceRole(userId, space);
  if (!isDocsEditorRoleAtLeast(role, "manager")) return { ok: false as const, error: "无权限管理该模板空间", status: 403 };
  return { ok: true as const, space };
}

export const GET = createCommandRoute({
  paramsSchema,
  paramsError: "模板空间参数无效",
  buildCommand: ({ user, params }) => okCommand({
    userId: user.userId,
    spaceId: params.spaceId,
  }),
  action: async (command) => {
    const loaded = await loadManageableSpace(command.userId, command.spaceId);
    if (!loaded.ok) return serviceError(loaded.error, loaded.status);
    const scopeId = docsEditorScopeId(loaded.space);
    const [grantData, spacePermissions] = await Promise.all([
      getPermissionGrantData("user", "docs.editor", scopeId),
      listSpacePermissions({ userId: command.userId, spaceId: command.spaceId }),
    ]);
    if (!spacePermissions.ok) return serviceError(spacePermissions.error, spacePermissions.status);
    const data = mergeBusinessSpaceRolesIntoPermissionGrantData(grantData, {
      resourceKey: "docs.editor",
      scopeId,
      roles: spacePermissions.data.permissions.map((permission) => ({
        userId: permission.userId,
        role: permission.role,
        source: permission.actionSource,
      })),
    });
    return serviceOk({ ...data, resourceKey: "docs.editor", scopeId, subjectType: "user" as const });
  },
});

export const PUT = createCommandRoute({
  paramsSchema,
  paramsError: "模板空间参数无效",
  bodySchema: permissionActionSchema,
  bodyError: "权限参数无效",
  buildCommand: ({ user, params, body }) => okCommand({
    actorUserId: user.userId,
    spaceId: params.spaceId,
    subjectId: body.subjectId,
    actionKey: body.actionKey,
    value: body.value,
  }),
  action: async (command) => {
    const loaded = await loadManageableSpace(command.actorUserId, command.spaceId);
    if (!loaded.ok) return serviceError(loaded.error, loaded.status);
    if (!isPermissionActionKey(command.actionKey)) return serviceError("权限动作无效", 400);
    await setSubjectPermissionActionGrant(
      "user",
      command.subjectId,
      "docs.editor",
      command.actionKey as PermissionActionKey,
      command.value,
      { actorUserId: command.actorUserId, scopeId: docsEditorScopeId(loaded.space), storage: "action" },
    );
    return serviceOk({ success: true });
  },
});
