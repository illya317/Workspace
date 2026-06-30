import { z } from "zod";

import {
  buildHrRouteCommand,
  createPosition,
  deletePositionByParams,
  getPositionList,
  idParams,
  PositionCreateSchema,
  updatePosition,
} from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkHRAccess, checkHRDelete, checkHRWrite } from "@workspace/platform/server/auth";

const positionsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
  archived: z.enum(["1", "true"]).optional().catch(undefined),
  summary: z.enum(["1", "true"]).optional().catch(undefined),
}).passthrough();

const updatePositionBodySchema = PositionCreateSchema.partial().extend({
  id: z.coerce.number().int().positive(),
  isArchived: z.boolean().optional(),
}).passthrough();

export const GET = createCommandRoute({
  access: (userId: number) => checkHRAccess(userId, "access", "hr.roster"),
  querySchema: positionsQuerySchema,
  buildCommand: ({ query }) => buildHrRouteCommand({
    keyword: query.keyword,
    page: query.page,
    pageSize: query.pageSize,
    archived: Boolean(query.archived),
    summary: Boolean(query.summary),
  }),
  action: ({ keyword, page, pageSize, archived, summary }) => getPositionList(keyword, page, pageSize, archived, summary),
});

export const POST = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: PositionCreateSchema,
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => createPosition(body, userId),
});

export const PUT = createCommandRoute({
  access: (userId: number) => checkHRWrite(userId, "hr.roster"),
  bodySchema: updatePositionBodySchema,
  bodyError: "缺少id",
  buildCommand: ({ body, user }) => buildHrRouteCommand({
    id: body.id,
    body: {
      code: body.code,
      name: body.name,
      alias: body.alias,
      departmentId: body.departmentId,
      positionDescriptionId: body.positionDescriptionId,
      positionDescription: body.positionDescription,
      isArchived: body.isArchived,
    },
    userId: user.userId,
  }),
  action: ({ id, body, userId }) => updatePosition(id, body, userId),
});

export const DELETE = createCommandRoute({
  access: (userId: number) => checkHRDelete(userId, "hr.roster"),
  querySchema: routeIdParamsSchema,
  queryError: "缺少id",
  buildCommand: ({ request, query }) => buildHrRouteCommand({ request, id: query.id }),
  action: ({ request, id }) => deletePositionByParams(request, idParams(id)),
});
