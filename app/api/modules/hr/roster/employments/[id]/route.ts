import { rejectEmploymentDelete, updateEmploymentField, buildHrRouteCommand } from "@workspace/hr/server";
import { routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  bodySchema: updateFieldBodySchema,
  bodyError: "参数错误",
  buildCommand: ({ user, params, body }) => buildHrRouteCommand({
    userId: user.userId,
    id: params.id,
    field: body.field,
    value: body.value,
  }),
  action: updateEmploymentField,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  buildCommand: () => buildHrRouteCommand({}),
  action: () => rejectEmploymentDelete(),
});
