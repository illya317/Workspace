import { z } from "zod";

import { createCommandRoute } from "@workspace/platform/server/api-route";
import {
  buildNotificationSubscriptionCommand,
  commitNotificationSubscriptionCommand,
} from "@workspace/platform/server/notification-subscriptions";

const eventKeyParamsSchema = z.object({
  eventKey: z.string().trim().min(1).max(120),
}).strict();

const overrideBodySchema = z.object({ enabled: z.boolean() }).strict();

export const PUT = createCommandRoute({
  paramsSchema: eventKeyParamsSchema,
  bodySchema: overrideBodySchema,
  paramsError: "通知类型无效",
  buildCommand: ({ params, body, user }) => buildNotificationSubscriptionCommand({
    mode: "override",
    userId: user.userId,
    eventKey: params.eventKey,
    enabled: body.enabled,
  }),
  action: commitNotificationSubscriptionCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema: eventKeyParamsSchema,
  paramsError: "通知类型无效",
  buildCommand: ({ params, user }) => buildNotificationSubscriptionCommand({
    mode: "reset",
    userId: user.userId,
    eventKey: params.eventKey,
  }),
  action: commitNotificationSubscriptionCommand,
});
