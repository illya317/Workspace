import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildArchiveWorkPlanCommand,
  buildUpdateWorkPlanCommand,
  executeArchiveWorkPlanCommand,
  executeUpdateWorkPlanCommand,
} from "@workspace/work/server";

const updateWorkPlanSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  periodType: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  sourceType: z.string().optional(),
  sourceKind: z.string().nullable().optional(),
  sourceMeetingId: z.coerce.number().nullable().optional(),
  sourceMeetingDecisionId: z.coerce.number().nullable().optional(),
  sourceMeetingActionCandidateId: z.coerce.number().nullable().optional(),
  linkedProjectId: z.coerce.number().nullable().optional(),
  linkedProjectPhaseId: z.coerce.number().nullable().optional(),
  linkedProjectTaskId: z.coerce.number().nullable().optional(),
  sortOrder: z.coerce.number().optional(),
}).passthrough();

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: updateWorkPlanSchema,
  paramsError: "工作计划 ID 无效",
  bodyError: "工作计划参数无效",
  buildCommand: ({ user, params, body }) => buildUpdateWorkPlanCommand({
    userId: user.userId,
    planId: params.id,
    body,
  }),
  action: executeUpdateWorkPlanCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "工作计划 ID 无效",
  buildCommand: ({ user, params }) => buildArchiveWorkPlanCommand({
    userId: user.userId,
    planId: params.id,
  }),
  action: executeArchiveWorkPlanCommand,
});
