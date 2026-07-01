import { z } from "zod";

import { getPermissionGrantData } from "@workspace/hr/server/permission-subjects";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { serviceError, serviceOk } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { isPermissionActionKey, type PermissionActionKey } from "@workspace/platform/permission-actions";
import { setSubjectPermissionActionGrant } from "@workspace/platform/server/rbac/action-grants";
import { canManageProject, workProjectScopeId, WorkProjectIdParamsSchema } from "@workspace/work/server";

const permissionActionSchema = z.object({
  subjectType: z.literal("user").optional(),
  subjectId: z.coerce.number().int().positive(),
  actionKey: z.string().trim().min(1),
  value: z.boolean(),
});

export const GET = createCommandRoute({
  paramsSchema: WorkProjectIdParamsSchema,
  paramsError: "项目 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
  }),
  action: async (command) => {
    if (!await canManageProject(command.userId, command.projectId)) {
      return serviceError("无权限管理该项目权限", 403);
    }
    const scopeId = workProjectScopeId(command.projectId);
    const data = await getPermissionGrantData("user", "work.projects", scopeId);
    return serviceOk({ ...data, resourceKey: "work.projects", scopeId, subjectType: "user" as const });
  },
});

export const PUT = createCommandRoute({
  paramsSchema: WorkProjectIdParamsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: permissionActionSchema,
  bodyError: "权限参数无效",
  buildCommand: ({ params, body, user }) => okCommand({
    actorUserId: user.userId,
    projectId: params.id,
    subjectId: body.subjectId,
    actionKey: body.actionKey,
    value: body.value,
  }),
  action: async (command) => {
    if (!await canManageProject(command.actorUserId, command.projectId)) {
      return serviceError("无权限管理该项目权限", 403);
    }
    if (!isPermissionActionKey(command.actionKey)) return serviceError("权限动作无效", 400);
    await setSubjectPermissionActionGrant(
      "user",
      command.subjectId,
      "work.projects",
      command.actionKey as PermissionActionKey,
      command.value,
      { actorUserId: command.actorUserId, scopeId: workProjectScopeId(command.projectId), storage: "action" },
    );
    return serviceOk({ success: true });
  },
});
