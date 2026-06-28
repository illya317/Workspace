import { z } from "zod";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildMeetingActionCandidateCommand,
  executeMeetingActionCandidateCommand,
} from "@workspace/work/server";

const actionCandidateSchema = z.object({
  action: z.enum(["ignore", "linkWorkPlan", "createWorkPlan", "linkWorkItem", "createWorkItem", "linkProjectTask", "createProjectTask"]).optional(),
  candidateId: z.coerce.number().int().positive().optional(),
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  decisionId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  targetKind: z.string().optional(),
  workPlanId: z.coerce.number().int().positive().optional(),
  workItemId: z.coerce.number().int().positive().optional(),
  projectTaskId: z.coerce.number().int().positive().optional(),
  projectId: z.coerce.number().int().positive().optional(),
  targetType: z.string().optional(),
  targetId: z.coerce.number().int().positive().optional(),
  ownerEmployeeId: z.coerce.number().int().positive().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  content: z.string().optional(),
  name: z.string().optional(),
  category: z.string().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: actionCandidateSchema,
  paramsError: "会议 ID 无效",
  bodyError: "行动候选参数无效",
  buildCommand: ({ user, params, body }) => buildMeetingActionCandidateCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: executeMeetingActionCandidateCommand,
});
