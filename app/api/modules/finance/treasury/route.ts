import { createCommandRoute } from "@workspace/platform/server/api-route";
import { okCommand } from "@workspace/platform/server/domain-validation";
import {
  buildTreasuryCreateRouteCommand,
  buildTreasuryUpdateRouteCommand,
  executeListTreasuryWorkspaceCommand,
  executeTreasuryCreateRouteCommand,
  executeTreasuryUpdateRouteCommand,
} from "@workspace/finance/server/treasury/route-commands";
import {
  treasuryCreateSchema,
  treasuryScopeSchema,
  treasuryUpdateSchema,
} from "@workspace/finance/server/treasury/schemas";

export const GET = createCommandRoute({
  querySchema: treasuryScopeSchema,
  queryError: "资金管理范围参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: executeListTreasuryWorkspaceCommand,
});

export const POST = createCommandRoute({
  bodySchema: treasuryCreateSchema,
  bodyError: "资金管理新增参数无效",
  buildCommand: ({ body, user }) => buildTreasuryCreateRouteCommand(body, user.userId),
  action: executeTreasuryCreateRouteCommand,
});

export const PUT = createCommandRoute({
  bodySchema: treasuryUpdateSchema,
  bodyError: "资金管理更新参数无效",
  buildCommand: ({ body, user }) => buildTreasuryUpdateRouteCommand(body, user.userId),
  action: executeTreasuryUpdateRouteCommand,
});
