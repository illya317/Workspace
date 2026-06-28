import { z } from "zod";

import { createMeetingAgendaItem } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const agendaSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  presenterUserId: z.coerce.number().int().positive().nullable().optional(),
  sortOrder: z.coerce.number().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  bodySchema: agendaSchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: createMeetingAgendaItem,
});
