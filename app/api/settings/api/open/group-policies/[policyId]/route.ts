import { z } from "zod";

import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import {
  notificationGroupPolicyUpdateSchema,
  updateNotificationGroupPolicy,
} from "@workspace/platform/server/wecom-group-notifications";

const paramsSchema = z.object({ policyId: z.string().uuid() });

export const PATCH = createApiRouteHandler({
  paramsSchema,
  bodySchema: notificationGroupPolicyUpdateSchema,
  handler: ({ user, params, body }) =>
    updateNotificationGroupPolicy(user.userId, params.policyId, body),
});
