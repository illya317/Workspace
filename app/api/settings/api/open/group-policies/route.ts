import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import {
  createNotificationGroupPolicy,
  notificationGroupPolicyCreateSchema,
} from "@workspace/platform/server/wecom-group-notifications";

export const POST = createApiRouteHandler({
  bodySchema: notificationGroupPolicyCreateSchema,
  handler: ({ user, body }) => createNotificationGroupPolicy(user.userId, body),
});
