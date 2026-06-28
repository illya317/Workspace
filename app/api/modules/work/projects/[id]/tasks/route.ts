import { z } from "zod";

import { createProjectTask, listProjectTasks } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const projectTaskBodySchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  isMilestone: z.boolean().optional(),
  ownerEmployeeId: z.coerce.number().int().positive().nullable().optional(),
  baselineStartDate: z.string().nullable().optional(),
  baselineEndDate: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  predecessorTaskIds: z.array(z.coerce.number().int().positive()).optional(),
  planPhaseId: z.coerce.number().int().positive().nullable().optional(),
  sourceMeetingDecisionId: z.coerce.number().int().positive().nullable().optional(),
  sourceMeetingActionCandidateId: z.coerce.number().int().positive().nullable().optional(),
  assignees: z.array(z.object({
    employeeId: z.coerce.number().int().positive(),
    role: z.string().nullable().optional(),
  })).optional(),
  sortOrder: z.coerce.number().int().optional(),
}).passthrough();

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
  }),
  action: listProjectTasks,
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目 ID 无效",
  bodySchema: projectTaskBodySchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    projectId: params.id,
    body,
  }),
  action: createProjectTask,
});
