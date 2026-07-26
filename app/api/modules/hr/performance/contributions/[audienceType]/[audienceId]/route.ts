import { z } from "zod";

import {
  buildGetHrPerformanceContributionDetailRouteCommand,
  executeGetHrPerformanceContributionDetailRouteCommand,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const GET = createCommandRoute({
  paramsSchema: z.object({
    audienceType: z.enum(["personal", "department", "project"]),
    audienceId: z.coerce.number().int().positive(),
  }),
  querySchema: z.object({ cycleId: z.coerce.number().int().positive() }),
  paramsError: "查看范围参数无效",
  queryError: "周期参数无效",
  buildCommand: ({ params, query, user }) => buildGetHrPerformanceContributionDetailRouteCommand({
    userId: user.userId,
    audienceType: params.audienceType,
    audienceId: params.audienceId,
    cycleId: query.cycleId,
  }),
  action: executeGetHrPerformanceContributionDetailRouteCommand,
});
