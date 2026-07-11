import { z } from "zod";

import { createMeetingDecision } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const decisionSchema = z.object({
  agendaItemId: z.coerce.number().int().positive().nullable().optional(),
  proposalId: z.coerce.number().int().positive().nullable().optional(),
  kind: z.string().optional(),
  title: z.string().min(1),
  content: z.string().optional(),
  effectiveDate: z.string().nullable().optional(),
}).passthrough();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  bodySchema: decisionSchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: createMeetingDecision,
});
