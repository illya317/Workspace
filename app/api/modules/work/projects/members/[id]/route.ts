import { routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { deleteProjectMemberAction, updateProjectMemberFieldAction } from "@workspace/work/server";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: updateFieldBodySchema,
  paramsError: "ID 无效",
  buildCommand: ({ user, params, body }) => okCommand({
    userId: user.userId,
    recordId: params.id,
    body,
  }),
  action: updateProjectMemberFieldAction,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  buildCommand: ({ user, params }) => okCommand({
    userId: user.userId,
    recordId: params.id,
  }),
  action: deleteProjectMemberAction,
});
