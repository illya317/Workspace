import { z } from "zod";

import {
  buildHrRouteCommand,
  createCompany,
  deleteCompany,
  listCompanies,
  upsertCompany,
} from "@workspace/hr/server";
import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";const companiesQuerySchema = z.object({
  keyword: z.string().catch(""),
  active: z.string().optional(),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
}).passthrough();

const createCompanySchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

const upsertCompanySchema = z.object({
  id: z.unknown().optional(),
  code: z.string().min(1),
  name: z.string().min(1),
}).passthrough();

export const GET = createCommandRoute({
  querySchema: companiesQuerySchema,
  queryError: "参数错误",
  buildCommand: ({ query }) => buildHrRouteCommand({
    keyword: query.keyword,
    activeOnly: query.active === "1",
    page: query.page,
    pageSize: query.pageSize,
  }),
  action: listCompanies,
});

export const POST = createCommandRoute({
  bodySchema: createCompanySchema,
  bodyError: "缺少 code/name",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ userId: user.userId, body }),
  action: createCompany,
});

export const PUT = createCommandRoute({
  bodySchema: upsertCompanySchema,
  bodyError: "缺少 code/name",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => upsertCompany(body, userId),
});

export const DELETE = createCommandRoute({
  querySchema: routeIdParamsSchema,
  queryError: "缺少id",
  buildCommand: ({ request, query, user }) => buildHrRouteCommand({
    userId: user.userId,
    id: query.id,
    expectedVersion: readRequestExpectedVersion(request),
  }),
  action: deleteCompany,
});
