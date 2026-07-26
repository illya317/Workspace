import { z } from "zod";

import {
  buildHrRouteCommand,
  createPosition,
  deletePosition,
  getPositionList,
  PositionCreateSchema,
  updatePosition,
} from "@workspace/hr/server";
import { readRequestExpectedVersion, routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";const positionsQuerySchema = z.object({
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
  bodySchema: PositionCreateSchema,
  buildCommand: ({ body, user }) => buildHrRouteCommand({ body, userId: user.userId }),
  action: ({ body, userId }) => createPosition(body, userId),
});

export const PUT = createCommandRoute({
  bodySchema: updatePositionBodySchema,
  bodyError: "缺少id",
  buildCommand: ({ body, user }) => buildHrRouteCommand({
    id: body.id,
    body: {
      code: body.code,
      name: body.name,
      alias: body.alias,
      departmentId: body.departmentId,
      reportToPositionId: body.reportToPositionId,
      positionDescription: body.positionDescription,
      isArchived: body.isArchived,
    },
    userId: user.userId,
  }),
  action: ({ id, body, userId }) => updatePosition(id, body, userId),
});

export const DELETE = createCommandRoute({
  querySchema: routeIdParamsSchema,
  queryError: "缺少id",
  buildCommand: ({ request, query, user }) => buildHrRouteCommand({
    userId: user.userId,
    id: query.id,
    expectedVersion: readRequestExpectedVersion(request),
  }),
  action: deletePosition,
});
