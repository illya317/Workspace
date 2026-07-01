import { z } from "zod";

import { updatePosition } from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";

const archiveBodySchema = z.object({
  archived: z.boolean(),
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "ID 无效",
  bodySchema: archiveBodySchema,
  bodyError: "参数错误",
  buildCommand: ({ params, body, user }) => okCommand({
    id: params.id,
    archived: body.archived,
    userId: user.userId,
  }),
  action: ({ id, archived, userId }) => updatePosition(id, { isArchived: archived }, userId),
});
