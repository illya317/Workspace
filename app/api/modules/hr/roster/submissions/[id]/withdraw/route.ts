import { z } from "zod";

import {
  buildHrDepartmentSubmissionActionRouteCommand,
  executeWithdrawHrDepartmentSubmissionRouteCommand,
} from "@workspace/hr/server";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const actionBodySchema = z.object({
  comment: z.string().nullable().optional(),
  version: z.coerce.number().nullable().optional(),
}).optional();

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  paramsError: "流程单 ID 无效",
  bodySchema: actionBodySchema,
  optionalJsonBody: true,
  bodyError: "流程动作参数无效",
  buildCommand: ({ params, body, user }) => buildHrDepartmentSubmissionActionRouteCommand({
    userId: user.userId,
    requestId: params.id,
    body,
  }),
  action: executeWithdrawHrDepartmentSubmissionRouteCommand,
});
