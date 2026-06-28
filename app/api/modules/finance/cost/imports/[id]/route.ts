import {
  buildFinanceRouteIdCommand,
  executeDeleteCostImportCommand,
  executeGetCostImportCommand,
} from "@workspace/finance/server/route-commands";
import { costImportIdSchema } from "@workspace/finance/server/cost/import-schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { checkFinanceCostAccess, checkFinanceCostDelete } from "@workspace/platform/server/auth";

export const GET = createCommandRoute({
  access: checkFinanceCostAccess,
  paramsSchema: costImportIdSchema,
  paramsError: "无效ID",
  buildCommand: ({ params }) => buildFinanceRouteIdCommand(params.id),
  action: executeGetCostImportCommand,
});

export const DELETE = createCommandRoute({
  access: checkFinanceCostDelete,
  paramsSchema: costImportIdSchema,
  paramsError: "无效ID",
  buildCommand: ({ params }) => buildFinanceRouteIdCommand(params.id),
  action: executeDeleteCostImportCommand,
});
