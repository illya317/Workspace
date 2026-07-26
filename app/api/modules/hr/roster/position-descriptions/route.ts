import { z } from "zod";

import {
  buildHrRouteCommand,
  executePositionDescriptionQuery,
  updatePositionDescription,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";const positionDescriptionQuerySchema = z.object({
  code: z.string().optional(),
  id: z.string().optional(),
  positionId: z.string().optional(),
  tree: z.string().optional(),
  search: z.string().optional(),
});

const updatePositionDescriptionSchema = z.object({
  id: z.unknown().optional(),
  headcount: z.unknown().optional(),
  details: z.unknown().optional(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: positionDescriptionQuerySchema,
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: executePositionDescriptionQuery,
});

export const PUT = createCommandRoute({
  bodySchema: updatePositionDescriptionSchema,
  bodyError: "参数错误",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => updatePositionDescription(body, userId),
});
