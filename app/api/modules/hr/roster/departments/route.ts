import { z } from "zod";

import { buildHrRouteCommand, createDepartment, deleteDepartmentByParams, idParams, listDepartments, updateDepartment } from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRDelete, checkHRWrite } from "@workspace/platform/server/auth";

const departmentsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
  archived: z.enum(["1", "true"]).optional().catch(undefined),
  summary: z.enum(["1", "true"]).optional().catch(undefined),
}).passthrough();

const departmentBodySchema = z.object({}).passthrough();

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: departmentsQuerySchema,
  buildCommand: ({ query }) => buildHrRouteCommand({
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize,
    archived: Boolean(query.archived),
    summary: Boolean(query.summary),
  }),
  action: listDepartments,
});

export const POST = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: departmentBodySchema,
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => createDepartment(body, userId),
});

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: departmentBodySchema,
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => updateDepartment(body, userId),
});

export const DELETE = createCommandRoute({
  access: (userId: number) => checkHRDelete(userId, "hr.roster"),
  querySchema: routeIdParamsSchema,
  queryError: "缺少id",
  buildCommand: ({ request, query }) => buildHrRouteCommand({ request, id: query.id }),
  action: ({ request, id }) => deleteDepartmentByParams(request, idParams(id)),
});
