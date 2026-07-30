import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import { listWecomGroupNotificationConsoleData } from "@workspace/platform/server/wecom-group-notifications";

export const GET = createApiRouteHandler({
  handler: ({ user }) => listWecomGroupNotificationConsoleData(user.userId),
});
