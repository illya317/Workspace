import { routeIdParamsSchema } from "@workspace/platform/server/api";
import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceBudgetWrite } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { activateBudgetVersion } from "@workspace/finance/server/budget/budget-version";

export const POST = createCommandRoute({
  access: checkFinanceBudgetWrite,
  paramsSchema: routeIdParamsSchema,
  paramsError: "无效ID",
  buildCommand: ({ params }) => okCommand({ id: params.id }),
  action: async (command) => ({
    success: true,
    version: await activateBudgetVersion(command.id),
  }),
});
