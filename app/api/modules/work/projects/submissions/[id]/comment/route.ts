import { z } from "zod";
import {
  buildProjectSubmissionActionRouteCommand,
  executeCommentProjectSubmissionRouteCommand,
} from "@workspace/work/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const bodySchema = z.object({
  comment: z.string().min(1),
  version: z.coerce.number().nullable().optional(),
}).strict();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "项目确认单 ID 无效",
  bodySchema,
  bodyError: "评论参数无效",
  buildCommand: ({ params, body, user }) => buildProjectSubmissionActionRouteCommand({ userId: user.userId, requestId: params.id, body }),
  action: executeCommentProjectSubmissionRouteCommand,
});
