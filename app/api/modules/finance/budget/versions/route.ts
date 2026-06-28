import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceBudgetAccess, checkFinanceBudgetWrite } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { listBudgetVersions, createBudgetVersion } from "@workspace/finance/server/budget/budget-version";
import {
  budgetVersionQuerySchema,
  createBudgetVersionSchema,
} from "@workspace/finance/server/budget/schemas";

export const GET = createCommandRoute({
  access: checkFinanceBudgetAccess,
  querySchema: budgetVersionQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: async (command) => ({
    versions: await listBudgetVersions(command.year, command.companyCode),
  }),
});

export const POST = createCommandRoute({
  access: checkFinanceBudgetWrite,
  bodySchema: createBudgetVersionSchema,
  bodyError: "year 和 name 为必填",
  buildCommand: ({ body }) => okCommand(body),
  action: async (command) => ({ version: await createBudgetVersion(command) }),
});
