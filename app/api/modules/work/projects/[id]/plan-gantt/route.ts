import { z } from "zod";

import { listProjectPlanGantt, saveProjectPlanGantt } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const planItemBodySchema = z.object({
  kind: z.enum(["project", "task"]),
  id: z.coerce.number().int().positive(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  phaseId: z.coerce.number().int().positive().nullable().optional(),
});

const savePlanBodySchema = z.object({
  items: z.array(planItemBodySchema).optional(),
}).passthrough();

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
  }),
  action: listProjectPlanGantt,
});

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: savePlanBodySchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    body,
  }),
  action: saveProjectPlanGantt,
});
