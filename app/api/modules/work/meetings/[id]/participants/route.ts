import { z } from "zod";

import { upsertMeetingParticipant } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const participantSchema = z.object({
  userId: z.coerce.number().int().positive(),
  role: z.string().optional(),
  canVote: z.boolean().optional(),
  attendanceStatus: z.string().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  bodySchema: participantSchema,
  bodyError: "参会人参数无效",
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: upsertMeetingParticipant,
});
