import { z } from "zod";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildCreateWorkPlanCommand,
  buildListWorkPlansCommand,
  executeCreateWorkPlanCommand,
  executeListWorkPlansCommand,
} from "@workspace/work/server";

const workPlanSchema = z.object({
  kind: z.string().optional(),
  title: z.string().min(1),
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
  targetType: z.string().optional(),
  targetId: z.coerce.number().optional(),
  deptId: z.coerce.number().optional(),
}).passthrough();

const workPlanQuerySchema = z.object({
  targetType: z.string().nullable().optional(),
  targetId: z.coerce.number().nullable().optional(),
  deptId: z.coerce.number().nullable().optional(),
  kind: z.string().nullable().optional(),
  includeArchived: z.string().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: workPlanQuerySchema,
  buildCommand: ({ user, query }) => buildListWorkPlansCommand({ user, query }),
  action: executeListWorkPlansCommand,
});

export const POST = createCommandRoute({
  bodySchema: workPlanSchema,
  bodyError: "工作计划参数无效",
  buildCommand: ({ user, body }) => buildCreateWorkPlanCommand({ user, body }),
  action: executeCreateWorkPlanCommand,
});
