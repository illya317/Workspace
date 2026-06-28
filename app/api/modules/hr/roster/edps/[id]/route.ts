import { deleteEdp, updateEdpField, buildHrRouteCommand, idParams, replayJsonRequest } from "@workspace/hr/server";
import { routeIdParamsSchema, updateFieldBodySchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "记录ID无效",
  bodySchema: updateFieldBodySchema,
  bodyError: "参数错误",
  buildCommand: ({ request, params, body }) => buildHrRouteCommand({ request, id: params.id, body }),
  action: ({ request, id, body }) => updateEdpField(replayJsonRequest(request, body), idParams(id)),
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "记录ID无效",
  buildCommand: ({ request, params }) => buildHrRouteCommand({ request, id: params.id }),
  action: ({ request, id }) => deleteEdp(request, idParams(id)),
});
