import { z } from "zod";

import {
  buildHrRouteCommand,
  executePositionDescriptionQuery,
  updatePositionDescription,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRWrite } from "@workspace/platform/server/auth";

const positionDescriptionQuerySchema = z.object({
  code: z.string().optional(),
  tree: z.string().optional(),
  search: z.string().optional(),
});

const updatePositionDescriptionSchema = z.object({
  id: z.unknown().optional(),
  code: z.unknown().optional(),
  name: z.unknown().optional(),
  headcount: z.unknown().optional(),
  details: z.unknown().optional(),
}).passthrough();

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: positionDescriptionQuerySchema,
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: executePositionDescriptionQuery,
});

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: updatePositionDescriptionSchema,
  bodyError: "参数错误",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => updatePositionDescription(body, userId),
});
