import { deleteEdp, updateEdpField, buildHrRouteCommand } from "@workspace/hr/server";
import { readRequestExpectedVersion, routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "记录ID无效",
  bodySchema: updateFieldBodySchema,
  bodyError: "参数错误",
  buildCommand: ({ user, params, body }) => buildHrRouteCommand({
    userId: user.userId,
    id: params.id,
    field: body.field,
    value: body.value,
  }),
  action: updateEdpField,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "记录ID无效",
  buildCommand: ({ request, user, params }) => buildHrRouteCommand({
    userId: user.userId,
    id: params.id,
    expectedVersion: readRequestExpectedVersion(request),
  }),
  action: deleteEdp,
});
