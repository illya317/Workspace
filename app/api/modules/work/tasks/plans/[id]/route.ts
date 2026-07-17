import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildArchiveWorkPlanCommand,
  buildUpdateWorkPlanCommand,
  executeArchiveWorkPlanCommand,
  executeUpdateWorkPlanCommand,
  workImpactCommandBodySchema,
} from "@workspace/work/server";

const updateWorkPlanSchema = z.object({
  kind: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.enum(["active", "done"]).optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  collaborationId: z.coerce.number().nullable().optional(),
  okrCycleId: z.coerce.number().nullable().optional(),
  sourcePlanId: z.coerce.number().nullable().optional(),
  parentPeriodPlanId: z.coerce.number().nullable().optional(),
  previousPeriodPlanId: z.coerce.number().nullable().optional(),
  alignmentSourceType: z.string().nullable().optional(),
  alignmentSourcePlanId: z.coerce.number().nullable().optional(),
  alignmentSourceWorkItemId: z.coerce.number().nullable().optional(),
  periodType: z.string().nullable().optional(),
  actualStartDate: z.string().nullable().optional(),
  actualEndDate: z.string().nullable().optional(),
  plannedStartDate: z.string().nullable().optional(),
  plannedEndDate: z.string().nullable().optional(),
  isMilestone: z.boolean().optional(),
  milestoneDate: z.string().nullable().optional(),
  sourceType: z.string().optional(),
  sourceKind: z.string().nullable().optional(),
  sourceMeetingId: z.coerce.number().nullable().optional(),
  sourceMeetingDecisionId: z.coerce.number().nullable().optional(),
  sourceMeetingActionCandidateId: z.coerce.number().nullable().optional(),
  sourceDepartmentId: z.coerce.number().nullable().optional(),
  linkedProjectId: z.coerce.number().nullable().optional(),
  linkedProjectPhaseId: z.coerce.number().nullable().optional(),
  sortOrder: z.coerce.number().optional(),
}).strip();

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
  bodySchema: workImpactCommandBodySchema,
  paramsError: "工作计划 ID 无效",
  buildCommand: ({ user, params, body }) => buildArchiveWorkPlanCommand({
    userId: user.userId,
    planId: params.id,
    impactResolution: body.impactResolution,
  }),
  action: executeArchiveWorkPlanCommand,
});
