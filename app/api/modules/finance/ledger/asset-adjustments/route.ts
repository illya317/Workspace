import { createCommandRoute } from "@workspace/platform/server/api-route";
import { buildCreateFinanceAssetAdjustmentRouteCommand, executeCreateFinanceAssetAdjustmentRouteCommand } from "@workspace/finance/server/assets/route-commands";
import { createFinanceAssetAdjustmentSchema } from "@workspace/finance/server/assets/schemas";

export const POST = createCommandRoute({
  bodySchema: createFinanceAssetAdjustmentSchema,
  buildCommand: ({ body, user }) => buildCreateFinanceAssetAdjustmentRouteCommand(body, user.userId),
  action: executeCreateFinanceAssetAdjustmentRouteCommand,
});
