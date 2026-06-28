import { okCommand } from "@workspace/platform/server/domain-validation";
import { checkFinanceCostAccess } from "@workspace/platform/server/auth";
import { createCommandRoute } from "@workspace/platform/server/api-route";
import { costQuerySchema, getCostSummary } from "@workspace/finance/server/cost";

export const GET = createCommandRoute({
  access: checkFinanceCostAccess,
  querySchema: costQuerySchema,
  queryError: "参数无效",
  buildCommand: ({ query }) => okCommand(query),
  action: async (command) => ({ success: true, data: await getCostSummary(command) }),
});
