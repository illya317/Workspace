import { z } from "zod";

import { castMeetingVote } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const voteParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  proposalId: z.coerce.number().int().positive(),
});

const castVoteSchema = z.object({
  choice: z.enum(["yes", "no", "abstain"]),
  note: z.string().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: voteParamsSchema,
  paramsError: "表决 ID 无效",
  bodySchema: castVoteSchema,
  bodyError: "投票参数无效",
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    body: {
      proposalId: params.proposalId,
      choice: body.choice,
      note: body.note,
    },
  }),
  action: castMeetingVote,
});
