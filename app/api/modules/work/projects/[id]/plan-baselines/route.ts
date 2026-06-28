import { z } from "zod";

import { createProjectPlanBaseline, listProjectPlanBaselines } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const baselineBodySchema = z.object({
  name: z.string().optional(),
  note: z.string().nullable().optional(),
}).passthrough();

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
  }),
  action: listProjectPlanBaselines,
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: baselineBodySchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    body,
  }),
  action: createProjectPlanBaseline,
});
