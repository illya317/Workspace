import { z } from "zod";

import {
  buildHrRouteCommand,
  createCompanyRelation,
  listCompanyRelations,
  replayJsonRequest,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess } from "@workspace/platform/server/auth";

const companyRelationsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createCompanyRelationSchema = z.object({
  parentId: z.unknown(),
  childId: z.unknown(),
}).passthrough();

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: companyRelationsQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand(query),
  action: listCompanyRelations,
});

export const POST = createCommandRoute({
  bodySchema: createCompanyRelationSchema,
  bodyError: "缺少 parentId/childId",
  buildCommand: ({ request, body }) => buildHrRouteCommand({ request, body }),
  action: ({ request, body }) => createCompanyRelation(replayJsonRequest(request, body)),
});
