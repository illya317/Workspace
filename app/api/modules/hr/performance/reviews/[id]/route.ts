import {
  executeGetHrPerformanceReviewRouteCommand,
} from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "绩效记录 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    reviewId: params.id,
  }),
  action: executeGetHrPerformanceReviewRouteCommand,
});
