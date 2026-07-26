import { deleteEdp, buildHrRouteCommand } from "@workspace/hr/server";
import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

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
