import { z } from "zod";

import { createMeeting, listMeetings } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const optionalPositiveId = z.preprocess(
  (value) => (value === null || value === undefined || value === "" ? undefined : Number(value)),
  z.number().int().positive().optional(),
);

const meetingQuerySchema = z.object({
  typeId: optionalPositiveId,
});

const createMeetingSchema = z.object({
  typeId: z.coerce.number().int().positive(),
  seriesId: z.coerce.number().int().positive().nullable().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  startAt: z.string().nullable().optional(),
  endAt: z.string().nullable().optional(),
  location: z.string().optional(),
  visibility: z.string().optional(),
  ownerUserId: z.coerce.number().int().positive().nullable().optional(),
  secretaryUserId: z.coerce.number().int().positive().nullable().optional(),
  participantUserIds: z.array(z.coerce.number().int().positive()).optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: meetingQuerySchema,
  queryError: "会议类型无效",
  buildCommand: ({ query, user }) => okCommand({
    userId: user.userId,
    typeId: query.typeId ?? null,
  }),
  action: listMeetings,
});

export const POST = createCommandRoute({
  bodySchema: createMeetingSchema,
  buildCommand: ({ body, user }) => okCommand({
    userId: user.userId,
    body,
  }),
  action: createMeeting,
});
