import { z } from "zod";

import {
  buildHrRouteCommand,
  createCompanyRelation,
  listCompanyRelations,
  updateCompanyRelationPageDraft,
} from "@workspace/hr/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const companyRelationsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createCompanyRelationSchema = z.object({
  parentId: z.unknown(),
  childId: z.unknown(),
}).passthrough();

const updateCompanyRelationPageDraftSchema = z.object({
  changes: z.array(z.object({
    id: z.coerce.number().int().positive(),
    field: z.string().min(1),
    value: z.unknown().optional(),
    expectedVersion: z.coerce.number().int().nonnegative(),
  })).min(1).max(500),
});

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

export const PUT = createCommandRoute({
  bodySchema: updateCompanyRelationPageDraftSchema,
  bodyError: "修改内容无效",
  buildCommand: ({ body, user }) => buildHrRouteCommand({
    changes: body.changes.map((change) => ({ ...change, value: change.value ?? null })),
    userId: user.userId,
  }),
  action: updateCompanyRelationPageDraft,
});
