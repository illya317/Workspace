import {
  buildProjectSubmissionViewRouteCommand,
  executeGetProjectSubmissionRouteCommand,
} from "@workspace/work/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目确认单 ID 无效",
  buildCommand: ({ params, user }) => buildProjectSubmissionViewRouteCommand({
    userId: user.userId,
    requestId: params.id,
  }),
  action: executeGetProjectSubmissionRouteCommand,
});
