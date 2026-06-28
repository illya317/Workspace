import { z } from "zod";

import {
  buildCreateWorkItemRouteCommand,
  buildListWorkItemsRouteCommand,
  executeCreateWorkItemRouteCommand,
  executeListWorkItemsRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const optionalNumber = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().optional(),
);

const optionalBoolean = z.preprocess(
  (value) => value === true || value === "true",
  z.boolean().optional(),
);

const workItemsQuerySchema = z.object({
  category: z.string().optional(),
  planId: optionalNumber.nullable().optional(),
  periodType: z.string().nullable().optional(),
  periodStart: z.string().nullable().optional(),
  includeArchived: optionalBoolean,
  targetType: z.string().optional(),
  targetId: optionalNumber,
  deptId: optionalNumber,
});

const createWorkItemSchema = z.object({
  planId: z.coerce.number().optional(),
  category: z.string().min(1).optional(),
  itemType: z.string().optional(),
  content: z.string().min(1),
  description: z.string().optional(),
  importance: z.coerce.number().optional(),
  urgency: z.coerce.number().optional(),
  status: z.string().nullable().optional(),
  krStartValue: z.coerce.number().nullable().optional(),
  krTargetValue: z.coerce.number().nullable().optional(),
  krCurrentValue: z.coerce.number().nullable().optional(),
  krUnit: z.string().nullable().optional(),
  ownerEmployeeId: z.coerce.number().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
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
  parentWorkItemId: z.coerce.number().nullable().optional(),
  participants: z.string().optional(),
  sortOrder: z.coerce.number().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.number().optional(),
  deptId: z.coerce.number().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: workItemsQuerySchema,
  buildCommand: ({ query, user }) => buildListWorkItemsRouteCommand({
    user,
    query,
  }),
  action: executeListWorkItemsRouteCommand,
});

export const POST = createCommandRoute({
  bodySchema: createWorkItemSchema,
  bodyError: "节点内容不能为空",
  buildCommand: ({ body, user }) => buildCreateWorkItemRouteCommand({
    user,
    body,
  }),
  action: executeCreateWorkItemRouteCommand,
});
