import { z } from "zod";

import { createMeetingMinuteEntry } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const minuteSchema = z.object({
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  content: z.string().min(1),
  kind: z.string().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  bodySchema: minuteSchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: createMeetingMinuteEntry,
});
