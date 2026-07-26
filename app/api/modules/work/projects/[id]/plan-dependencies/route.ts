import { z } from "zod";

import { syncProjectPlanDependencies } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const dependencySchema = z.object({
  predecessorKind: z.enum(["project", "task"]),
  predecessorId: z.coerce.number().int().positive(),
  successorKind: z.enum(["project", "task"]),
  successorId: z.coerce.number().int().positive(),
  lagDays: z.coerce.number().int().optional(),
});

const dependenciesBodySchema = z.object({
  dependencies: z.array(dependencySchema).optional(),
}).passthrough();

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: dependenciesBodySchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    body,
  }),
  action: syncProjectPlanDependencies,
});
