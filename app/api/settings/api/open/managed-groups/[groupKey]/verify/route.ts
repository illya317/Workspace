import { z } from "zod";

import { createApiRouteHandler } from "@workspace/platform/server/api-route";
import {
  managedGroupVerifySchema,
  verifyWecomManagedGroup,
} from "@workspace/platform/server/wecom-group-notifications";

const paramsSchema = z.object({ groupKey: z.string().trim().min(3).max(80) });

export const POST = createApiRouteHandler({
  paramsSchema,
  bodySchema: managedGroupVerifySchema,
  handler: ({ user, params, body }) =>
    verifyWecomManagedGroup(user.userId, params.groupKey, body),
});
