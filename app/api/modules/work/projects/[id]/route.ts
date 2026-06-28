import { z } from "zod";

import {
  buildProjectIdRouteCommand,
  executeDeleteProjectRouteCommand,
  executeUpdateProjectRouteCommand,
} from "@workspace/work/server";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const projectParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const projectBodySchema = z.object({}).passthrough();

export const PUT = createCommandRoute({
  paramsSchema: projectParamsSchema,
  paramsError: "ID 无效",
  bodySchema: projectBodySchema,
  bodyError: "请求体必须是合法 JSON",
  buildCommand: ({ params, body, request }) => buildProjectIdRouteCommand({
    id: params.id,
    request,
    body,
  }),
  action: executeUpdateProjectRouteCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema: projectParamsSchema,
  paramsError: "ID 无效",
  buildCommand: ({ params, request }) => buildProjectIdRouteCommand({
    id: params.id,
    request,
  }),
  action: executeDeleteProjectRouteCommand,
});
