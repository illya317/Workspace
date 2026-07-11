import {
  buildProjectDeleteRouteCommand,
  buildProjectUpdateRouteCommand,
  executeDeleteProjectRouteCommand,
  executeUpdateProjectRouteCommand,
} from "@workspace/work/server";
import { routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  bodySchema: updateFieldBodySchema,
  bodyError: "请求体必须是合法 JSON",
  buildCommand: ({ params, body, user }) => buildProjectUpdateRouteCommand({
    id: params.id,
    userId: user.userId,
    field: body.field,
    value: body.value,
  }),
  action: executeUpdateProjectRouteCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  buildCommand: ({ params, user }) => buildProjectDeleteRouteCommand({
    id: params.id,
    userId: user.userId,
  }),
  action: executeDeleteProjectRouteCommand,
});
