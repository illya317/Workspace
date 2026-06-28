import { z } from "zod";

import {
  buildCreateProjectRouteCommand,
  buildListProjectsRouteCommand,
  executeCreateProjectRouteCommand,
  executeListProjectsRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const projectsQuerySchema = z.object({
  keyword: z.string().catch(""),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(500).catch(50),
  archived: z.enum(["1", "true"]).optional().catch(undefined),
});

const projectBodySchema = z.object({}).passthrough();

export const GET = createCommandRoute({
  querySchema: projectsQuerySchema,
  buildCommand: ({ query, user }) => buildListProjectsRouteCommand({
    userId: user.userId,
    query: {
      keyword: query.keyword,
      page: query.page,
      pageSize: query.pageSize,
      archived: query.archived === "1" || query.archived === "true",
    },
  }),
  action: executeListProjectsRouteCommand,
});

export const POST = createCommandRoute({
  bodySchema: projectBodySchema,
  bodyError: "请求体必须是合法 JSON",
  buildCommand: ({ body, request, user }) => buildCreateProjectRouteCommand({
    request,
    userId: user.userId,
    body,
  }),
  action: executeCreateProjectRouteCommand,
});
