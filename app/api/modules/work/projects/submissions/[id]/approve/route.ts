import { z } from "zod";
import {
  buildProjectSubmissionActionRouteCommand,
  executeApproveProjectSubmissionRouteCommand,
} from "@workspace/work/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const bodySchema = z.object({
  comment: z.string().nullable().optional(),
  version: z.coerce.number().nullable().optional(),
}).strict().optional();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目确认单 ID 无效",
  bodySchema,
  optionalJsonBody: true,
  bodyError: "确认参数无效",
  buildCommand: ({ params, body, user }) => buildProjectSubmissionActionRouteCommand({ userId: user.userId, requestId: params.id, body }),
  action: executeApproveProjectSubmissionRouteCommand,
});
