import { executeWorkProjectSpacesRouteCommand } from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

export const GET = createCommandRoute({
  buildCommand: ({ user }) => okCommand({ userId: user.userId }),
  action: executeWorkProjectSpacesRouteCommand,
});
