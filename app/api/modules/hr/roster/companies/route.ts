import { z } from "zod";

import {
  buildHrRouteCommand,
  createCompany,
  deleteCompanyByParams,
  idParams,
  listCompanies,
  replayJsonRequest,
  upsertCompany,
} from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRDelete, checkHRWrite } from "@workspace/platform/server/auth";

const companiesQuerySchema = z.object({
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
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
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
  buildCommand: ({ request, body }) => buildHrRouteCommand({ request, body }),
  action: ({ request, body }) => createCompany(replayJsonRequest(request, body)),
});

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: upsertCompanySchema,
  bodyError: "缺少 code/name",
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => upsertCompany(body, userId),
});

export const DELETE = createCommandRoute({
  access: (userId: number) => checkHRDelete(userId, "hr.roster"),
  querySchema: routeIdParamsSchema,
  queryError: "缺少id",
  buildCommand: ({ request, query }) => buildHrRouteCommand({ request, id: query.id }),
  action: ({ request, id }) => deleteCompanyByParams(request, idParams(id)),
});
