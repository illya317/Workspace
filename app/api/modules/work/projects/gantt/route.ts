import { z } from "zod";

import {
  buildProjectGanttRouteCommand,
  executeProjectGanttRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const projectGanttQuerySchema = z.object({
  includeTasks: z.enum(["1", "true"]).optional().catch(undefined),
});

export const GET = createCommandRoute({
  querySchema: projectGanttQuerySchema,
  buildCommand: ({ query, user }) => buildProjectGanttRouteCommand({
    userId: user.userId,
    includeTasks: query.includeTasks === "1" || query.includeTasks === "true",
  }),
  action: executeProjectGanttRouteCommand,
});
