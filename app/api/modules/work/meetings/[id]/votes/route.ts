import { z } from "zod";

import {
  buildMeetingVoteRouteCommand,
  executeMeetingVoteRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const voteActionSchema = z.object({
  action: z.enum(["create", "cast", "close"]).optional(),
  proposalId: z.coerce.number().int().positive().optional(),
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().optional(),
  content: z.string().optional(),
  voteVisibility: z.string().optional(),
  minVotesRequired: z.coerce.number().int().positive().nullable().optional(),
  choice: z.string().optional(),
  note: z.string().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  bodySchema: voteActionSchema,
  bodyError: "表决参数无效",
  buildCommand: ({ params, body, user }) => buildMeetingVoteRouteCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: executeMeetingVoteRouteCommand,
});
