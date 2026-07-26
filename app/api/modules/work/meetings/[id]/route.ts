import { z } from "zod";

import { deleteMeeting, getMeetingDetail, updateMeeting } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { routeIdParamsSchema } from "@workspace/platform/server/api";

const updateMeetingSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  location: z.string().optional(),
  visibility: z.string().optional(),
  status: z.string().optional(),
  ownerUserId: z.coerce.number().int().positive().nullable().optional(),
  secretaryUserId: z.coerce.number().int().positive().nullable().optional(),
}).passthrough();

export const GET = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
  }),
  action: getMeetingDetail,
});

export const PUT = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  bodySchema: updateMeetingSchema,
  buildCommand: ({ params, body, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
    body,
  }),
  action: updateMeeting,
});

export const DELETE = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "会议 ID 无效",
  buildCommand: ({ params, user }) => okCommand({
    userId: user.userId,
    meetingId: params.id,
  }),
  action: deleteMeeting,
});
