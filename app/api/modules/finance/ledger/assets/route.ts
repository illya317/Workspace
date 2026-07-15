import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  buildCreateFinanceAssetCardRouteCommand,
  executeCreateFinanceAssetCardRouteCommand,
  executeListFinanceAssetWorkspaceCommand,
} from "@workspace/finance/server/assets/route-commands";
import { createFinanceAssetCardSchema, financeAssetScopeSchema } from "@workspace/finance/server/assets/schemas";

export const GET = createCommandRoute({
  querySchema: financeAssetScopeSchema,
  buildCommand: ({ query }) => okCommand(query),
  action: executeListFinanceAssetWorkspaceCommand,
});

export const POST = createCommandRoute({
  bodySchema: createFinanceAssetCardSchema,
  buildCommand: ({ body, user }) => buildCreateFinanceAssetCardRouteCommand(body, user.userId),
  action: executeCreateFinanceAssetCardRouteCommand,
});
