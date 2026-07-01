import { z } from "zod";

import { createMeetingProposal } from "@workspace/work/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const proposalSchema = z.object({
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().min(1),
  content: z.string().optional(),
  voteVisibility: z.string().optional(),
  minVotesRequired: z.coerce.number().int().positive().nullable().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  bodySchema: proposalSchema,
  bodyError: "表决参数无效",
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: createMeetingProposal,
});
