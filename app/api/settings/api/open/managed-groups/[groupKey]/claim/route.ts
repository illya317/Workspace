import { z } from "zod";

import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import {
  claimWecomManagedGroup,
  managedGroupClaimSchema,
} from "@workspace/platform/server/wecom-group-notifications";

const paramsSchema = z.object({ groupKey: z.string().trim().min(3).max(80) });

export const POST = createApiRouteHandler({
  paramsSchema,
  bodySchema: managedGroupClaimSchema,
  handler: ({ user, params, body }) =>
    claimWecomManagedGroup(user.userId, params.groupKey, body),
});
