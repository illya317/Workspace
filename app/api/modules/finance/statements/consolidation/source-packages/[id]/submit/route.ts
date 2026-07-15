import { z } from "zod";

import {
  buildSubmitStatementSourcePackageRouteCommand,
  executeSubmitStatementSourcePackageRouteCommand,
} from "@workspace/finance/server/statements/source-package-route-commands";
import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";

const submitSchema = z.object({
  expectedVersion: z.number().int().positive(),
  note: z.string().trim().max(1000).nullable().optional(),
});

export const POST = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: submitSchema,
  paramsError: "来源包 ID 无效",
  bodyError: "来源包提交参数无效",
  buildCommand: ({ body, params, user }) => buildSubmitStatementSourcePackageRouteCommand(
    params.id,
    body,
    user.userId,
  ),
  action: executeSubmitStatementSourcePackageRouteCommand,
});
