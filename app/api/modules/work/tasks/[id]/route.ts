import { z } from "zod";

import {
  buildDeleteWorkItemRouteCommand,
  buildUpdateWorkItemRouteCommand,
  executeDeleteWorkItemRouteCommand,
  executeUpdateWorkItemRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const updateWorkItemSchema = z.object({
  planId: z.coerce.number().nullable().optional(),
  category: z.string().optional(),
  itemType: z.string().optional(),
  content: z.string().optional(),
  description: z.string().optional(),
  importance: z.coerce.number().int().optional(),
  urgency: z.coerce.number().int().optional(),
  status: z.enum(["active", "paused", "done"]).nullable().optional(),
  krStartValue: z.coerce.number().nullable().optional(),
  krTargetValue: z.coerce.number().nullable().optional(),
  krCurrentValue: z.coerce.number().nullable().optional(),
  krUnit: z.string().nullable().optional(),
  routineTaskType: z.string().nullable().optional(),
  routineRecurrenceType: z.string().nullable().optional(),
  routineRecurrenceTime: z.string().nullable().optional(),
  routineRecurrenceWeekday: z.coerce.number().nullable().optional(),
  routineRecurrenceMonthDay: z.coerce.number().nullable().optional(),
  routineRecurrenceQuarterDay: z.coerce.number().nullable().optional(),
  routineRecurrenceYearMonth: z.coerce.number().nullable().optional(),
  routineRecurrenceYearDay: z.coerce.number().nullable().optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  collaborationId: z.coerce.number().nullable().optional(),
  actualStartDate: z.string().nullable().optional(),
  actualEndDate: z.string().nullable().optional(),
  plannedStartDate: z.string().nullable().optional(),
  plannedEndDate: z.string().nullable().optional(),
  isMilestone: z.boolean().optional(),
  milestoneDate: z.string().nullable().optional(),
  periodType: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  periodEnd: z.string().nullable().optional(),
  sourceType: z.string().optional(),
  sourceKind: z.string().nullable().optional(),
  sourceMeetingId: z.coerce.number().nullable().optional(),
  sourceMeetingDecisionId: z.coerce.number().nullable().optional(),
  sourceMeetingActionCandidateId: z.coerce.number().nullable().optional(),
  sourceDepartmentId: z.coerce.number().nullable().optional(),
  linkedProjectId: z.coerce.number().nullable().optional(),
  linkedProjectPhaseId: z.coerce.number().nullable().optional(),
  parentWorkItemId: z.coerce.number().nullable().optional(),
  parentPeriodWorkItemId: z.coerce.number().nullable().optional(),
  previousPeriodWorkItemId: z.coerce.number().nullable().optional(),
  responsibilityNodeId: z.coerce.number().nullable().optional(),
  responsibilityPositionId: z.coerce.number().nullable().optional(),
  evidenceTaskIds: z.array(z.coerce.number()).optional(),
  participants: z.string().optional(),
  sortOrder: z.coerce.number().int().optional(),
  isArchived: z.boolean().optional(),
});

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "节点 ID 无效",
  bodySchema: updateWorkItemSchema,
  bodyError: "节点参数无效",
  buildCommand: ({ params, body, user }) => buildUpdateWorkItemRouteCommand({
    userId: user.userId,
    workId: params.id,
    body,
  }),
  action: executeUpdateWorkItemRouteCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "节点 ID 无效",
  buildCommand: ({ params, user }) => buildDeleteWorkItemRouteCommand({
    userId: user.userId,
    workId: params.id,
  }),
  action: executeDeleteWorkItemRouteCommand,
});
