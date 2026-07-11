import {
  executeAssignedDepartmentWorkItemsRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

export const GET = createCommandRoute({
  buildCommand: ({ user }) => ({
    ok: true as const,
    data: { userId: user.userId },
  }),
  action: executeAssignedDepartmentWorkItemsRouteCommand,
});
