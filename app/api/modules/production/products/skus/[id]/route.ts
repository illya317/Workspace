import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { executeUpdateProductSkuCommand, ProductSkuUpdateSchema } from "@workspace/production/server";

export const PATCH = createCommandRoute({
  paramsSchema: routeIdParamsSchema,
  bodySchema: ProductSkuUpdateSchema,
  paramsError: "无效 SKU ID",
  buildCommand: ({ params, body, user }) => okCommand({ id: params.id, body, userId: user.userId }),
  action: executeUpdateProductSkuCommand,
});
