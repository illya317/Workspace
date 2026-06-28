import { z } from "zod";

import { deleteProjectPlanPhase, updateProjectPlanPhase } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const planPhaseParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  phaseId: z.coerce.number().int().positive(),
});

const planPhaseUpdateBodySchema = z.object({
  sequenceNo: z.coerce.number().int().positive().optional(),
  name: z.string().min(1).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
}).passthrough();

export const PUT = createCommandRoute({
  paramsSchema: planPhaseParamsSchema,
  paramsError: "项目阶段 ID 无效",
  bodySchema: planPhaseUpdateBodySchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    phaseId: params.phaseId,
    body,
  }),
  action: updateProjectPlanPhase,
});

export const DELETE = createCommandRoute({
  paramsSchema: planPhaseParamsSchema,
  paramsError: "项目阶段 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    phaseId: params.phaseId,
  }),
  action: deleteProjectPlanPhase,
});
