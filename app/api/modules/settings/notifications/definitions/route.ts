import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import { listPublishedNotificationDefinitionsForSource } from "@workspace/platform/server/notification-publishing";

export const GET = createApiRouteHandler({
  handler: async ({ user }) => ({
    items: await listPublishedNotificationDefinitionsForSource({
      kind: "user-api",
      id: String(user.userId),
      label: "个人 API 用户 " + user.userId,
    }),
  }),
});
