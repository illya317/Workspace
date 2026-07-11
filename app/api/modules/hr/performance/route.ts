import { z } from "zod";

import {
  buildListHrPerformanceDashboardRouteCommand,
  executeListHrPerformanceDashboardRouteCommand,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const dashboardQuerySchema = z.object({
  cycleId: z.coerce.number().nullable().optional(),
  periodType: z.enum(["yearly", "half_year", "quarterly", "monthly", "weekly"]).optional(),
  audienceType: z.enum(["personal", "department", "project"]).optional(),
  audienceId: z.coerce.number().nullable().optional(),
  keyword: z.string().optional(),
  status: z.string().optional(),
});

export const GET = createCommandRoute({
  querySchema: dashboardQuerySchema,
  queryError: "绩效查询参数无效",
  buildCommand: ({ query, user }) => buildListHrPerformanceDashboardRouteCommand({
    userId: user.userId,
    query,
  }),
  action: executeListHrPerformanceDashboardRouteCommand,
});
