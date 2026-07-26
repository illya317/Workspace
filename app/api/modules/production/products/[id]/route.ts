import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { executeUpdateProductCommand, ProductUpdateSchema } from "@workspace/production/server";

export const PATCH = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: ProductUpdateSchema,
  paramsError: "无效产品 ID",
  buildCommand: ({ params, body, user }) => okCommand({ id: params.id, body, userId: user.userId }),
  action: executeUpdateProductCommand,
});
