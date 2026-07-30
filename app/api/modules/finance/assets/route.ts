import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  buildCreateFinanceAssetCardRouteCommand,
  buildUpdateFinanceAssetCardRouteCommand,
  executeCreateFinanceAssetCardRouteCommand,
  executeListFinanceAssetWorkspaceCommand,
  executeUpdateFinanceAssetCardRouteCommand,
} from "@workspace/finance/server/assets/route-commands";
import { createFinanceAssetCardSchema, financeAssetScopeSchema, updateFinanceAssetCardSchema } from "@workspace/finance/server/assets/schemas";

export const GET = createCommandRoute({
  querySchema: financeAssetScopeSchema,
  queryError: "资产会计范围参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: executeListFinanceAssetWorkspaceCommand,
});

export const POST = createCommandRoute({
  bodySchema: createFinanceAssetCardSchema,
  bodyError: "资产卡片参数无效",
  buildCommand: ({ body, user }) => buildCreateFinanceAssetCardRouteCommand(body, user.userId),
  action: executeCreateFinanceAssetCardRouteCommand,
});

export const PUT = createCommandRoute({
  bodySchema: updateFinanceAssetCardSchema,
  bodyError: "资产卡片参数无效",
  buildCommand: ({ body, user }) => buildUpdateFinanceAssetCardRouteCommand(body, user.userId),
  action: executeUpdateFinanceAssetCardRouteCommand,
});
