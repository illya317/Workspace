import { z } from "zod";

import { closeMeetingProposal } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const voteParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  proposalId: z.coerce.number().int().positive(),
});

export const POST = createCommandRoute({
  paramsSchema: voteParamsSchema,
  paramsError: "表决 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    proposalId: params.proposalId,
  }),
  action: closeMeetingProposal,
});
