import {
  buildFinanceRouteIdCommand,
  executeDeleteCostImportCommand,
  executeGetCostImportCommand,
} from "@workspace/finance/server/route-commands";
import { costImportIdSchema } from "@workspace/finance/server/cost/import-schemas";
import { createCommandRoute } from "@workspace/platform/server/api-route";export const GET = createCommandRoute({
  paramsSchema: costImportIdSchema,
  paramsError: "无效ID",
  buildCommand: ({ params }) => buildFinanceRouteIdCommand(params.id),
  action: executeGetCostImportCommand,
});

export const DELETE = createCommandRoute({
  paramsSchema: costImportIdSchema,
  paramsError: "无效ID",
  buildCommand: ({ params }) => buildFinanceRouteIdCommand(params.id),
  action: executeDeleteCostImportCommand,
});
