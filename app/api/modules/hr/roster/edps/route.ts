import { z } from "zod";

import { buildHrRouteCommand, createEdp, EDPCreateSchema, listEdps } from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";const edpsQuerySchema = z.object({
  keyword: z.string().catch(""),
  isActive: z.string().nullable().optional(),
  company: z.string().catch(""),
  department: z.string().catch(""),
  position: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: edpsQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: listEdps,
});

export const POST = createCommandRoute({
  bodySchema: EDPCreateSchema,
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => createEdp(body, userId),
});
