import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceBudgetAccess, checkFinanceBudgetWrite } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { importBudgetWorkbook, loadBudgetOverview } from "@workspace/finance/server/budget/service";
import {
  budgetQuerySchema,
  createBudgetImportSchema,
} from "@workspace/finance/server/budget/schemas";

export const GET = createCommandRoute({
  access: (userId: number) => checkFinanceBudgetAccess(userId),
  querySchema: budgetQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query as Parameters<typeof loadBudgetOverview>[0]),
  action: (command) => loadBudgetOverview(command),
});

export const POST = createCommandRoute({
  access: (userId: number) => checkFinanceBudgetWrite(userId),
  bodySchema: createBudgetImportSchema,
  bodyError: "year 为必填",
  buildCommand: ({ body }) => okCommand(body as Parameters<typeof importBudgetWorkbook>[0]),
  action: async (command) => ({ success: true, ...(await importBudgetWorkbook(command)) }),
});
