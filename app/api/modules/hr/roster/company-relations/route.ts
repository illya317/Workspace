import { z } from "zod";

import {
  buildHrRouteCommand,
  createCompanyRelation,
  listCompanyRelations,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";const companyRelationsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createCompanyRelationSchema = z.object({
  parentId: z.unknown(),
  childId: z.unknown(),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: companyRelationsQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: listCompanyRelations,
});

export const POST = createCommandRoute({
  bodySchema: createCompanyRelationSchema,
  bodyError: "缺少 parentId/childId",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ userId: user.userId, body }),
  action: createCompanyRelation,
});
